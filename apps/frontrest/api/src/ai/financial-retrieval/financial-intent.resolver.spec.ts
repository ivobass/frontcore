import { resolveFinancialIntent } from './financial-intent.resolver';

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
  ] as const)('reconhece "%s" como %s', (message, expected) => {
    expect(resolveFinancialIntent(message)).toEqual({ kind: 'SUPPORTED', intent: expected });
  });

  it.each([
    ['Qual é a melhor receita para bacalhau?', 'pergunta não financeira'],
    ['Compara maio com junho.', 'comparação entre períodos'],
    ['Mostra a fatura FT 123.', 'detalhe de fatura individual'],
    ['Marca esta fatura como paga.', 'escrita/alteração de dados'],
    ['Cria um novo fornecedor.', 'escrita/alteração de dados'],
    ['Aprova o pagamento desta fatura.', 'escrita/alteração de dados'],
    ['Elimina a categoria Hosting.', 'escrita/alteração de dados'],
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

  describe('Fase 8.4 — contagem/filtro por estado específico', () => {
    it.each([
      ['Quantas faturas pagas este mês?', 'PAID'],
      ['Quantas vencidas?', 'OVERDUE'],
      ['Quantas pendentes existem?', 'PENDING'],
      ['Mostra apenas as vencidas.', 'OVERDUE'],
      ['Lista as canceladas deste mês.', 'CANCELLED'],
    ] as const)('reconhece "%s" como FINANCIAL_SUMMARY com statusFilter=%s', (message, status) => {
      expect(resolveFinancialIntent(message)).toEqual({
        kind: 'SUPPORTED',
        intent: 'FINANCIAL_SUMMARY',
        statusFilter: status,
      });
    });

    it('"Existem faturas pendentes?" (regressão real Fase 8.3) continua OUTSTANDING_BALANCE — sem verbo de contagem/filtro', () => {
      expect(resolveFinancialIntent('Existem faturas pendentes?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'OUTSTANDING_BALANCE',
      });
    });

    it('"quantas pendentes" tem prioridade sobre OUTSTANDING_BALANCE — PENDING isolado, nunca Pendente+Vencida', () => {
      expect(resolveFinancialIntent('Quantas faturas pendentes tenho este mês?')).toEqual({
        kind: 'SUPPORTED',
        intent: 'FINANCIAL_SUMMARY',
        statusFilter: 'PENDING',
      });
    });
  });

  it('Fase 8.4 — "média das faturas" reconhecida como FINANCIAL_SUMMARY', () => {
    expect(resolveFinancialIntent('Qual é a média das faturas deste mês?')).toEqual({
      kind: 'SUPPORTED',
      intent: 'FINANCIAL_SUMMARY',
    });
  });
});
