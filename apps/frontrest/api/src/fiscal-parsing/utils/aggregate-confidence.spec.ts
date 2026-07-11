import { aggregateConfidence } from './aggregate-confidence';

describe('aggregateConfidence', () => {
  it('devolve 0 para uma lista vazia', () => {
    expect(aggregateConfidence([])).toBe(0);
  });

  it('devolve a própria confiança para um único match', () => {
    expect(aggregateConfidence([{ value: 'x', confidence: 73 }])).toBe(73);
  });

  it('calcula a média simples de vários matches', () => {
    const matches = [
      { value: 'a', confidence: 85 },
      { value: 'b', confidence: 90 },
      { value: 'c', confidence: 65 },
    ];
    expect(aggregateConfidence(matches)).toBe(Math.round((85 + 90 + 65) / 3));
  });

  it('arredonda o resultado ao inteiro mais próximo', () => {
    const matches = [{ value: 'a', confidence: 80 }, { value: 'b', confidence: 85 }];
    expect(aggregateConfidence(matches)).toBe(83); // 82.5 -> 83
  });
});
