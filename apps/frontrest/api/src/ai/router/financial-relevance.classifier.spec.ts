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

  it('Fase 8.5 — uma palavra de estado isolada ("pago"/"vencida"), mesmo sem contexto financeiro nem continuação, continua FINANCIAL por desenho (FINANCIAL_ADJACENT_PATTERN inclui-a deliberadamente); nunca cria um falso positivo de INTENÇÃO — isso é filtrado à parte por resolveStatusFilter()/resolveFinancialIntent() (ver financial-intent.resolver.spec.ts), nunca por este classificador de relevância', () => {
    expect(classifyMessageRelevance('Isto já está pago.', [])).toBe('FINANCIAL');
    expect(classifyMessageRelevance('A fatura está vencida.', [])).toBe('FINANCIAL');
  });

  it('Fase 8.6 — mensagens de comparação de períodos sem nenhum vocabulário financeiro-adjacente continuam FINANCIAL', () => {
    // Nenhuma destas três mensagens contém uma palavra de
    // FINANCIAL_ADJACENT_PATTERN — sem o reconhecimento explícito da
    // forma de comparação, cairiam incorretamente em GENERAL e nunca
    // chegariam ao retrieval financeiro.
    expect(classifyMessageRelevance('Compara maio com junho.', [])).toBe('FINANCIAL');
    expect(classifyMessageRelevance('Compara janeiro com fevereiro.', [])).toBe('FINANCIAL');
    expect(classifyMessageRelevance('Este mês versus o mês passado.', [])).toBe('FINANCIAL');
  });

  describe('Fase 8.7 — hasFinancialContext (snapshot financeiro persistido)', () => {
    it('uma continuação é FINANCIAL quando hasFinancialContext é true, mesmo sem nenhum histórico financeiro-adjacente na janela recente', () => {
      const result = classifyMessageRelevance('E os fornecedores?', ['Olá', 'Bom dia'], true);

      expect(result).toBe('FINANCIAL');
    });

    it('sem sinal de continuação, hasFinancialContext=true nunca força FINANCIAL sozinho — a mensagem continua sem nenhum sinal próprio', () => {
      const result = classifyMessageRelevance('Qual é a capital de Portugal?', [], true);

      expect(result).toBe('GENERAL');
    });

    it('omitido (comportamento por omissão, chamadas existentes), continua idêntico ao comportamento anterior a esta fase', () => {
      const result = classifyMessageRelevance('E depois disso?', ['Qual é a capital de Portugal?']);

      expect(result).toBe('GENERAL');
    });

    it('hasFinancialContext=false explícito é equivalente a omitido — nunca força FINANCIAL', () => {
      const result = classifyMessageRelevance('E depois disso?', ['Qual é a capital de Portugal?'], false);

      expect(result).toBe('GENERAL');
    });
  });
});
