import { Injectable } from '@nestjs/common';
import type { AiMessage } from '@frontcore/ai';
import { DashboardService } from '../dashboard/dashboard.service';

/**
 * Regras fixas do assistente — nunca dependem de dados de nenhuma
 * organização. Declaram explicitamente os limites pedidos: só responder
 * com os dados fornecidos, admitir insuficiência, nunca inventar valores/
 * datas/fornecedores/faturas, nunca alterar dados, e que o isolamento
 * multi-tenant já está garantido antes deste texto existir — o modelo
 * nunca é fronteira de autorização, só recebe dados já filtrados.
 */
const ASSISTANT_RULES = `És o assistente financeiro do FrontRest, a responder a um utilizador autenticado de uma organização específica.

Regras obrigatórias:
- Responde só com base nos dados financeiros fornecidos abaixo, desta organização.
- Se os dados não forem suficientes para responder com confiança, diz isso explicitamente — nunca adivinhes nem estimes um valor que não esteja presente.
- Nunca inventes valores, datas, fornecedores, categorias, faturas ou estados que não estejam listados abaixo.
- Nunca sugiras nem finjas alterar qualquer fatura, fornecedor ou categoria — respondes só a perguntas, nunca escreves no domínio financeiro.
- Os dados abaixo pertencem exclusivamente à organização autenticada — não existe nenhum outro dado disponível.`;

const NO_INVOICES_LINE = 'Sem faturas confirmadas neste período.';

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

      if (summary.byStatus.length > 0) {
        lines.push(
          `Por estado: ${summary.byStatus
            .map((row) => `${row.status}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
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
