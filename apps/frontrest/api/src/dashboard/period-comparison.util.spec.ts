import { compareAmount, compareCount } from './period-comparison.util';

describe('compareAmount', () => {
  it('aumento: variação absoluta/percentual/direção corretas', () => {
    expect(compareAmount('400.00', '200.00')).toEqual({
      current: '400.00',
      previous: '200.00',
      absoluteChange: '200.00',
      percentageChange: 100,
      direction: 'increase',
    });
  });

  it('diminuição', () => {
    const result = compareAmount('100.00', '400.00');
    expect(result.absoluteChange).toBe('-300.00');
    expect(result.percentageChange).toBe(-75);
    expect(result.direction).toBe('decrease');
  });

  it('valores iguais → unchanged, percentagem 0', () => {
    const result = compareAmount('150.00', '150.00');
    expect(result.direction).toBe('unchanged');
    expect(result.percentageChange).toBe(0);
  });

  it('período anterior zero → percentageChange null, nunca uma divisão por zero', () => {
    const result = compareAmount('150.00', '0.00');
    expect(result.percentageChange).toBeNull();
    expect(result.direction).toBe('increase');
  });

  it('nunca produz Infinity/-Infinity/NaN', () => {
    const result = compareAmount('0.00', '0.00');
    expect(Number.isFinite(result.percentageChange ?? 0)).toBe(true);
    expect(result.direction).toBe('unchanged');
  });
});

describe('compareCount', () => {
  it('aumento', () => {
    expect(compareCount(4, 2)).toEqual({
      current: '4',
      previous: '2',
      absoluteChange: '2',
      percentageChange: 100,
      direction: 'increase',
    });
  });

  it('período anterior zero → percentageChange null', () => {
    const result = compareCount(3, 0);
    expect(result.percentageChange).toBeNull();
    expect(result.direction).toBe('increase');
  });

  it('valores iguais → unchanged', () => {
    const result = compareCount(5, 5);
    expect(result.direction).toBe('unchanged');
    expect(result.percentageChange).toBe(0);
  });
});
