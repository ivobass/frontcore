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
});
