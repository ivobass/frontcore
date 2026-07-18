import { resolveFinancialPeriodPair, splitComparisonPeriods } from './financial-period-pair.resolver';

// Data de referência fixa em todos os testes — nunca a data real da máquina.
const NOW = new Date('2026-07-16T12:00:00Z');

describe('splitComparisonPeriods', () => {
  it('divide "compara X com Y" nos dois lados', () => {
    expect(splitComparisonPeriods('Compara maio com junho.')).toEqual(['maio', 'junho.']);
  });

  it('divide "X versus Y" e "X vs Y" nos dois lados', () => {
    expect(splitComparisonPeriods('Este mês versus o mês passado.')).toEqual(['este mes', 'o mes passado.']);
    expect(splitComparisonPeriods('Janeiro vs fevereiro')).toEqual(['janeiro', 'fevereiro']);
  });

  it('devolve null para uma mensagem sem forma de comparação de dois lados', () => {
    expect(splitComparisonPeriods('Quanto gastei este mês?')).toBeNull();
    expect(splitComparisonPeriods('Compara os fornecedores mais caros.')).toBeNull();
  });
});

describe('resolveFinancialPeriodPair', () => {
  it('resolve "compara maio com junho" para os dois meses do mesmo ano de referência', () => {
    expect(resolveFinancialPeriodPair('Compara maio com junho.', NOW)).toEqual({
      kind: 'RESOLVED',
      current: expect.objectContaining({ from: '2026-05-01', to: '2026-05-31' }),
      previous: expect.objectContaining({ from: '2026-06-01', to: '2026-06-30' }),
    });
  });

  it('resolve "compara janeiro com fevereiro"', () => {
    expect(resolveFinancialPeriodPair('Compara janeiro com fevereiro.', NOW)).toEqual({
      kind: 'RESOLVED',
      current: expect.objectContaining({ from: '2026-01-01', to: '2026-01-31' }),
      previous: expect.objectContaining({ from: '2026-02-01', to: '2026-02-28' }),
    });
  });

  it('resolve "este mês versus o mês passado" relativo à data de referência', () => {
    expect(resolveFinancialPeriodPair('Este mês versus o mês passado.', NOW)).toEqual({
      kind: 'RESOLVED',
      current: expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
      previous: expect.objectContaining({ from: '2026-06-01', to: '2026-06-30' }),
    });
  });

  it('mensagem sem forma de comparação devolve MISSING', () => {
    expect(resolveFinancialPeriodPair('Quanto gastei este mês?', NOW)).toEqual({ kind: 'MISSING' });
  });

  it('um dos lados sem período reconhecível devolve MISSING, nunca lança', () => {
    expect(resolveFinancialPeriodPair('Compara maio com o fornecedor Hetzner.', NOW)).toEqual({ kind: 'MISSING' });
  });

  it('um dos lados com expressão temporal reconhecida mas não resolvível devolve AMBIGUOUS', () => {
    expect(resolveFinancialPeriodPair('Compara o Natal com junho.', NOW)).toEqual({ kind: 'AMBIGUOUS' });
  });

  it('nunca depende da data real da máquina — usa sempre a data de referência injetada', () => {
    const otherNow = new Date('2020-03-05T00:00:00Z');
    expect(resolveFinancialPeriodPair('este mês versus o mês passado', otherNow)).toEqual({
      kind: 'RESOLVED',
      current: expect.objectContaining({ from: '2020-03-01', to: '2020-03-31' }),
      previous: expect.objectContaining({ from: '2020-02-01', to: '2020-02-29' }),
    });
  });
});
