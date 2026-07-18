import { Injectable } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import type { InvoiceStatus } from '@frontcore/database';
import { DashboardService } from '../../dashboard/dashboard.service';
import type { FinancialDashboardSummary, LargestInvoice } from '../../dashboard/dashboard.service';
import { FinancialEntityResolverService } from './entity-resolver.service';
import { resolveFinancialIntent } from './financial-intent.resolver';
import type { FinancialIntentResolution, FinancialIntentType } from './financial-intent.resolver';
import { resolveFinancialPeriod } from './financial-period.resolver';
import type { FinancialPeriodResolution } from './financial-period.resolver';
import { resolveFinancialPeriodPair } from './financial-period-pair.resolver';
import { hasContinuationSignal } from './continuation-signal';
import { resolveStatusFilter } from './financial-filter.extractor';
import { compareAmount, compareCount } from '../../dashboard/period-comparison.util';
import type { PeriodComparisonValue } from '../../dashboard/period-comparison.util';

/** "Por pagar" = Pendente + Vencida — nunca inclui Paga. Mesma definição já usada pelo contexto do Chat IA (Fase 8). */
const OUTSTANDING_STATUSES = new Set<string>(['PENDING', 'OVERDUE']);

/**
 * Compara dois nomes de entidade (fornecedor/categoria) de forma
 * insensível a maiúsculas/acentos — usado só para detetar a colisão
 * real confirmada empiricamente (Fase 8.4): uma organização pode ter um
 * fornecedor e uma categoria com o mesmo nome (ex. "Hetzner" como
 * fornecedor e como categoria), nunca deve resultar num filtro AND
 * (fornecedor=X **e** categoria=X) que nenhum utilizador pediu.
 */
function sameEntityName(a: string, b: string): boolean {
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  return normalize(a) === normalize(b);
}

export type FinancialIntentData =
  | { intent: 'FINANCIAL_SUMMARY'; totals: FinancialDashboardSummary['totals'] }
  | { intent: 'OUTSTANDING_BALANCE'; outstandingCount: number; outstandingAmount: string }
  | { intent: 'BY_STATUS'; byStatus: FinancialDashboardSummary['byStatus'] }
  | { intent: 'BY_CATEGORY'; byCategory: FinancialDashboardSummary['byCategory'] }
  | { intent: 'TOP_SUPPLIERS'; topSuppliers: FinancialDashboardSummary['topSuppliers'] }
  | { intent: 'MONTHLY_TREND'; monthlyTrend: FinancialDashboardSummary['monthlyTrend'] }
  | { intent: 'LARGEST_INVOICES'; invoices: LargestInvoice[] }
  | {
      intent: 'PERIOD_COMPARISON';
      current: { period: { from: string; to: string }; totals: FinancialDashboardSummary['totals'] };
      previous: { period: { from: string; to: string }; totals: FinancialDashboardSummary['totals'] };
      comparison: { totalAmount: PeriodComparisonValue; activeInvoiceCount: PeriodComparisonValue };
    };

/** Filtros combinados resolvidos (Fase 8.4) — nomes já prontos para texto (nunca ids expostos ao provider). */
export interface ResolvedFinancialFilters {
  status?: InvoiceStatus;
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  categoryName?: string;
}

export type FinancialRetrievalResult =
  | { kind: 'UNSUPPORTED' }
  | { kind: 'PERIOD_MISSING' }
  | { kind: 'PERIOD_AMBIGUOUS' }
  | { kind: 'ENTITY_AMBIGUOUS' }
  | { kind: 'ERROR' }
  | { kind: 'DATA'; period: { from: string; to: string }; data: FinancialIntentData; filters: ResolvedFinancialFilters };

/**
 * Retrieval financeiro estruturado do Chat IA (Fase 8.1, reforçado na
 * Fase 8.3, com filtros combinados e continuidade conversacional
 * estruturada na Fase 8.4) — substitui o resumo fixo do período por
 * omissão (Fase 8) por uma consulta deterministicamente selecionada
 * com base na intenção, período e filtros da mensagem do utilizador.
 * Nunca conhece o provider, nunca aceita `organizationId` do pedido do
 * utilizador (só do chamador autenticado), nunca acede ao Prisma
 * diretamente — reutiliza exclusivamente `DashboardService` (Fase 7,
 * filtros fechados na Fase 8.4) e `FinancialEntityResolverService`
 * (Fase 8.4, nome de fornecedor/categoria → id).
 *
 * Fase 8.3 — recuperação por histórico: quando a mensagem atual não
 * tem intenção OU período resolvíveis sozinha, mas o outro dos dois
 * resolve com sucesso, procura na janela de mensagens recentes já
 * carregada (a mesma enviada ao provider, nunca mais longe) uma
 * mensagem anterior que resolva a peça em falta.
 *
 * Fase 8.4 — filtros (estado/fornecedor/categoria) são resolvidos
 * sempre a partir da mensagem atual; só recuperados do histórico
 * quando a mensagem atual sinaliza explicitamente uma continuação
 * (`hasContinuationSignal()`) — nunca herdados silenciosamente numa
 * pergunta nova e independente. Quando a mensagem atual já resolve o
 * seu próprio filtro numa dimensão (ex. menciona outro fornecedor),
 * esse valor substitui sempre o herdado dessa mesma dimensão — nunca
 * combina dois filtros incompatíveis na mesma dimensão.
 *
 * Fase 8.5 — o filtro de estado deixou de depender da resolução de
 * intenção: `resolveStatusFilter()` (`financial-filter.extractor.ts`)
 * é a única fonte de verdade, aplicada diretamente sobre a mensagem
 * atual e sobre cada mensagem do histórico na recuperação — nunca lida
 * a partir de `FinancialIntentResolution`, que já não a transporta.
 * Isto garante que uma continuação sem verbo de contagem nem intenção
 * própria (ex. "só as pagas") ainda assim aplica o estado da mensagem
 * atual, nunca o herdado.
 *
 * Fase 8.6 — comparação entre dois períodos explicitamente nomeados na
 * mesma mensagem (`PERIOD_COMPARISON`, `resolvePeriodComparison()`) —
 * fluxo próprio, à parte de `resolveDataForPeriod()`, nunca recupera por
 * histórico (comparação relativa a um período discutido antes fica fora
 * do âmbito, candidata a fase futura).
 */
@Injectable()
export class FinancialRetrievalService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly entityResolver: FinancialEntityResolverService,
  ) {}

  async retrieve(
    organizationId: string,
    message: string,
    recentUserMessages: string[] = [],
    now: Date = new Date(),
  ): Promise<FinancialRetrievalResult> {
    let intentResolution = resolveFinancialIntent(message);
    const currentPeriodResolution = resolveFinancialPeriod(message, now);
    const isContinuation = hasContinuationSignal(message);

    // Tenta recuperar a intenção de uma mensagem anterior quando a
    // mensagem atual, sozinha, já tem um período válido (ex. "sim este
    // mês", Fase 8.3) OU quando sinaliza explicitamente uma continuação
    // (ex. "E só da Hetzner?", Fase 8.4 — nem intenção nem período
    // próprios, mas depende inteiramente do histórico). Nunca quando a
    // mensagem atual não dá nenhum sinal.
    if (intentResolution.kind === 'UNSUPPORTED' && (currentPeriodResolution.kind === 'RESOLVED' || isContinuation)) {
      const recoveredIntent = this.recoverIntent(recentUserMessages);
      if (recoveredIntent) {
        intentResolution = recoveredIntent;
      }
    }

    if (intentResolution.kind === 'UNSUPPORTED') {
      return { kind: 'UNSUPPORTED' };
    }

    const filters = await this.resolveFilters(organizationId, message, recentUserMessages, isContinuation);
    if (filters === 'AMBIGUOUS') {
      return { kind: 'ENTITY_AMBIGUOUS' };
    }

    // Fase 8.6 — fluxo próprio, nunca `resolveDataForPeriod()`: precisa de
    // dois períodos resolvidos a partir do texto da mensagem, nunca de um
    // único `FinancialPeriodResolution` já calculado acima. Nunca recupera
    // por histórico (decisão desta fase — comparação relativa a um
    // período discutido antes fica fora do âmbito).
    if (intentResolution.intent === 'PERIOD_COMPARISON') {
      return this.resolvePeriodComparison(organizationId, message, filters, now);
    }

    let periodResolution = currentPeriodResolution;
    if (periodResolution.kind !== 'RESOLVED') {
      const recoveredPeriod = this.recoverPeriod(recentUserMessages, now);
      if (recoveredPeriod) {
        periodResolution = recoveredPeriod;
      }
    }

    return this.resolveDataForPeriod(organizationId, intentResolution.intent, periodResolution, filters);
  }

  /**
   * Variante usada pelas AI Tools (Fase 8.3, filtros opcionais na Fase
   * 8.4) — a intenção já é conhecida (qual tool foi chamada), o período
   * e os filtros vêm em texto livre (argumentos estruturados da tool,
   * ex. `{ period: "este mês", status: "PAID", supplierName: "Hetzner" }`).
   * Reutiliza exatamente o mesmo resolvedor de período e o mesmo
   * `DashboardService`/`selectData()` do caminho principal — nunca uma
   * segunda fonte de verdade. Nunca recupera por histórico (a tool já
   * recebeu os argumentos que o modelo decidiu passar; recuperação por
   * histórico é só para o caminho de regex sem tools). `intent` exclui
   * `PERIOD_COMPARISON` (Fase 8.6) — sem tool associada nesta fase (ver
   * `docs/phases/phase-8.6-financial-period-comparison-foundation.md`,
   * "fora do âmbito"); precisa de dois períodos de texto, não um, por
   * isso não cabe na forma desta variante.
   */
  async retrieveForIntent(
    organizationId: string,
    intent: Exclude<FinancialIntentType, 'PERIOD_COMPARISON'>,
    periodText: string,
    rawFilters: { status?: InvoiceStatus; supplierName?: string; categoryName?: string } = {},
    now: Date = new Date(),
  ): Promise<FinancialRetrievalResult> {
    const periodResolution = resolveFinancialPeriod(periodText, now);
    const filters = await this.resolveNamedFilters(organizationId, rawFilters);
    if (filters === 'AMBIGUOUS') {
      return { kind: 'ENTITY_AMBIGUOUS' };
    }
    return this.resolveDataForPeriod(organizationId, intent, periodResolution, filters);
  }

  private async resolveDataForPeriod(
    organizationId: string,
    intent: Exclude<FinancialIntentType, 'PERIOD_COMPARISON'>,
    periodResolution: FinancialPeriodResolution,
    filters: ResolvedFinancialFilters,
  ): Promise<FinancialRetrievalResult> {
    if (periodResolution.kind === 'MISSING') {
      return { kind: 'PERIOD_MISSING' };
    }
    if (periodResolution.kind === 'AMBIGUOUS') {
      return { kind: 'PERIOD_AMBIGUOUS' };
    }

    const dashboardQuery = {
      from: periodResolution.period.from,
      to: periodResolution.period.to,
      status: filters.status,
      supplierId: filters.supplierId,
      categoryId: filters.categoryId,
    };

    try {
      if (intent === 'LARGEST_INVOICES') {
        const { period, invoices } = await this.dashboardService.getLargestInvoices(organizationId, dashboardQuery);
        return { kind: 'DATA', period, data: { intent, invoices }, filters };
      }

      const summary = await this.dashboardService.getFinancialSummary(organizationId, dashboardQuery);
      return {
        kind: 'DATA',
        period: { from: summary.period.from, to: summary.period.to },
        data: this.selectData(intent, summary),
        filters,
      };
    } catch {
      return { kind: 'ERROR' };
    }
  }

  /**
   * Comparação entre dois períodos explicitamente nomeados na mesma
   * mensagem (Fase 8.6) — nunca `resolveDataForPeriod()`: precisa de
   * dois períodos, não um. Reutiliza exclusivamente
   * `resolveFinancialPeriodPair()` (Fase 8.6, dois lados resolvidos por
   * `resolveFinancialPeriod()`, a mesma fonte de verdade de período do
   * caminho principal) e `DashboardService.getFinancialSummary()` (Fase
   * 7, chamado duas vezes, nunca uma segunda query de agregação). A
   * matemática da comparação (`compareAmount()`/`compareCount()`,
   * extraída de `ReportsService` na mesma fase) nunca é recalculada nem
   * estimada pelo LLM — os dois totais e a diferença já vêm prontos no
   * bloco `DATA`, o provider só os apresenta em texto.
   */
  private async resolvePeriodComparison(
    organizationId: string,
    message: string,
    filters: ResolvedFinancialFilters,
    now: Date,
  ): Promise<FinancialRetrievalResult> {
    const pairResolution = resolveFinancialPeriodPair(message, now);
    if (pairResolution.kind === 'MISSING') {
      return { kind: 'PERIOD_MISSING' };
    }
    if (pairResolution.kind === 'AMBIGUOUS') {
      return { kind: 'PERIOD_AMBIGUOUS' };
    }

    const dashboardFilters = { status: filters.status, supplierId: filters.supplierId, categoryId: filters.categoryId };
    try {
      const [currentSummary, previousSummary] = await Promise.all([
        this.dashboardService.getFinancialSummary(organizationId, {
          from: pairResolution.current.from,
          to: pairResolution.current.to,
          ...dashboardFilters,
        }),
        this.dashboardService.getFinancialSummary(organizationId, {
          from: pairResolution.previous.from,
          to: pairResolution.previous.to,
          ...dashboardFilters,
        }),
      ]);

      return {
        kind: 'DATA',
        period: { from: currentSummary.period.from, to: currentSummary.period.to },
        data: {
          intent: 'PERIOD_COMPARISON',
          current: { period: currentSummary.period, totals: currentSummary.totals },
          previous: { period: previousSummary.period, totals: previousSummary.totals },
          comparison: {
            totalAmount: compareAmount(currentSummary.totals.totalAmount, previousSummary.totals.totalAmount),
            activeInvoiceCount: compareCount(
              currentSummary.totals.activeInvoiceCount,
              previousSummary.totals.activeInvoiceCount,
            ),
          },
        },
        filters,
      };
    } catch {
      return { kind: 'ERROR' };
    }
  }

  /** Mensagem anterior mais recente (ordem: mais recente primeiro) cuja intenção resolve com sucesso — nunca a mais antiga. */
  private recoverIntent(recentUserMessages: string[]): Extract<FinancialIntentResolution, { kind: 'SUPPORTED' }> | null {
    for (const pastMessage of recentUserMessages) {
      const resolution = resolveFinancialIntent(pastMessage);
      if (resolution.kind === 'SUPPORTED') {
        return resolution;
      }
    }
    return null;
  }

  /** Mensagem anterior mais recente cujo período resolve com sucesso — nunca a mais antiga. */
  private recoverPeriod(recentUserMessages: string[], now: Date): Extract<FinancialPeriodResolution, { kind: 'RESOLVED' }> | null {
    for (const pastMessage of recentUserMessages) {
      const resolution = resolveFinancialPeriod(pastMessage, now);
      if (resolution.kind === 'RESOLVED') {
        return resolution;
      }
    }
    return null;
  }

  /**
   * Resolve os filtros (Fase 8.4, extração de estado separada da
   * intenção na Fase 8.5) da mensagem atual — `status` vem sempre
   * diretamente de `resolveStatusFilter(message)` (nunca de
   * `intentResolution`, que já não o transporta); fornecedor/categoria
   * exigem uma consulta real (`FinancialEntityResolverService`). Só
   * recupera do histórico quando a mensagem atual sinaliza uma
   * continuação explícita — nunca por omissão. O filtro de cada
   * dimensão que a mensagem atual já resolve por si (estado, fornecedor
   * ou categoria) tem sempre prioridade sobre o herdado — nunca é
   * substituído, só complementado nas dimensões que a mensagem atual
   * não menciona.
   */
  private async resolveFilters(
    organizationId: string,
    message: string,
    recentUserMessages: string[],
    hasContinuationSignal: boolean,
  ): Promise<ResolvedFinancialFilters | 'AMBIGUOUS'> {
    const filters: ResolvedFinancialFilters = {};
    const currentStatus = resolveStatusFilter(message);
    if (currentStatus) {
      filters.status = currentStatus;
    }

    const [supplierMention, categoryMention] = await Promise.all([
      this.entityResolver.resolveSupplierMention(organizationId, message),
      this.entityResolver.resolveCategoryMention(organizationId, message),
    ]);
    if (supplierMention.kind === 'AMBIGUOUS' || categoryMention.kind === 'AMBIGUOUS') {
      return 'AMBIGUOUS';
    }
    if (supplierMention.kind === 'RESOLVED') {
      filters.supplierId = supplierMention.id;
      filters.supplierName = supplierMention.name;
    }
    // Um fornecedor e uma categoria com o mesmo nome real (confirmado
    // empiricamente: organizações reais podem ter ambos, ex. "Hetzner"
    // como fornecedor e como categoria) nunca são combinados como dois
    // filtros AND independentes a partir da mesma menção — isso
    // restringiria silenciosamente a um subconjunto que o utilizador
    // nunca pediu (faturas do fornecedor X *e também* da categoria X).
    // O fornecedor prevalece — é a leitura mais provável de uma única
    // menção nomeada, mesma prioridade já usada por
    // `TOP_SUPPLIERS_PATTERN` sobre `BY_CATEGORY_PATTERN`.
    if (
      categoryMention.kind === 'RESOLVED' &&
      !(supplierMention.kind === 'RESOLVED' && sameEntityName(supplierMention.name, categoryMention.name))
    ) {
      filters.categoryId = categoryMention.id;
      filters.categoryName = categoryMention.name;
    }

    if (hasContinuationSignal) {
      const recovered = await this.recoverFilters(organizationId, recentUserMessages);
      // A mensagem atual, quando indica o seu próprio filtro numa
      // dimensão, substitui sempre o herdado dessa mesma dimensão —
      // nunca combina dois valores incompatíveis na mesma dimensão.
      if (!filters.status && recovered.status) {
        filters.status = recovered.status;
      }
      if (!filters.supplierId && recovered.supplierId) {
        filters.supplierId = recovered.supplierId;
        filters.supplierName = recovered.supplierName;
      }
      if (!filters.categoryId && recovered.categoryId) {
        filters.categoryId = recovered.categoryId;
        filters.categoryName = recovered.categoryName;
      }
    }

    return filters;
  }

  /**
   * Nomes de fornecedor/categoria vindos de uma tool (Fase 8.3/8.4) —
   * texto livre decidido pelo modelo, nunca um id (o `organizationId`
   * nunca é declarado nem lido dos argumentos da tool; nomes de
   * entidade têm sempre de passar pela mesma resolução segura, nunca
   * confiados diretamente).
   */
  private async resolveNamedFilters(
    organizationId: string,
    rawFilters: { status?: InvoiceStatus; supplierName?: string; categoryName?: string },
  ): Promise<ResolvedFinancialFilters | 'AMBIGUOUS'> {
    const filters: ResolvedFinancialFilters = { status: rawFilters.status };

    if (rawFilters.supplierName) {
      const resolution = await this.entityResolver.resolveSupplierMention(organizationId, rawFilters.supplierName);
      if (resolution.kind === 'AMBIGUOUS') return 'AMBIGUOUS';
      if (resolution.kind === 'RESOLVED') {
        filters.supplierId = resolution.id;
        filters.supplierName = resolution.name;
      }
    }
    // Mesma regra de prioridade do caminho por regex — nunca combinar um
    // fornecedor e uma categoria com o mesmo nome real como dois filtros
    // AND independentes.
    if (rawFilters.categoryName && !(filters.supplierName && sameEntityName(filters.supplierName, rawFilters.categoryName))) {
      const resolution = await this.entityResolver.resolveCategoryMention(organizationId, rawFilters.categoryName);
      if (resolution.kind === 'AMBIGUOUS') return 'AMBIGUOUS';
      if (resolution.kind === 'RESOLVED') {
        filters.categoryId = resolution.id;
        filters.categoryName = resolution.name;
      }
    }

    return filters;
  }

  /**
   * Filtros de uma mensagem anterior (Fase 8.4) — para na primeira
   * (mais recente) que resolve pelo menos um filtro, nunca combina
   * filtros de mensagens diferentes (mantém o custo de I/O previsível:
   * no máximo `recentUserMessages.length` pares de consultas, tipico
   * 1 iteração numa continuação real). Documentado como limitação
   * conhecida — ver `docs/phases/phase-8.4-*.md`.
   */
  private async recoverFilters(organizationId: string, recentUserMessages: string[]): Promise<ResolvedFinancialFilters> {
    for (const pastMessage of recentUserMessages) {
      const status = resolveStatusFilter(pastMessage);
      const [supplierMention, categoryMention] = await Promise.all([
        this.entityResolver.resolveSupplierMention(organizationId, pastMessage),
        this.entityResolver.resolveCategoryMention(organizationId, pastMessage),
      ]);
      const supplier = supplierMention.kind === 'RESOLVED' ? supplierMention : undefined;
      const category = categoryMention.kind === 'RESOLVED' ? categoryMention : undefined;
      if (status || supplier || category) {
        return {
          status,
          supplierId: supplier?.id,
          supplierName: supplier?.name,
          categoryId: category?.id,
          categoryName: category?.name,
        };
      }
    }
    return {};
  }

  /** Seleciona só o subconjunto de `summary` relevante para a intenção — nunca envia ao provider blocos que a pergunta não pediu. */
  private selectData(
    intent: Exclude<FinancialIntentType, 'LARGEST_INVOICES' | 'PERIOD_COMPARISON'>,
    summary: FinancialDashboardSummary,
  ): FinancialIntentData {
    switch (intent) {
      case 'FINANCIAL_SUMMARY':
        return { intent, totals: summary.totals };
      case 'OUTSTANDING_BALANCE':
        return this.selectOutstanding(summary);
      case 'BY_STATUS':
        return { intent, byStatus: summary.byStatus };
      case 'BY_CATEGORY':
        return { intent, byCategory: summary.byCategory };
      case 'TOP_SUPPLIERS':
        return { intent, topSuppliers: summary.topSuppliers };
      case 'MONTHLY_TREND':
        return { intent, monthlyTrend: summary.monthlyTrend };
    }
  }

  /** Soma via `Prisma.Decimal` (nunca `number`) — mesmo cálculo determinístico já validado na Fase 8, agora feito aqui em vez do construtor de contexto. */
  private selectOutstanding(summary: FinancialDashboardSummary): FinancialIntentData {
    const outstandingRows = summary.byStatus.filter((row) => OUTSTANDING_STATUSES.has(row.status));
    const outstandingCount = outstandingRows.reduce((total, row) => total + row.count, 0);
    const outstandingAmount = outstandingRows
      .reduce((total, row) => total.plus(row.totalAmount), new Prisma.Decimal(0))
      .toFixed(2);
    return { intent: 'OUTSTANDING_BALANCE', outstandingCount, outstandingAmount };
  }
}
