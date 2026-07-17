import { BadRequestException } from '@nestjs/common';
import { currentMonth, previousMonth, resolveMonth } from './month.util';

describe('resolveMonth', () => {
  it('resolve um mês normal para os limites UTC corretos', () => {
    const result = resolveMonth('2026-07');

    expect(result.month).toBe('2026-07');
    expect(result.from).toBe('2026-07-01');
    expect(result.to).toBe('2026-07-31');
    expect(result.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result.lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('resolve corretamente um mês de 28 dias (fevereiro, ano não bissexto)', () => {
    const result = resolveMonth('2026-02');
    expect(result.to).toBe('2026-02-28');
  });

  it('resolve corretamente fevereiro num ano bissexto', () => {
    const result = resolveMonth('2028-02');
    expect(result.to).toBe('2028-02-29');
  });

  it('rejeita formato inválido', () => {
    expect(() => resolveMonth('2026-7')).toThrow(BadRequestException);
    expect(() => resolveMonth('2026/07')).toThrow(BadRequestException);
    expect(() => resolveMonth('julho-2026')).toThrow(BadRequestException);
  });

  it('rejeita mês impossível (00 ou 13)', () => {
    expect(() => resolveMonth('2026-00')).toThrow(BadRequestException);
    expect(() => resolveMonth('2026-13')).toThrow(BadRequestException);
  });
});

describe('previousMonth', () => {
  it('calcula o mês anterior dentro do mesmo ano', () => {
    expect(previousMonth('2026-07')).toBe('2026-06');
  });

  it('transição janeiro → dezembro do ano anterior', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('rejeita formato inválido', () => {
    expect(() => previousMonth('2026-7')).toThrow(BadRequestException);
  });
});

describe('currentMonth', () => {
  it('devolve sempre o formato YYYY-MM', () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it('coincide com a data UTC real do sistema', () => {
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(currentMonth()).toBe(expected);
  });

  it('aceita uma data de referência explícita, para testes determinísticos', () => {
    expect(currentMonth(new Date('2025-01-15T00:00:00Z'))).toBe('2025-01');
  });
});
