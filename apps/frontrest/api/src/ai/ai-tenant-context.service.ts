import { Injectable } from '@nestjs/common';
import type { AiMessage } from '@frontcore/ai';
import { Prisma } from '@frontcore/database';
import { DashboardService } from '../dashboard/dashboard.service';

/**
 * Regras fixas do assistente — nunca dependem de dados de nenhuma
 * organização. Declaram explicitamente os limites pedidos: só responder
 * com os dados fornecidos, admitir insuficiência, nunca inventar valores/
 * datas/fornecedores/faturas, nunca alterar dados, nunca recalcular um
 * total já fornecido (ex. "Por pagar"), responder sempre em português de
 * Portugal com os estados traduzidos, e que o isolamento multi-tenant já
 * está garantido antes deste texto existir — o modelo nunca é fronteira
 * de autorização, só recebe dados já filtrados.
 */
const ASSISTANT_RULES = `És o assistente financeiro do FrontRest, a responder a um utilizador autenticado de uma organização específica.

Regras obrigatórias:
- Responde só com base nos dados financeiros fornecidos abaixo, desta organização.
- Se os dados não forem suficientes para responder com confiança, diz isso explicitamente — nunca adivinhes nem estimes um valor que não esteja presente.
- Nunca inventes valores, datas, fornecedores, categorias, faturas ou estados que não estejam listados abaixo.
- Nunca sugiras nem finjas alterar qualquer fatura, fornecedor ou categoria — respondes só a perguntas, nunca escreves no domínio financeiro.
- Os dados abaixo pertencem exclusivamente à organização autenticada — não existe nenhum outro dado disponível.
- "Por pagar" significa sempre Pendente + Vencida — nunca inclui faturas Pagas.
- Quando os dados abaixo já incluem um valor calculado (ex. "Por pagar"), usa sempre esse valor diretamente — nunca o recalcules, estimes ou infiras a partir de outros números.
- Se te pedirem para explicares como chegaste a um valor, explica usando exclusivamente os dados fornecidos abaixo — nunca inventes operações matemáticas nem dados adicionais.
- Responde sempre em português de Portugal, nunca em português do Brasil — nunca uses "você".
- Usa sempre os nomes traduzidos dos estados das faturas (Pendente, Paga, Vencida, Cancelada) — nunca os nomes internos em inglês (PENDING, PAID, OVERDUE, CANCELLED).`;

const NO_INVOICES_LINE = 'Sem faturas confirmadas neste período.';

/** Tradução dos estados internos (`InvoiceStatus`) — nunca expor o enum bruto ao modelo. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** "Por pagar" = Pendente + Vencida — nunca inclui Paga. Mesma definição do system prompt, aqui aplicada aos dados. */
const OUTSTANDING_STATUSES = new Set(['PENDING', 'OVERDUE']);

function translateStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Contexto financeiro por tenant (Fase 8) — pequeno, read-only,
 * reconstruído em cada pedido de chat, nunca persistido. Reutiliza
 * `DashboardService.getFinancialSummary()` (Fase 7) por inteiro — mesma
 * semântica de isolamento, `CANCELLED`, precisão monetária — em vez de
 * duplicar queries Prisma ou fazer um pedido HTTP interno a
 * `/dashboard/financial-summary`. Período omisso → mês atual, mesma
 * omissão já usada pelo dashboard; ver `docs/phases/phase-8-ai-chat-foundation.md`
 * para o trade-off registado (uma pergunta sobre um período fora do mês
 * atual fica sem dados — o próprio texto de regras instrui o modelo a
 * admitir isso, nunca inventar).
 */
@Injectable()
export class AiTenantContextService {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Mensagem `system` completa (regras + dados) para o pedido de completion atual. */
  async buildSystemMessage(organizationId: string): Promise<AiMessage> {
    const summary = await this.dashboardService.getFinancialSummary(organizationId, {});

    const lines: string[] = [
      `Período: ${summary.period.from} a ${summary.period.to}.`,
    ];

    if (summary.totals.activeInvoiceCount === 0 && summary.totals.cancelledInvoiceCount === 0) {
      lines.push(NO_INVOICES_LINE);
    } else {
      lines.push(
        `Faturas ativas: ${summary.totals.activeInvoiceCount} (total: ${summary.totals.totalAmount} EUR; média: ${summary.totals.averageAmount} EUR).`,
        `Faturas canceladas: ${summary.totals.cancelledInvoiceCount}.`,
      );

      // Calculado aqui, determinístico (soma via Prisma.Decimal, nunca
      // `number`, mesma disciplina de precisão da Fase 7) — o modelo nunca
      // deve somar Pendente+Vencida sozinho (ver ASSISTANT_RULES).
      const outstandingRows = summary.byStatus.filter((row) => OUTSTANDING_STATUSES.has(row.status));
      const outstandingCount = outstandingRows.reduce((total, row) => total + row.count, 0);
      const outstandingAmount = outstandingRows
        .reduce((total, row) => total.plus(row.totalAmount), new Prisma.Decimal(0))
        .toFixed(2);
      lines.push(`Por pagar (Pendente + Vencida): ${outstandingCount} fatura(s), ${outstandingAmount} EUR.`);

      if (summary.byStatus.length > 0) {
        lines.push(
          `Por estado: ${summary.byStatus
            .map((row) => `${translateStatus(row.status)}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }

      if (summary.monthlyTrend.length > 0) {
        lines.push(
          `Evolução mensal: ${summary.monthlyTrend
            .map((row) => `${row.month}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }

      if (summary.byCategory.length > 0) {
        lines.push(
          `Por categoria: ${summary.byCategory
            .map((row) => `${row.categoryName}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }

      if (summary.topSuppliers.length > 0) {
        lines.push(
          `Principais fornecedores: ${summary.topSuppliers
            .map((row) => `${row.supplierName}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }
    }

    return {
      role: 'system',
      content: `${ASSISTANT_RULES}\n\nDados financeiros disponíveis:\n${lines.join('\n')}`,
    };
  }
}
