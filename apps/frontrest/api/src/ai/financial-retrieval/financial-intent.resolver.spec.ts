import { resolveFinancialIntent, requestsInvoiceIdentity } from './financial-intent.resolver';

describe('resolveFinancialIntent', () => {
  it.each([
    ['Quanto gastei este mês?', 'FINANCIAL_SUMMARY'],
    ['Qual foi o total do mês passado?', 'FINANCIAL_SUMMARY'],
    ['Quanto tenho por pagar este ano?', 'OUTSTANDING_BALANCE'],
    ['Mostra os valores por estado em junho.', 'BY_STATUS'],
    ['Quais foram as principais categorias em maio?', 'BY_CATEGORY'],
    ['Quais foram os principais fornecedores este ano?', 'TOP_SUPPLIERS'],
    ['Mostra a evolução mensal deste ano.', 'MONTHLY_TREND'],
    ['Diz-me quantas faturas há em cada estado.', 'BY_STATUS'],
    // Regressão Fase 8.3 — frases reais que falhavam na investigação da conversa real.
    ['Quantas faturas existem?', 'FINANCIAL_SUMMARY'],
    ['Existem faturas pendentes?', 'OUTSTANDING_BALANCE'],
    ['Onde estou a gastar mais dinheiro?', 'BY_CATEGORY'],
    ['Qual é o fornecedor onde mais gastamos?', 'TOP_SUPPLIERS'],
    ['Faz um resumo financeiro da empresa.', 'FINANCIAL_SUMMARY'],
    // Hardening pós-Fase 8.13 — "faturas/facturas confirmadas/registadas/
    // oficiais" referem-se sempre a Invoice, nunca InvoiceDraft; nunca um
    // estado novo, sempre FINANCIAL_SUMMARY (mesmo totals já existente).
    ['Quantas faturas confirmadas existem em julho de 2026?', 'FINANCIAL_SUMMARY'],
    ['Qual foi o valor total das faturas confirmadas em julho de 2026?', 'FINANCIAL_SUMMARY'],
    ['Tenho faturas confirmadas este mês?', 'FINANCIAL_SUMMARY'],
    ['Quantas facturas confirmadas existem este mês?', 'FINANCIAL_SUMMARY'],
    ['Mostra-me as faturas registadas deste mês.', 'FINANCIAL_SUMMARY'],
    ['Mostra-me as facturas registadas deste mês.', 'FINANCIAL_SUMMARY'],
    ['Quais são as faturas oficiais deste mês?', 'FINANCIAL_SUMMARY'],
    ['Quais são as facturas oficiais deste mês?', 'FINANCIAL_SUMMARY'],
    // Hardening pós-Fase 8.13 — "quanto gastámos"/"quanto gastamos" (1ª
    // pessoa do plural) resolvem diretamente, mesma disciplina de "quanto
    // gastei" já existente.
    ['Quanto gastámos este mês?', 'FINANCIAL_SUMMARY'],
    ['Quanto gastámos no mês passado?', 'FINANCIAL_SUMMARY'],
    // Correção pós-validação manual (Problema 3) — "falta(m) pagar", mesmo
    // mecanismo (OUTSTANDING_PATTERN), nunca uma heurística/intent separada.
    ['Quanto falta pagar este mês?', 'OUTSTANDING_BALANCE'],
    ['O que ainda falta pagar?', 'OUTSTANDING_BALANCE'],
    // Correção pós-validação manual (Problema 4) — "número da/dessa fatura
    // <estado>" nomeando o estado na própria mensagem, sem depender de
    // continuidade; reutiliza FINANCIAL_SUMMARY (insights.largestExpense),
    // nunca uma intenção nova.
    ['Qual é o numero da factura paga?', 'FINANCIAL_SUMMARY'],
    ['Qual é o numero da fatura vencida?', 'FINANCIAL_SUMMARY'],
  ] as const)('reconhece "%s" como %s', (message, expected) => {
    expect(resolveFinancialIntent(message)).toEqual({ kind: 'SUPPORTED', intent: expected });
  });

  it.each([
    ['Qual é a melhor receita para bacalhau?', 'pergunta não financeira'],
    ['Compara os fornecedores mais caros.', 'comparação sem forma de dois períodos'],
    ['Mostra a fatura FT 123.', 'detalhe de fatura individual'],
    ['Marca esta fatura como paga.', 'escrita/alteração de dados'],
    ['Cria um novo fornecedor.', 'escrita/alteração de dados'],
    ['Aprova o pagamento desta fatura.', 'escrita/alteração de dados'],
    ['Elimina a categoria Hosting.', 'escrita/alteração de dados'],
    // Correção pós-validação manual (Problema 4) — "número da fatura" sem
    // estado nomeado nem continuidade continua genuinamente ambíguo, sem
    // precisar de nenhuma exclusão explícita (ver `INVOICE_DETAIL_PATTERN`).
    ['Qual é o número da fatura?', 'número da fatura sem estado nomeado — ambíguo'],
  ] as const)('trata "%s" como não suportada (%s)', (message, _reason) => {
    expect(resolveFinancialIntent(message)).toEqual({ kind: 'UNSUPPORTED' });
  });

  it('cada mensagem produz no máximo uma intenção — "por pagar" nunca cai em resumo financeiro genérico', () => {
    expect(resolveFinancialIntent('Quero saber o total que tenho por pagar este mês.')).toEqual({
      kind: 'SUPPORTED',
      intent: 'OUTSTANDING_BALANCE',
    });
  });

  it('é insensível a acentuação e maiúsculas/minúsculas', () => {
    expect(resolveFinancialIntent('QUANTO TENHO POR PAGAR?')).toEqual({
      kind: 'SUPPORTED',
      intent: 'OUTSTANDING_BALANCE',
    });
  });

  it('Fase 8.3 — vocabulário alargado nunca sobrepõe os padrões de exclusão já existentes', () => {
    expect(resolveFinancialIntent('Elimina as faturas pendentes.')).toEqual({ kind: 'UNSUPPORTED' });
    expect(resolveFinancialIntent('Compara onde gasto mais entre maio e junho.')).toEqual({ kind: 'UNSUPPORTED' });
  });

  describe('Fase 8.4 — LARGEST_INVOICES (maiores faturas individuais)', () => {
    it.each([
      ['Quais são as maiores faturas deste mês?', 'LARGEST_INVOICES'],
      ['Mostra as faturas de maior valor.', 'LARGEST_INVOICES'],
      ['Qual foi a fatura mais cara este ano?', 'LARGEST_INVOICES'],
    ] as const)('reconhece "%s" como %s', (message, expected) => {
      expect(resolveFinancialIntent(message)).toEqual({ kind: 'SUPPORTED', intent: expected });
    });

    it('"maior despesa" sozinho continua BY_CATEGORY (decisão da Fase 8.3, preservada)', () => {
      expect(resolveFinancialIntent('Qual foi a maior despesa este mês?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'BY_CATEGORY',
      });
    });

    it('"fornecedor" isolado (sem "maior despesa") continua TOP_SUPPLIERS — padrão inalterado', () => {
      expect(resolveFinancialIntent('Qual foi o fornecedor com mais gastos este mês?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'TOP_SUPPLIERS',
      });
    });
  });

  describe('Fase 8.4/8.5 — contagem/filtro por estado específico', () => {
    it.each([
      'Quantas faturas pagas este mês?',
      'Quantas vencidas?',
      'Quantas pendentes existem?',
      'Mostra apenas as vencidas.',
      'Lista as canceladas deste mês.',
    ])('reconhece "%s" como FINANCIAL_SUMMARY (o filtro de estado já não é transportado por este tipo — ver financial-filter.extractor.ts)', (message) => {
      expect(resolveFinancialIntent(message)).toEqual({ kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' });
    });

    it('"Existem faturas pendentes?" (regressão real Fase 8.3) continua OUTSTANDING_BALANCE — sem sinal explícito de filtro', () => {
      expect(resolveFinancialIntent('Existem faturas pendentes?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'OUTSTANDING_BALANCE',
      });
    });

    it('"quanto tenho por pagar" (regressão real) continua OUTSTANDING_BALANCE — sem sinal explícito de filtro', () => {
      expect(resolveFinancialIntent('quanto tenho por pagar')).toEqual({
        kind: 'SUPPORTED',
        intent: 'OUTSTANDING_BALANCE',
      });
    });

    it('"quantas pendentes" tem prioridade sobre OUTSTANDING_BALANCE — PENDING isolado, nunca Pendente+Vencida', () => {
      expect(resolveFinancialIntent('Quantas faturas pendentes tenho este mês?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'FINANCIAL_SUMMARY',
      });
    });

    it('Fase 8.5 — "só as pendentes"/"só as vencidas" (sinal explícito sem verbo de contagem) resolvem FINANCIAL_SUMMARY', () => {
      expect(resolveFinancialIntent('só as pendentes')).toEqual({ kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' });
      expect(resolveFinancialIntent('só as vencidas')).toEqual({ kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' });
    });

    it('Fase 8.5 — uma palavra de estado isolada, sem sinal de filtro e sem contexto financeiro, nunca cria uma intenção falsa', () => {
      expect(resolveFinancialIntent('Isto já está pago.')).toEqual({ kind: 'UNSUPPORTED' });
    });
  });

  it('Fase 8.4 — "média das faturas" reconhecida como FINANCIAL_SUMMARY', () => {
    expect(resolveFinancialIntent('Qual é a média das faturas deste mês?')).toEqual({
      kind: 'SUPPORTED',
      intent: 'FINANCIAL_SUMMARY',
    });
  });

  describe('Fase 8.6 — PERIOD_COMPARISON (comparação de dois períodos nomeados)', () => {
    it.each([
      'Compara maio com junho.',
      'Compara janeiro com fevereiro.',
      'Este mês versus o mês passado.',
      'Janeiro vs fevereiro',
    ])('reconhece "%s" como PERIOD_COMPARISON', (message) => {
      expect(resolveFinancialIntent(message)).toEqual({ kind: 'SUPPORTED', intent: 'PERIOD_COMPARISON' });
    });

    it('uma comparação sem a forma sintática "X com Y"/"X versus Y" continua UNSUPPORTED', () => {
      expect(resolveFinancialIntent('Compara os fornecedores mais caros.')).toEqual({ kind: 'UNSUPPORTED' });
    });

    // "Compara a categoria Hosting com a Manutenção" tem a mesma forma
    // sintática de uma comparação de períodos ("X com Y") — este módulo só
    // decide a intenção pela forma da frase, nunca sabe se X/Y são
    // períodos ou entidades. É por isso `SUPPORTED`/`PERIOD_COMPARISON`
    // aqui; a garantia de nunca comparar categorias/fornecedores está na
    // camada seguinte (`resolveFinancialPeriodPair()` não reconhece nem
    // "Hosting" nem "Manutenção" como período, devolvendo `PERIOD_MISSING`
    // em vez de qualquer dado fabricado) — coberto em
    // `financial-retrieval.service.spec.ts`.
    it('forma "X com Y" sem serem períodos ainda resolve a intenção (a segurança está na resolução do par)', () => {
      expect(resolveFinancialIntent('Compara a categoria Hosting com a Manutenção.')).toEqual({
        kind: 'SUPPORTED',
        intent: 'PERIOD_COMPARISON',
      });
    });

    it('regressão Fase 8.3 preservada — "compara" combinado com outra intenção sem forma de dois períodos continua UNSUPPORTED', () => {
      expect(resolveFinancialIntent('Compara onde gasto mais entre maio e junho.')).toEqual({ kind: 'UNSUPPORTED' });
    });

    it('nunca confunde um pedido de escrita com uma comparação, mesmo mencionando "com"', () => {
      expect(resolveFinancialIntent('Marca esta fatura como paga com o fornecedor certo.')).toEqual({
        kind: 'UNSUPPORTED',
      });
    });
  });
});

describe('requestsInvoiceIdentity', () => {
  it.each([
    'Qual é o número da fatura paga?',
    'qual é o numero da factura paga?',
    'Qual é o número dessa fatura?',
    'qual é o numero desta factura?',
  ])('reconhece "%s" como pedido de identidade de fatura', (message) => {
    expect(requestsInvoiceIdentity(message)).toBe(true);
  });

  it.each([
    'Quantas faturas existem?',
    'Qual é o número de faturas pagas?', // contagem ("de faturas"), nunca identidade ("da fatura")
    'Quanto gastei este mês?',
    'A fatura está paga.',
    'Mostra a fatura FT 123.',
  ])('nunca confunde "%s" com um pedido de identidade de fatura', (message) => {
    expect(requestsInvoiceIdentity(message)).toBe(false);
  });
});
