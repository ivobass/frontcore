import { resolveStatusFilter } from './financial-filter.extractor';

describe('resolveStatusFilter', () => {
  it.each([
    ['só as pagas', 'PAID'],
    ['apenas as canceladas', 'CANCELLED'],
    ['só as vencidas', 'OVERDUE'],
    ['só as pendentes', 'PENDING'],
    ['e dessas, quantas estão pagas?', 'PAID'],
  ] as const)('extrai "%s" como %s', (message, expected) => {
    expect(resolveStatusFilter(message)).toBe(expected);
  });

  it.each([
    ['Quantas faturas pagas este mês?', 'PAID'],
    ['Quantas vencidas?', 'OVERDUE'],
    ['Quantas pendentes existem?', 'PENDING'],
    ['Mostra apenas as vencidas.', 'OVERDUE'],
    ['Lista as canceladas deste mês.', 'CANCELLED'],
    ['Numero de faturas pagas', 'PAID'],
    ['Contagem de vencidas', 'OVERDUE'],
  ] as const)('reconhece as variações já existentes: "%s" -> %s', (message, expected) => {
    expect(resolveStatusFilter(message)).toBe(expected);
  });

  it.each(['pendentes', 'por pagar', 'em dívida', 'a pagar'])(
    'nunca extrai um estado a partir de "%s" — sem sinal explícito de filtro',
    (message) => {
      expect(resolveStatusFilter(message)).toBeUndefined();
    },
  );

  it.each(['Existem faturas pendentes?', 'quanto tenho por pagar', 'quanto tenho por pagar este ano?'])(
    'frases reais sem sinal explícito de filtro (regressão Fase 8.3) devolvem undefined: "%s"',
    (message) => {
      expect(resolveStatusFilter(message)).toBeUndefined();
    },
  );

  it('mensagem sem nenhuma palavra de estado devolve undefined', () => {
    expect(resolveStatusFilter('mostra as faturas')).toBeUndefined();
  });

  it('mensagem sem sinal de filtro, mesmo mencionando um estado, devolve undefined', () => {
    expect(resolveStatusFilter('Isto já está pago.')).toBeUndefined();
    expect(resolveStatusFilter('A fatura está vencida.')).toBeUndefined();
  });

  it('é insensível a maiúsculas/minúsculas e acentuação', () => {
    expect(resolveStatusFilter('SÓ AS PAGAS')).toBe('PAID');
    expect(resolveStatusFilter('so as pendentes')).toBe('PENDING'); // sem acento no sinal "só"
    expect(resolveStatusFilter('APENAS AS CANCELADAS')).toBe('CANCELLED');
  });

  it('reconhece singular e plural', () => {
    expect(resolveStatusFilter('só a paga')).toBe('PAID');
    expect(resolveStatusFilter('só as pagas')).toBe('PAID');
    expect(resolveStatusFilter('só o pago')).toBe('PAID');
    expect(resolveStatusFilter('só os pagos')).toBe('PAID');
  });
});
