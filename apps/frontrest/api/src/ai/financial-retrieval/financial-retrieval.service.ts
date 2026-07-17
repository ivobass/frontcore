import { Injectable } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import { DashboardService } from '../../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../../dashboard/dashboard.service';
import { resolveFinancialIntent } from './financial-intent.resolver';
import type { FinancialIntentResolution, FinancialIntentType } from './financial-intent.resolver';
import { resolveFinancialPeriod } from './financial-period.resolver';
import type { FinancialPeriodResolution } from './financial-period.resolver';

/** "Por pagar" = Pendente + Vencida — nunca inclui Paga. Mesma definição já usada pelo contexto do Chat IA (Fase 8). */
const OUTSTANDING_STATUSES = new Set<string>(['PENDING', 'OVERDUE']);

export type FinancialIntentData =
  | { intent: 'FINANCIAL_SUMMARY'; totals: FinancialDashboardSummary['totals'] }
  | { intent: 'OUTSTANDING_BALANCE'; outstandingCount: number; outstandingAmount: string }
  | { intent: 'BY_STATUS'; byStatus: FinancialDashboardSummary['byStatus'] }
  | { intent: 'BY_CATEGORY'; byCategory: FinancialDashboardSummary['byCategory'] }
  | { intent: 'TOP_SUPPLIERS'; topSuppliers: FinancialDashboardSummary['topSuppliers'] }
  | { intent: 'MONTHLY_TREND'; monthlyTrend: FinancialDashboardSummary['monthlyTrend'] };

export type FinancialRetrievalResult =
  | { kind: 'UNSUPPORTED' }
  | { kind: 'PERIOD_MISSING' }
  | { kind: 'PERIOD_AMBIGUOUS' }
  | { kind: 'ERROR' }
  | { kind: 'DATA'; period: { from: string; to: string }; data: FinancialIntentData };

/**
 * Retrieval financeiro estruturado do Chat IA (Fase 8.1, reforçado na
 * Fase 8.3) — substitui o resumo fixo do período por omissão (Fase 8)
 * por uma consulta deterministicamente selecionada com base na intenção
 * e no período da mensagem do utilizador. Nunca conhece o provider,
 * nunca aceita `organizationId` do pedido do utilizador (só do chamador
 * autenticado), nunca acede ao Prisma diretamente — reutiliza
 * exclusivamente `DashboardService.getFinancialSummary()` (Fase 7).
 *
 * Fase 8.3 — recuperação por histórico: quando a mensagem atual não
 * tem intenção OU período resolvíveis sozinha, mas o outro dos dois
 * resolve com sucesso, procura na janela de mensagens recentes já
 * carregada (a mesma enviada ao provider, nunca mais longe) uma
 * mensagem anterior que resolva a peça em falta — sem persistir nada
 * novo, sem chamar o LLM para isto. Resolve casos de continuação como
 * "sim este mês" (intenção da mensagem anterior + período da atual) ou
 * uma pergunta nova sem período repetido (intenção da atual + período
 * de uma mensagem anterior).
 */
@Injectable()
export class FinancialRetrievalService {
  constructor(private readonly dashboardService: DashboardService) {}

  async retrieve(
    organizationId: string,
    message: string,
    recentUserMessages: string[] = [],
    now: Date = new Date(),
  ): Promise<FinancialRetrievalResult> {
    let intentResolution = resolveFinancialIntent(message);
    const currentPeriodResolution = resolveFinancialPeriod(message, now);

    // Só tenta recuperar a intenção de uma mensagem anterior quando a
    // mensagem atual, sozinha, já tem um período válido (ex. "sim este
    // mês") — nunca quando a mensagem atual não dá nenhum sinal.
    if (intentResolution.kind === 'UNSUPPORTED' && currentPeriodResolution.kind === 'RESOLVED') {
      const recoveredIntent = this.recoverIntent(recentUserMessages);
      if (recoveredIntent) {
        intentResolution = recoveredIntent;
      }
    }

    if (intentResolution.kind === 'UNSUPPORTED') {
      return { kind: 'UNSUPPORTED' };
    }

    let periodResolution = currentPeriodResolution;
    if (periodResolution.kind !== 'RESOLVED') {
      const recoveredPeriod = this.recoverPeriod(recentUserMessages, now);
      if (recoveredPeriod) {
        periodResolution = recoveredPeriod;
      }
    }

    return this.resolveDataForPeriod(organizationId, intentResolution.intent, periodResolution);
  }

  /**
   * Variante usada pelas AI Tools (Fase 8.3) — a intenção já é conhecida
   * (qual tool foi chamada), só o período vem em texto livre (o
   * argumento estruturado da tool, ex. `{ period: "este mês" }`).
   * Reutiliza exatamente o mesmo resolvedor de período e o mesmo
   * `DashboardService`/`selectData()` do caminho principal — nunca uma
   * segunda fonte de verdade. Nunca recupera por histórico (a tool já
   * recebeu o período que o modelo decidiu passar; recuperação por
   * histórico é só para o caminho de regex sem tools).
   */
  async retrieveForIntent(
    organizationId: string,
    intent: FinancialIntentType,
    periodText: string,
    now: Date = new Date(),
  ): Promise<FinancialRetrievalResult> {
    const periodResolution = resolveFinancialPeriod(periodText, now);
    return this.resolveDataForPeriod(organizationId, intent, periodResolution);
  }

  private async resolveDataForPeriod(
    organizationId: string,
    intent: FinancialIntentType,
    periodResolution: FinancialPeriodResolution,
  ): Promise<FinancialRetrievalResult> {
    if (periodResolution.kind === 'MISSING') {
      return { kind: 'PERIOD_MISSING' };
    }
    if (periodResolution.kind === 'AMBIGUOUS') {
      return { kind: 'PERIOD_AMBIGUOUS' };
    }

    let summary: FinancialDashboardSummary;
    try {
      summary = await this.dashboardService.getFinancialSummary(organizationId, {
        from: periodResolution.period.from,
        to: periodResolution.period.to,
      });
    } catch {
      return { kind: 'ERROR' };
    }

    return {
      kind: 'DATA',
      period: { from: summary.period.from, to: summary.period.to },
      data: this.selectData(intent, summary),
    };
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

  /** Seleciona só o subconjunto de `summary` relevante para a intenção — nunca envia ao provider blocos que a pergunta não pediu. */
  private selectData(intent: FinancialIntentType, summary: FinancialDashboardSummary): FinancialIntentData {
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
