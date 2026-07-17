import { resolveFinancialPeriod } from './financial-period.resolver';

// Data de referência fixa em todos os testes — nunca a data real da máquina.
const NOW = new Date('2026-07-16T12:00:00Z');

describe('resolveFinancialPeriod', () => {
  it('resolve "este mês"/"mês atual" para o mês da data de referência', () => {
    expect(resolveFinancialPeriod('Quanto gastei este mês?', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
    });
    expect(resolveFinancialPeriod('Resumo do mês atual', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
    });
  });

  it('resolve "mês passado"/"mês anterior" para o mês civil imediatamente anterior', () => {
    expect(resolveFinancialPeriod('Total do mês passado', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-06-01', to: '2026-06-30' }),
    });
    expect(resolveFinancialPeriod('Total do mês anterior', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-06-01', to: '2026-06-30' }),
    });
  });

  it('transição de janeiro para dezembro do ano anterior ("mês passado" em janeiro)', () => {
    const january = new Date('2026-01-15T00:00:00Z');
    expect(resolveFinancialPeriod('Total do mês passado', january)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2025-12-01', to: '2025-12-31' }),
    });
  });

  it('resolve "este ano"/"ano atual" para o ano civil da data de referência', () => {
    expect(resolveFinancialPeriod('Quanto tenho por pagar este ano?', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-01-01', to: '2026-12-31' }),
    });
    expect(resolveFinancialPeriod('Resumo do ano atual', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-01-01', to: '2026-12-31' }),
    });
  });

  it('resolve "ano passado"/"ano anterior" para o ano civil imediatamente anterior', () => {
    expect(resolveFinancialPeriod('Total do ano passado', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2025-01-01', to: '2025-12-31' }),
    });
  });

  it('resolve um mês explícito sem ano para o ano da data de referência', () => {
    expect(resolveFinancialPeriod('Mostra os valores por estado em junho.', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-06-01', to: '2026-06-30' }),
    });
  });

  it('resolve um mês explícito com ano indicado', () => {
    expect(resolveFinancialPeriod('Resumo de junho de 2025', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2025-06-01', to: '2025-06-30' }),
    });
  });

  it('resolve fevereiro corretamente num ano bissexto e num ano não bissexto', () => {
    expect(resolveFinancialPeriod('Resumo de fevereiro de 2028', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ to: '2028-02-29' }),
    });
    expect(resolveFinancialPeriod('Resumo de fevereiro de 2026', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ to: '2026-02-28' }),
    });
  });

  it('resolve um intervalo explícito e inequívoco', () => {
    expect(resolveFinancialPeriod('Resumo de janeiro a junho de 2026', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2026-01-01', to: '2026-06-30' }),
    });
  });

  it('intervalo explícito com ano diferente em cada extremo', () => {
    expect(resolveFinancialPeriod('Resumo de novembro de 2025 a janeiro de 2026', NOW)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2025-11-01', to: '2026-01-31' }),
    });
  });

  it('data inválida (intervalo invertido) devolve AMBIGUOUS, nunca lança', () => {
    expect(resolveFinancialPeriod('Resumo de dezembro a janeiro de 2026', NOW)).toEqual({ kind: 'AMBIGUOUS' });
  });

  it('expressão temporal reconhecida mas não resolvível devolve AMBIGUOUS', () => {
    expect(resolveFinancialPeriod('Quanto gastei no Natal?', NOW)).toEqual({ kind: 'AMBIGUOUS' });
    expect(resolveFinancialPeriod('Quanto gastei esta semana?', NOW)).toEqual({ kind: 'AMBIGUOUS' });
  });

  it('ausência de qualquer expressão de período devolve MISSING, nunca assume o mês atual', () => {
    expect(resolveFinancialPeriod('Quanto gastei?', NOW)).toEqual({ kind: 'MISSING' });
  });

  it('nunca depende da data real da máquina — usa sempre a data de referência injetada', () => {
    const otherNow = new Date('2020-03-05T00:00:00Z');
    expect(resolveFinancialPeriod('este mês', otherNow)).toEqual({
      kind: 'RESOLVED',
      period: expect.objectContaining({ from: '2020-03-01', to: '2020-03-31' }),
    });
  });
});
