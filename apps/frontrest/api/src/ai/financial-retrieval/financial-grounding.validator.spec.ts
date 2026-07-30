import { validateFinancialGrounding } from './financial-grounding.validator';
import type { FinancialRetrievalResult } from './financial-retrieval.service';
import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';
import { buildFinancialInsights } from '../../financial-insights/financial-insights.util';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

const SUMMARY_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
    insights: buildEmptyFinancialInsights(PERIOD),
  },
  filters: {},
};

const FILTERED_BY_SUPPLIER_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
  },
  filters: { supplierId: 'sup-1', supplierName: 'Hetzner' },
};

const FILTERED_BY_CATEGORY_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
  },
  filters: { categoryId: 'cat-1', categoryName: 'Hosting' },
};

const FILTERED_BY_STATUS_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 2, activeInvoiceCount: 2, cancelledInvoiceCount: 0, totalAmount: '316.00', averageAmount: '158.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
  },
  filters: { status: 'PAID' },
};

const TOP_SUPPLIERS_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: { intent: 'TOP_SUPPLIERS', topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }] },
  filters: {},
};

const LARGEST_INVOICES_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: {
    intent: 'LARGEST_INVOICES',
    invoices: [{ id: 'inv-1', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-10', status: 'PAID', totalAmount: '300.00' }],
  },
  filters: {},
};

const COMPARISON_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-06-01', to: '2026-06-30' },
  data: {
    intent: 'PERIOD_COMPARISON',
    current: { period: { from: '2026-06-01', to: '2026-06-30' }, totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '150.00', averageAmount: '50.00' } },
    previous: { period: { from: '2026-05-01', to: '2026-05-31' }, totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' } },
    comparison: {
      totalAmount: { current: '150.00', previous: '0.00', absoluteChange: '150.00', percentageChange: null, direction: 'increase' },
      activeInvoiceCount: { current: '3', previous: '0', absoluteChange: '3', percentageChange: null, direction: 'increase' },
    },
  },
  filters: {},
};

/** Correção pós-revisão (Fase 8.9) — percentagens reais não nulas, para testar a regressão do PERIOD_COMPARISON. */
const COMPARISON_RESULT_WITH_PERCENTAGE: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-06-01', to: '2026-06-30' },
  data: {
    intent: 'PERIOD_COMPARISON',
    current: { period: { from: '2026-06-01', to: '2026-06-30' }, totals: { invoiceCount: 6, activeInvoiceCount: 6, cancelledInvoiceCount: 0, totalAmount: '300.00', averageAmount: '50.00' } },
    previous: { period: { from: '2026-05-01', to: '2026-05-31' }, totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '200.00', averageAmount: '66.67' } },
    comparison: {
      totalAmount: { current: '300.00', previous: '200.00', absoluteChange: '100.00', percentageChange: 50, direction: 'increase' },
      activeInvoiceCount: { current: '6', previous: '3', absoluteChange: '3', percentageChange: 100, direction: 'increase' },
    },
  },
  filters: {},
};

describe('validateFinancialGrounding', () => {
  describe('respostas válidas continuam aceites', () => {
    it('uma resposta que reproduz exatamente os valores reais (formato pt-PT, vírgula decimal) é aceite', () => {
      const response = 'Este mês teve 4 faturas ativas, no total de 370,00 EUR, com uma média de 92,50 EUR.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: true });
    });

    it('uma resposta em prosa natural, sem nenhum valor/data/fatura mencionado explicitamente, é aceite (nada para validar)', () => {
      expect(validateFinancialGrounding('Não há faturas relevantes a destacar este período.', SUMMARY_RESULT)).toEqual({ grounded: true });
    });

    it('uma resposta filtrada por fornecedor que menciona o nome real é aceite', () => {
      const response = 'Com a Hetzner, gastou 354,00 EUR este mês.';
      expect(validateFinancialGrounding(response, FILTERED_BY_SUPPLIER_RESULT)).toEqual({ grounded: true });
    });

    it('uma resposta filtrada por categoria que menciona o nome real é aceite', () => {
      const response = 'Em Hosting, gastou 354,00 EUR este mês.';
      expect(validateFinancialGrounding(response, FILTERED_BY_CATEGORY_RESULT)).toEqual({ grounded: true });
    });

    it('uma resposta filtrada por estado que menciona o estado traduzido real é aceite', () => {
      const response = 'Tens 2 faturas pagas, no total de 316,00 EUR.';
      expect(validateFinancialGrounding(response, FILTERED_BY_STATUS_RESULT)).toEqual({ grounded: true });
    });

    it('uma data ISO real (período consultado) presente na resposta é aceite', () => {
      const response = `Período consultado: ${SUMMARY_RESULT.period.from} a ${SUMMARY_RESULT.period.to}. Total: 370,00 EUR.`;
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: true });
    });

    it('uma data de fatura real (LARGEST_INVOICES) é aceite', () => {
      const response = 'A maior fatura foi em 2026-07-10, da Hetzner (Hosting), 300,00 EUR.';
      expect(validateFinancialGrounding(response, LARGEST_INVOICES_RESULT)).toEqual({ grounded: true });
    });

    it('uma resposta de comparação de períodos com os valores reais (incl. absoluteChange) é aceite', () => {
      const response = 'Este mês (150,00 EUR) representa um aumento de 150,00 EUR face ao mês anterior (0,00 EUR).';
      expect(validateFinancialGrounding(response, COMPARISON_RESULT)).toEqual({ grounded: true });
    });
  });

  describe('total diferente (valor alterado ou inventado)', () => {
    it('rejeita um total que não corresponde a nenhum valor real dos dados', () => {
      const response = 'Este mês gastou 999,99 EUR.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });

    it('rejeita mesmo quando o valor real também aparece — a presença de UM valor errado já é suficiente para reprovar', () => {
      const response = 'O total real é 370,00 EUR, mas arredondando fica por volta de 400,00 EUR.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });
  });

  describe('período diferente / data inventada', () => {
    it('rejeita uma data ISO que não corresponde ao período real consultado', () => {
      const response = 'Período consultado: 2026-08-01 a 2026-08-31.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: false, reason: 'DATE_NOT_ALLOWED' });
    });

    it('rejeita uma data de fatura inventada em LARGEST_INVOICES', () => {
      const response = 'A maior fatura foi em 2026-01-15, da Hetzner, 300,00 EUR.';
      expect(validateFinancialGrounding(response, LARGEST_INVOICES_RESULT)).toEqual({ grounded: false, reason: 'DATE_NOT_ALLOWED' });
    });
  });

  describe('fornecedor inventado', () => {
    it('rejeita quando a resposta nunca menciona o fornecedor real pedido explicitamente (filters.supplierName)', () => {
      const response = 'Com a ACME Corp, gastou 354,00 EUR este mês.';
      expect(validateFinancialGrounding(response, FILTERED_BY_SUPPLIER_RESULT)).toEqual({ grounded: false, reason: 'MISSING_REQUIRED_SUPPLIER' });
    });
  });

  describe('categoria inventada', () => {
    it('rejeita quando a resposta nunca menciona a categoria real pedida explicitamente (filters.categoryName)', () => {
      const response = 'Em Marketing, gastou 354,00 EUR este mês.';
      expect(validateFinancialGrounding(response, FILTERED_BY_CATEGORY_RESULT)).toEqual({ grounded: false, reason: 'MISSING_REQUIRED_CATEGORY' });
    });
  });

  describe('estado diferente', () => {
    it('rejeita quando a resposta troca o estado real pedido explicitamente (filters.status) por outro', () => {
      const response = 'Tens 2 faturas vencidas, no total de 316,00 EUR.';
      expect(validateFinancialGrounding(response, FILTERED_BY_STATUS_RESULT)).toEqual({ grounded: false, reason: 'MISSING_REQUIRED_STATUS' });
    });

    it('rejeita uma contagem de faturas que não corresponde a nenhuma contagem real', () => {
      const response = 'Este mês teve 7 faturas.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: false, reason: 'COUNT_NOT_ALLOWED' });
    });
  });

  describe('alegação financeira adicional não presente nos dados', () => {
    it('rejeita uma alegação extra com um valor monetário que os dados nunca continham', () => {
      const response = 'Este mês gastou 370,00 EUR. Além disso, tem 50,00 EUR em juros de mora.';
      expect(validateFinancialGrounding(response, SUMMARY_RESULT)).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });

    it('rejeita uma alegação extra sobre o fornecedor principal com um total inventado (TOP_SUPPLIERS)', () => {
      const response = 'O principal fornecedor foi a Hetzner, com 354,00 EUR, mas também gastou 120,00 EUR em impostos não listados.';
      expect(validateFinancialGrounding(response, TOP_SUPPLIERS_RESULT)).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });
  });

  describe('normalização de formato', () => {
    it('aceita o valor sem casas decimais quando os dados reais são um valor inteiro (ex. "0.00")', () => {
      const zeroResult: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        ...SUMMARY_RESULT,
        data: {
          intent: 'FINANCIAL_SUMMARY',
          totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
          insights: buildEmptyFinancialInsights(PERIOD),
        },
      };
      expect(validateFinancialGrounding('Não gastou nada este mês (0 EUR).', zeroResult)).toEqual({ grounded: true });
    });

    it('aceita uma casa decimal só (ex. "92,5 EUR") quando o valor real tem duas ("92.50")', () => {
      expect(validateFinancialGrounding('A média foi de 92,5 EUR.', SUMMARY_RESULT)).toEqual({ grounded: true });
    });
  });

  describe('correção — AMOUNT_TOKEN_PATTERN/normalizeAmountToken: todos os formatos monetários pt-PT', () => {
    function resultWithAmount(totalAmount: string): Extract<FinancialRetrievalResult, { kind: 'DATA' }> {
      return {
        kind: 'DATA',
        period: PERIOD,
        data: {
          intent: 'FINANCIAL_SUMMARY',
          totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount, averageAmount: totalAmount },
          insights: buildEmptyFinancialInsights(PERIOD),
        },
        filters: {},
      };
    }

    it.each([
      ['999,99 €', '999.99'],
      ['999,99€', '999.99'],
      ['999,99 EUR', '999.99'],
      ['999 EUR', '999.00'],
      ['50 EUR', '50.00'],
      ['50,5 EUR', '50.50'],
      ['50.50 EUR', '50.50'],
      ['1.234,56 EUR', '1234.56'],
      ['1 234,56 EUR', '1234.56'],
      ['12.345.678,90 EUR', '12345678.90'],
    ])('reconhece "%s" como o valor real %s', (formattedAmount, realAmount) => {
      const result = resultWithAmount(realAmount);
      expect(validateFinancialGrounding(`Valor: ${formattedAmount}.`, result)).toEqual({ grounded: true });
    });

    it.each([
      ['-50,00 EUR', '-50.00'],
      ['-50 €', '-50.00'],
      ['-1.234,56 EUR', '-1234.56'],
    ])('reconhece o valor negativo "%s" como %s, preservando sempre o sinal (ex. variação negativa numa comparação de períodos)', (formattedAmount, realAmount) => {
      const comparisonResult: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        kind: 'DATA',
        period: { from: '2026-06-01', to: '2026-06-30' },
        data: {
          intent: 'PERIOD_COMPARISON',
          current: {
            period: { from: '2026-06-01', to: '2026-06-30' },
            totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
          },
          previous: {
            period: { from: '2026-05-01', to: '2026-05-31' },
            totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: realAmount.replace('-', ''), averageAmount: realAmount.replace('-', '') },
          },
          comparison: {
            totalAmount: { current: '0.00', previous: realAmount.replace('-', ''), absoluteChange: realAmount, percentageChange: -100, direction: 'decrease' },
            activeInvoiceCount: { current: '0', previous: '1', absoluteChange: '-1', percentageChange: -100, direction: 'decrease' },
          },
        },
        filters: {},
      };

      expect(validateFinancialGrounding(`Uma diminuição de ${formattedAmount} face ao mês anterior.`, comparisonResult)).toEqual({ grounded: true });
    });

    it('rejeita um valor incorreto mesmo apresentado num formato corretamente reconhecido', () => {
      const result = resultWithAmount('370.00');
      expect(validateFinancialGrounding('Valor: 12.345.678,90 EUR.', result)).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });

    it('os formatos já suportados antes desta correção continuam a funcionar (regressão)', () => {
      const result = resultWithAmount('370.00');
      expect(validateFinancialGrounding('Valor: 370,00 EUR.', result)).toEqual({ grounded: true });
      expect(validateFinancialGrounding('Valor: 370.00 EUR.', result)).toEqual({ grounded: true });
    });

    it('um número grande sem nenhum separador de milhares (ex. "12345,67 EUR") nunca é cortado a meio', () => {
      const result = resultWithAmount('12345.67');
      expect(validateFinancialGrounding('Valor: 12345,67 EUR.', result)).toEqual({ grounded: true });
    });
  });

  describe('Fase 8.9 — percentagens dos Financial Insights (concentração, ranking, tendência)', () => {
    const RESULT_WITH_INSIGHTS: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 5, activeInvoiceCount: 5, cancelledInvoiceCount: 0, totalAmount: '1000.00', averageAmount: '200.00' },
        insights: buildFinancialInsights(
          {
            period: PERIOD,
            totals: { invoiceCount: 5, activeInvoiceCount: 5, cancelledInvoiceCount: 0, totalAmount: '1000.00', averageAmount: '200.00' },
            byStatus: [{ status: 'PENDING', count: 5, totalAmount: '1000.00' }],
            monthlyTrend: [
              { month: '2026-06', count: 2, totalAmount: '400.00' },
              { month: '2026-07', count: 3, totalAmount: '600.00' },
            ],
            byCategory: [{ categoryId: 'cat-1', categoryName: 'Hosting', count: 5, totalAmount: '1000.00' }],
            topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00' }],
          },
          [],
        ),
      },
      filters: {},
    };

    it('aceita a percentagem real do maior fornecedor (share "60.00"), com "%" e vírgula decimal', () => {
      expect(validateFinancialGrounding('A Hetzner representa 60% do total.', RESULT_WITH_INSIGHTS)).toEqual({ grounded: true });
      expect(validateFinancialGrounding('A Hetzner representa 60,00% do total.', RESULT_WITH_INSIGHTS)).toEqual({ grounded: true });
      expect(validateFinancialGrounding('A Hetzner representa 60.00% do total.', RESULT_WITH_INSIGHTS)).toEqual({ grounded: true });
    });

    it('aceita a percentagem real da tendência (aumento de 50% face ao mês anterior)', () => {
      expect(validateFinancialGrounding('As despesas aumentaram 50% face ao mês anterior.', RESULT_WITH_INSIGHTS)).toEqual({
        grounded: true,
      });
    });

    it('aceita a concentração de categoria (100%, única categoria do período)', () => {
      expect(validateFinancialGrounding('Hosting concentra 100% da despesa.', RESULT_WITH_INSIGHTS)).toEqual({ grounded: true });
    });

    it('rejeita uma percentagem fabricada, não coincidente com nenhum valor real dos Financial Insights', () => {
      expect(validateFinancialGrounding('A Hetzner representa 61% do total.', RESULT_WITH_INSIGHTS)).toEqual({
        grounded: false,
        reason: 'PERCENTAGE_NOT_ALLOWED',
      });
    });

    it('rejeita um arredondamento diferente do valor autorizado — sem tolerâncias aproximadas', () => {
      expect(validateFinancialGrounding('A Hetzner representa 60,50% do total.', RESULT_WITH_INSIGHTS)).toEqual({
        grounded: false,
        reason: 'PERCENTAGE_NOT_ALLOWED',
      });
    });

    it('uma resposta fabricada é sempre rejeitável — o fallback determinístico (buildFinancialContextMessage) nunca precisa de ser reescrito para substituir uma resposta rejeitada', () => {
      // Confirma só a garantia de rejeição em si — a substituição pelo
      // fallback é responsabilidade de AiChatService/AiToolOrchestratorService
      // (já coberta em ai-chat.service.spec.ts), nunca deste validador.
      const result = validateFinancialGrounding('A Hetzner representa 99% do total.', RESULT_WITH_INSIGHTS);
      expect(result.grounded).toBe(false);
    });
  });

  describe('Correção pós-revisão — regressão do PERIOD_COMPARISON (percentagens em falta do conjunto permitido)', () => {
    it('percentagem válida — comparação monetária (totalAmount.percentageChange = 50) é aceite', () => {
      expect(
        validateFinancialGrounding('As despesas aumentaram 50% face ao mês anterior.', COMPARISON_RESULT_WITH_PERCENTAGE),
      ).toEqual({ grounded: true });
    });

    it('percentagem válida — comparação por contagem (activeInvoiceCount.percentageChange = 100) é aceite', () => {
      expect(
        validateFinancialGrounding('O número de faturas ativas duplicou — 100% de aumento.', COMPARISON_RESULT_WITH_PERCENTAGE),
      ).toEqual({ grounded: true });
    });

    it('percentagem inválida — fabricada, não coincidente com nenhuma das duas percentagens reais, é rejeitada', () => {
      expect(validateFinancialGrounding('Aumento de 37% face ao mês anterior.', COMPARISON_RESULT_WITH_PERCENTAGE)).toEqual({
        grounded: false,
        reason: 'PERCENTAGE_NOT_ALLOWED',
      });
    });

    it('percentagem nula — período anterior zero (percentageChange: null) — qualquer percentagem mencionada é sempre rejeitada, nunca adicionada ao conjunto permitido', () => {
      expect(validateFinancialGrounding('Aumento de 100% face ao mês anterior.', COMPARISON_RESULT)).toEqual({
        grounded: false,
        reason: 'PERCENTAGE_NOT_ALLOWED',
      });
    });

    it('a mesma resposta com os valores reais (montante, contagem, sem percentagem) continua aceite — regressão não introduzida pela correção', () => {
      expect(
        validateFinancialGrounding(
          'Este mês (300,00 EUR) representa um aumento de 100,00 EUR face ao mês anterior (200,00 EUR).',
          COMPARISON_RESULT_WITH_PERCENTAGE,
        ),
      ).toEqual({ grounded: true });
    });
  });
});
