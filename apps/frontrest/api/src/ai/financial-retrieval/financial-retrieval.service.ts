import { Injectable } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import { DashboardService } from '../../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../../dashboard/dashboard.service';
import { resolveFinancialIntent } from './financial-intent.resolver';
import type { FinancialIntentType } from './financial-intent.resolver';
import { resolveFinancialPeriod } from './financial-period.resolver';

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
 * Retrieval financeiro estruturado do Chat IA (Fase 8.1) — substitui o
 * resumo fixo do período por omissão (Fase 8) por uma consulta
 * deterministicamente selecionada com base na intenção e no período da
 * mensagem do utilizador. Nunca conhece o provider, nunca aceita
 * `organizationId` do pedido do utilizador (só do chamador autenticado),
 * nunca acede ao Prisma diretamente — reutiliza exclusivamente
 * `DashboardService.getFinancialSummary()` (Fase 7), a mesma fonte já
 * usada pelo dashboard e pelos relatórios mensais (Fase 9), para nunca
 * duplicar queries, regras de estado ou precisão monetária.
 */
@Injectable()
export class FinancialRetrievalService {
  constructor(private readonly dashboardService: DashboardService) {}

  async retrieve(organizationId: string, message: string, now: Date = new Date()): Promise<FinancialRetrievalResult> {
    const intentResolution = resolveFinancialIntent(message);
    if (intentResolution.kind === 'UNSUPPORTED') {
      return { kind: 'UNSUPPORTED' };
    }

    const periodResolution = resolveFinancialPeriod(message, now);
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
      data: this.selectData(intentResolution.intent, summary),
    };
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
