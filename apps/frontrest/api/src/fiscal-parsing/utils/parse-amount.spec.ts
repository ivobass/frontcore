import { parseAmount } from './parse-amount';

describe('parseAmount', () => {
  it('interpreta formato PT/EU (vírgula decimal)', () => {
    expect(parseAmount('45,90')).toBe(45.9);
  });

  it('interpreta formato PT/EU com separador de milhares (ponto)', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
  });

  it('interpreta formato EN/US (ponto decimal)', () => {
    expect(parseAmount('45.90')).toBe(45.9);
  });

  it('interpreta formato EN/US com separador de milhares (vírgula)', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('interpreta vírgula sozinha como separador de milhares quando não tem 1-2 dígitos finais', () => {
    expect(parseAmount('1,234')).toBe(1234);
  });

  it('interpreta ponto sozinho como separador de milhares quando não tem 1-2 dígitos finais', () => {
    expect(parseAmount('1.234')).toBe(1234);
  });

  it('remove símbolos de moeda e espaços', () => {
    expect(parseAmount('€ 45,90')).toBe(45.9);
    expect(parseAmount('$45.90')).toBe(45.9);
  });

  it('interpreta números grandes PT com milhares e decimais', () => {
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
  });

  it('interpreta números grandes EN com milhares e decimais', () => {
    expect(parseAmount('1,234,567.89')).toBe(1234567.89);
  });

  it('interpreta um inteiro sem separadores', () => {
    expect(parseAmount('4590')).toBe(4590);
  });

  it('devolve null para texto sem dígitos', () => {
    expect(parseAmount('n/a')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
