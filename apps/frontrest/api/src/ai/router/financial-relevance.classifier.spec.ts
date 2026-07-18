import { classifyMessageRelevance } from './financial-relevance.classifier';

describe('classifyMessageRelevance', () => {
  it.each([
    'Qual é a capital de Portugal?',
    'Que dia da semana é hoje?',
    'Podes ajudar-me a escrever um email?',
    'Conta-me uma piada.',
  ])('classifica "%s" como GENERAL — sem nenhum vocabulário financeiro-adjacente', (message) => {
    expect(classifyMessageRelevance(message, [])).toBe('GENERAL');
  });

  it.each([
    'Quanto gastei este mês?',
    'Quantas faturas pagas existem?',
    'Qual foi o fornecedor mais caro?',
    'Preciso de saber o valor total em euros.',
    'Estou com dívidas por pagar.',
    'Como está a situação financeira da empresa?',
  ])('classifica "%s" como FINANCIAL — vocabulário financeiro-adjacente presente', (message) => {
    expect(classifyMessageRelevance(message, [])).toBe('FINANCIAL');
  });

  it('uma pergunta financeira com fraseado totalmente novo nunca é tratada como GENERAL só por o regex de intenção falhar', () => {
    // "Preciso de perceber o panorama de gastos" não corresponde a nenhum
    // padrão de INTENÇÃO específico (financial-intent.resolver.ts), mas
    // contém vocabulário financeiro-adjacente ("gastos") — deve continuar
    // FINANCIAL (cai no fallback determinístico seguro, nunca GENERAL).
    expect(classifyMessageRelevance('Preciso de perceber o panorama de gastos', [])).toBe('FINANCIAL');
  });

  describe('continuação depende de contexto financeiro recente', () => {
    it('"E só da Hetzner?" com histórico financeiro recente é FINANCIAL', () => {
      const result = classifyMessageRelevance('E só da Hetzner?', ['Quantas faturas pagas este mês?']);

      expect(result).toBe('FINANCIAL');
    });

    it('"Qual foi a maior?" com histórico financeiro recente é FINANCIAL', () => {
      const result = classifyMessageRelevance('Qual foi a maior?', ['Mostra as maiores faturas deste mês.']);

      expect(result).toBe('FINANCIAL');
    });

    it('um sinal de continuação sem nenhum contexto financeiro recente é GENERAL — nunca força o caminho financeiro sozinho', () => {
      const result = classifyMessageRelevance('E depois disso?', ['Qual é a capital de Portugal?']);

      expect(result).toBe('GENERAL');
    });

    it('sinal de continuação sem histórico nenhum é GENERAL', () => {
      const result = classifyMessageRelevance('Só isso.', []);

      expect(result).toBe('GENERAL');
    });
  });

  it('escrita/alteração sem nenhum vocabulário financeiro é GENERAL — nunca força o caminho financeiro sozinho', () => {
    // "Aprova" é um verbo de escrita (WRITE_ACTION_PATTERN em
    // financial-intent.resolver.ts), mas sem nenhuma palavra financeira
    // esta mensagem não é sobre faturas/fornecedores/categorias — cai no
    // caminho geral, cujo system prompt próprio já proíbe fingir executar
    // ações (ver ai-tenant-context.service.ts).
    expect(classifyMessageRelevance('Aprova este pedido de férias.', [])).toBe('GENERAL');
  });

  it('escrita/alteração combinada com vocabulário financeiro continua FINANCIAL — nunca escapa para o caminho geral', () => {
    expect(classifyMessageRelevance('Aprova o pagamento desta fatura.', [])).toBe('FINANCIAL');
  });
});
