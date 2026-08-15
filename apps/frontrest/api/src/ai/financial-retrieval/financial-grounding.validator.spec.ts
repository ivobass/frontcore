import { validateFinancialGrounding } from './financial-grounding.validator';
import type { FinancialRetrievalResult } from './financial-retrieval.service';
import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';
import { buildFinancialInsights } from '../../financial-insights/financial-insights.util';
import { monthlyTrendAnalysis } from '../../financial-analysis/analyses/monthly-trend.analysis';
import { relativeConcentrationAnalysis } from '../../financial-analysis/analyses/relative-concentration.analysis';
import { runFinancialAnalyses } from '../../financial-analysis/financial-analysis.engine';
import type { FinancialAnalysisEngineOutput } from '../../financial-analysis/types';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

/** Fase 8.13 — insights vazios nunca produzem nenhuma conclusão aplicável. */
const EMPTY_ANALYSIS: FinancialAnalysisEngineOutput = {
  results: [],
  metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 0 },
};

/** Módulo (não local a um describe) — reutilizado tanto pelos testes de percentagens dos Financial Insights (Fase 8.9) como pelos de Financial Analysis Engine (Fase 8.13), sobre exatamente os mesmos dados. */
const INSIGHTS_FOR_RESULT_WITH_INSIGHTS = buildFinancialInsights(
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
);
const RESULT_WITH_INSIGHTS: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 5, activeInvoiceCount: 5, cancelledInvoiceCount: 0, totalAmount: '1000.00', averageAmount: '200.00' },
    insights: INSIGHTS_FOR_RESULT_WITH_INSIGHTS,
    analysis: runFinancialAnalyses([monthlyTrendAnalysis, relativeConcentrationAnalysis], INSIGHTS_FOR_RESULT_WITH_INSIGHTS),
  },
  filters: {}, invoiceIdentityRequested: false,
};

const SUMMARY_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: EMPTY_ANALYSIS,
  },
  filters: {}, invoiceIdentityRequested: false,
};

const FILTERED_BY_SUPPLIER_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: EMPTY_ANALYSIS,
  },
  filters: { supplierId: 'sup-1', supplierName: 'Hetzner' }, invoiceIdentityRequested: false,
};

const FILTERED_BY_CATEGORY_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: EMPTY_ANALYSIS,
  },
  filters: { categoryId: 'cat-1', categoryName: 'Hosting' }, invoiceIdentityRequested: false,
};

const FILTERED_BY_STATUS_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 2, activeInvoiceCount: 2, cancelledInvoiceCount: 0, totalAmount: '316.00', averageAmount: '158.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: EMPTY_ANALYSIS,
  },
  filters: { status: 'PAID' }, invoiceIdentityRequested: false,
};

const TOP_SUPPLIERS_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: { intent: 'TOP_SUPPLIERS', topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }] },
  filters: {}, invoiceIdentityRequested: false,
};

const LARGEST_INVOICES_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: {
    intent: 'LARGEST_INVOICES',
    invoices: [{ id: 'inv-1', number: 'F-100', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-10', status: 'PAID', totalAmount: '300.00' }],
  },
  filters: {}, invoiceIdentityRequested: false,
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
  filters: {}, invoiceIdentityRequested: false,
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
  filters: {}, invoiceIdentityRequested: false,
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
          analysis: EMPTY_ANALYSIS,
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
          analysis: EMPTY_ANALYSIS,
        },
        filters: {}, invoiceIdentityRequested: false,
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
        filters: {}, invoiceIdentityRequested: false,
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

  describe('Fase 8.13 — Financial Analysis Engine (conclusões e evidências)', () => {
    // A evidência de monthlyTrendAnalysis/relativeConcentrationAnalysis é
    // sempre uma cópia verbatim de campos já presentes em `insights` (Fase
    // 8.10) — por isso estes testes reutilizam RESULT_WITH_INSIGHTS (já
    // estendido com `analysis` acima) e confirmam que collectInsightFacts()
    // já cobre qualquer percentagem que a análise possa mencionar, sem
    // precisar de uma coleta própria (`collectAnalysisFacts()`, YAGNI).
    it('aceita a percentagem real da concentração relativa (60%/100%, mesmos valores de supplierConcentration/categoryConcentration)', () => {
      expect(
        validateFinancialGrounding('As categorias estão mais concentradas do que os fornecedores: 100% vs 60%.', RESULT_WITH_INSIGHTS),
      ).toEqual({ grounded: true });
    });

    it('aceita a percentagem real da tendência mensal, tal como aparece na evidência de monthly_trend', () => {
      expect(
        validateFinancialGrounding('A tendência mensal aponta para um aumento de 50%.', RESULT_WITH_INSIGHTS),
      ).toEqual({ grounded: true });
    });

    it('rejeita uma percentagem fabricada, mesmo apresentada como se viesse da análise financeira', () => {
      expect(
        validateFinancialGrounding('A concentração relativa mostra 75% para as categorias.', RESULT_WITH_INSIGHTS),
      ).toEqual({ grounded: false, reason: 'PERCENTAGE_NOT_ALLOWED' });
    });

    it('analysis.results vazio (período sem dados) nunca autoriza uma percentagem inventada', () => {
      expect(validateFinancialGrounding('A tendência aumentou 10%.', SUMMARY_RESULT)).toEqual({
        grounded: false,
        reason: 'PERCENTAGE_NOT_ALLOWED',
      });
    });
  });

  describe('Hardening pós-Fase 8.13 — decomposição paga/por pagar ("Foram registados X EUR... Deste valor, Y EUR estão pagos")', () => {
    const INSIGHTS_WITH_PARTIAL_OUTSTANDING = buildFinancialInsights(
      {
        period: PERIOD,
        totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 0, totalAmount: '500.00', averageAmount: '125.00' },
        byStatus: [
          { status: 'PAID', count: 2, totalAmount: '350.00' },
          { status: 'PENDING', count: 2, totalAmount: '150.00' },
        ],
        monthlyTrend: [],
        byCategory: [],
        topSuppliers: [],
      },
      [],
    );
    const RESULT_WITH_PARTIAL_OUTSTANDING: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 0, totalAmount: '500.00', averageAmount: '125.00' },
        insights: INSIGHTS_WITH_PARTIAL_OUTSTANDING,
        analysis: EMPTY_ANALYSIS,
      },
      filters: {}, invoiceIdentityRequested: false,
    };

    it('aceita o valor pago real (500.00 − 150.00 por pagar = 350.00 pago), derivado, nunca uma nova fonte de dados', () => {
      expect(
        validateFinancialGrounding(
          'Foram registados 500,00 EUR em despesas. Deste valor, 350,00 EUR estão pagos e 150,00 EUR continuam por pagar.',
          RESULT_WITH_PARTIAL_OUTSTANDING,
        ),
      ).toEqual({ grounded: true });
    });

    it('rejeita um valor pago fabricado, mesmo plausível, que não corresponde a totalAmount − outstanding', () => {
      expect(
        validateFinancialGrounding('Deste valor, 400,00 EUR estão pagos.', RESULT_WITH_PARTIAL_OUTSTANDING),
      ).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });
  });

  describe('Hardening pós-revisão Codex — CANCELLED nunca é semanticamente PAID', () => {
    // `outstanding` construído artificialmente não-nulo (`5.00`), mesmo
    // com `filters.status = 'CANCELLED'` — isola o efeito da correção ao
    // nível do código (deixar de autorizar `computePaidAmount()`) de
    // forma inequívoca: com `outstanding` real (sempre 0 para CANCELLED,
    // depois da correção do Problema 1 do `byStatus`), `paidAmount`
    // coincide sempre com `totalAmount`, e os dois números tornam-se
    // indistinguíveis para um validador que só compara números — nunca
    // rótulos. A prova end-to-end de que a linha "estão pagos" nunca é
    // sequer construída para CANCELLED vive em
    // `financial-context.builder.spec.ts`.
    const INSIGHTS_WITH_ARTIFICIAL_OUTSTANDING = buildFinancialInsights(
      {
        period: PERIOD,
        totals: { invoiceCount: 2, activeInvoiceCount: 2, cancelledInvoiceCount: 0, totalAmount: '30.00', averageAmount: '15.00' },
        byStatus: [{ status: 'PENDING', count: 1, totalAmount: '5.00' }],
        monthlyTrend: [],
        byCategory: [],
        topSuppliers: [],
      },
      [],
    );
    const RESULT_FILTERED_BY_CANCELLED: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 2, activeInvoiceCount: 2, cancelledInvoiceCount: 0, totalAmount: '30.00', averageAmount: '15.00' },
        insights: INSIGHTS_WITH_ARTIFICIAL_OUTSTANDING,
        analysis: EMPTY_ANALYSIS,
      },
      filters: { status: 'CANCELLED' }, invoiceIdentityRequested: false,
    };

    it('nunca autoriza o valor derivado (computePaidAmount = 30.00 − 5.00 = 25.00) apresentado como "pago" para status=CANCELLED', () => {
      expect(
        validateFinancialGrounding('Faturas canceladas. Deste valor, 25,00 EUR estão pagos.', RESULT_FILTERED_BY_CANCELLED),
      ).toEqual({ grounded: false, reason: 'AMOUNT_NOT_ALLOWED' });
    });

    it('o total registado em si (nunca rotulado "pago") continua aceite — nunca esconde o valor real', () => {
      expect(
        validateFinancialGrounding('Foram registadas 2 faturas canceladas, no valor de 30,00 EUR.', RESULT_FILTERED_BY_CANCELLED),
      ).toEqual({ grounded: true });
    });

    it('status=PAID preserva o comportamento existente — computePaidAmount() continua autorizado', () => {
      const resultPaid: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        ...RESULT_FILTERED_BY_CANCELLED,
        filters: { status: 'PAID' }, invoiceIdentityRequested: false,
      };
      expect(
        validateFinancialGrounding('Faturas pagas. Deste valor, 25,00 EUR estão pagos.', resultPaid),
      ).toEqual({ grounded: true });
    });

    describe('Correção final pós-revisão Codex — nível semântico (não apenas o cálculo de paidAmount)', () => {
      // Cenário REAL (obrigatório) — `outstanding` genuinamente 0.00 para
      // CANCELLED (nunca artificial, ao contrário do fixture acima): aqui
      // `computePaidAmount(totalAmount, insights) === totalAmount`, por
      // isso "30,00 EUR" É um facto real (o total cancelado) — o problema
      // nunca foi o número em si, mas associá-lo semanticamente a "pago".
      const RESULT_REAL_CANCELLED: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        kind: 'DATA',
        period: PERIOD,
        data: {
          intent: 'FINANCIAL_SUMMARY',
          totals: { invoiceCount: 1, activeInvoiceCount: 0, cancelledInvoiceCount: 1, totalAmount: '30.00', averageAmount: '30.00' },
          insights: buildEmptyFinancialInsights(PERIOD),
          analysis: EMPTY_ANALYSIS,
        },
        filters: { status: 'CANCELLED' }, invoiceIdentityRequested: false,
      };

      it('"Faturas canceladas: 30,00 EUR estão pagos." → rejeitada mesmo com totalAmount=30.00/outstanding=0.00 reais, e usa fallback grounded', () => {
        const validation = validateFinancialGrounding('Faturas canceladas: 30,00 EUR estão pagos.', RESULT_REAL_CANCELLED);
        expect(validation).toEqual({ grounded: false, reason: 'CANCELLED_PAYMENT_CLAIM_NOT_ALLOWED' });
        expect(validation.grounded).toBe(false);
      });

      it('nunca bloqueia a simples apresentação do valor cancelado, sem nenhuma palavra de pagamento', () => {
        expect(
          validateFinancialGrounding('Faturas canceladas: 30,00 EUR.', RESULT_REAL_CANCELLED),
        ).toEqual({ grounded: true });
      });

      it.each([
        'Faturas canceladas: 30,00 EUR. Está pago.',
        'Faturas canceladas: 30,00 EUR. Foi pago.',
        'Faturas canceladas: 30,00 EUR. Foram pagos.',
        'Faturas canceladas: 30,00 EUR. Paga.',
        'Faturas canceladas: 30,00 EUR. Liquidado.',
        'Faturas canceladas: 30,00 EUR. Liquidados.',
      ])('rejeita a formulação equivalente: %s', (response) => {
        expect(validateFinancialGrounding(response, RESULT_REAL_CANCELLED)).toEqual({
          grounded: false,
          reason: 'CANCELLED_PAYMENT_CLAIM_NOT_ALLOWED',
        });
      });

      it('PENDING preserva o comportamento existente — "pago"/"paga" nunca é bloqueado fora do universo CANCELLED', () => {
        const resultPending: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
          ...RESULT_REAL_CANCELLED,
          filters: { status: 'PENDING' }, invoiceIdentityRequested: false,
        };
        expect(
          validateFinancialGrounding('Faturas pendentes: 30,00 EUR. Ainda não está pago.', resultPending),
        ).toEqual({ grounded: true });
      });

      it('OVERDUE preserva o comportamento existente — "pago"/"paga" nunca é bloqueado fora do universo CANCELLED', () => {
        const resultOverdue: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
          ...RESULT_REAL_CANCELLED,
          filters: { status: 'OVERDUE' }, invoiceIdentityRequested: false,
        };
        expect(
          validateFinancialGrounding('Faturas vencidas: 30,00 EUR. Ainda não está pago.', resultOverdue),
        ).toEqual({ grounded: true });
      });

      it('consulta sem filtro de estado preserva o comportamento existente — "pago"/"paga" nunca é bloqueado', () => {
        const resultNoFilter: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
          ...RESULT_REAL_CANCELLED,
          filters: {}, invoiceIdentityRequested: false,
        };
        expect(
          validateFinancialGrounding('Foram registados 30,00 EUR em despesas. Estão pagos.', resultNoFilter),
        ).toEqual({ grounded: true });
      });
    });
  });

  describe('Correção pós-validação manual (Problema 4) — número de fatura, suporte grounded mínimo', () => {
    it('aceita o número real, rotulado explicitamente ("número da fatura é F-100")', () => {
      expect(
        validateFinancialGrounding('O número da fatura é F-100.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: true });
    });

    it('aceita o número real independentemente de maiúsculas/minúsculas', () => {
      expect(
        validateFinancialGrounding('O número é f-100.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: true });
    });

    it('rejeita um número de fatura fabricado, mesmo plausível, rotulado explicitamente', () => {
      expect(
        validateFinancialGrounding('O número da fatura é XPTO-999.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
    });

    it('sem nenhum número real nos dados, qualquer número rotulado é sempre rejeitado (nunca inventado a partir do vazio)', () => {
      expect(
        validateFinancialGrounding('O número da fatura é F-100.', SUMMARY_RESULT),
      ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
    });

    it('sem `invoiceIdentityRequested` (pergunta atual não pede a identidade da fatura), um número mencionado sem o rótulo "número" continua sem ser validado por esta via — resposta continua aceite', () => {
      // `LARGEST_INVOICES_RESULT.invoiceIdentityRequested` é `false` —
      // mesmo comportamento de sempre, nunca aplicado indiscriminadamente.
      expect(
        validateFinancialGrounding('A fatura F-100 está paga.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: true });
    });

    it('nunca falso positivo — "número" sem nenhum dígito próximo (ex. "o número está disponível") continua aceite', () => {
      expect(
        validateFinancialGrounding('O número está disponível no anexo.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: true });
    });

    it('nunca falso positivo — "número de faturas" com o dígito longe do rótulo (fora do intervalo de 10 caracteres) continua aceite', () => {
      expect(
        validateFinancialGrounding('O número de faturas registadas este mês é 5.', LARGEST_INVOICES_RESULT),
      ).toEqual({ grounded: true });
    });

    describe('Correção pós-revisão Codex — invoiceIdentityRequested alarga a validação a menções sem o rótulo "número"', () => {
      const LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        ...LARGEST_INVOICES_RESULT,
        invoiceIdentityRequested: true,
      };

      it('"A fatura paga é XPTO-999." → rejeitada (fabricado), quando a pergunta atual pede a identidade da fatura', () => {
        expect(
          validateFinancialGrounding('A fatura paga é XPTO-999.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('"A fatura paga é TEST-002." → aceite quando TEST-002 pertence aos dados recuperados', () => {
        const resultWithTest002: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
          ...LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED,
          data: {
            intent: 'LARGEST_INVOICES',
            invoices: [
              { id: 'inv-2', number: 'TEST-002', supplierName: 'ACME', categoryName: 'Hosting', issueDate: '2026-08-10', status: 'PAID', totalAmount: '50.00' },
            ],
          },
        };
        expect(
          validateFinancialGrounding('A fatura paga é TEST-002.', resultWithTest002),
        ).toEqual({ grounded: true });
      });

      it('"Trata-se da fatura TEST-999." → rejeitada (fabricado, sem "é"/rótulo, só "fatura" + candidato)', () => {
        expect(
          validateFinancialGrounding('Trata-se da fatura TEST-999.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('"É a XPTO-999." → rejeitada (resposta elíptica, sem a palavra "fatura") quando a pergunta atual é "qual é o número dessa fatura?"', () => {
        expect(
          validateFinancialGrounding('É a XPTO-999.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('"É a F-100." → aceite (resposta elíptica com o número real)', () => {
        expect(
          validateFinancialGrounding('É a F-100.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: true });
      });

      it('nunca confunde uma data ISO mencionada perto de "fatura" com um número de fatura fabricado (ex. sem número real disponível)', () => {
        const resultWithoutNumber: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
          ...LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED,
          data: {
            intent: 'LARGEST_INVOICES',
            invoices: [
              { id: 'inv-1', number: null, supplierName: 'ACME', categoryName: 'Hosting', issueDate: '2026-08-10', status: 'PAID', totalAmount: '50.00' },
            ],
          },
        };
        expect(
          validateFinancialGrounding('A maior fatura é de 2026-08-10.', resultWithoutNumber),
        ).toEqual({ grounded: true });
      });

      it('nunca confunde um NIF mencionado numa frase sem a forma "fatura ... <token>"/elíptica', () => {
        expect(
          validateFinancialGrounding(
            'O fornecedor tem o NIF 511094949.',
            LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED,
          ),
        ).toEqual({ grounded: true });
      });

      it('nunca confunde um NIF mencionado logo a seguir à palavra "fatura" — "A fatura tem NIF 509978142." continua aceite (falso positivo evitado)', () => {
        // Sem a exclusão de "NIF"/"contribuinte"/"VAT" no intervalo entre
        // "fatura" e o candidato, "509978142" seria capturado como se
        // fosse `Invoice.number` e rejeitado por não pertencer aos dados —
        // um falso positivo real, já que a frase nunca alegou um número de
        // fatura, só um NIF.
        expect(
          validateFinancialGrounding('A fatura tem NIF 509978142.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: true });
      });

      it('nunca confunde "número de contribuinte" com o rótulo "número" (labelled path, sempre ativo)', () => {
        expect(
          validateFinancialGrounding('O número de contribuinte é 509978142.', LARGEST_INVOICES_RESULT_IDENTITY_REQUESTED),
        ).toEqual({ grounded: true });
      });
    });

    describe('Correção final pós-revisão Codex — Invoice.number com espaços (números reais compostos)', () => {
      const LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: {
          intent: 'LARGEST_INVOICES',
          invoices: [
            { id: 'inv-1', number: 'ZFRC B036/9823519819', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-10', status: 'PAID', totalAmount: '300.00' },
            { id: 'inv-2', number: 'FR U006/46931', supplierName: 'OVH', categoryName: 'Hosting', issueDate: '2026-07-12', status: 'PAID', totalAmount: '120.00' },
          ],
        },
        filters: {},
        invoiceIdentityRequested: true,
      };

      it('"A fatura paga é ZFRC B036/9823519819." → aceite (número real composto por dois segmentos separados por espaço)', () => {
        expect(
          validateFinancialGrounding('A fatura paga é ZFRC B036/9823519819.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: true });
      });

      it('"É a ZFRC B036/9823519819." → aceite (resposta elíptica com o número composto real)', () => {
        expect(
          validateFinancialGrounding('É a ZFRC B036/9823519819.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: true });
      });

      it('"A fatura paga é FR U006/46931." → aceite (segundo número composto real, primeiro segmento sem dígitos)', () => {
        expect(
          validateFinancialGrounding('A fatura paga é FR U006/46931.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: true });
      });

      it('variante inventada semelhante ("A fatura paga é ZFRC B036/9823519818.") → rejeitada, nunca um número parcial aceite como válido', () => {
        expect(
          validateFinancialGrounding('A fatura paga é ZFRC B036/9823519818.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('nunca aceita um candidato truncado a meio do segundo segmento ("A fatura paga é ZFRC B036.") como se fosse o número composto real', () => {
        expect(
          validateFinancialGrounding('A fatura paga é ZFRC B036.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('nunca aceita só o segundo segmento truncado ("A fatura paga é B036/9823519819.") como se fosse o número composto real', () => {
        expect(
          validateFinancialGrounding('A fatura paga é B036/9823519819.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' });
      });

      it('rótulo "número" também suporta o número composto real (labelled path)', () => {
        expect(
          validateFinancialGrounding('O número da fatura é ZFRC B036/9823519819.', LARGEST_INVOICES_RESULT_COMPOUND_NUMBERS),
        ).toEqual({ grounded: true });
      });
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
