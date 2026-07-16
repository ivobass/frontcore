import { BadRequestException } from '@nestjs/common';
import { resolvePeriod } from './period.util';

describe('resolvePeriod', () => {
  it('devolve o mês atual (UTC) quando from/to são omitidos', () => {
    const now = new Date();
    const period = resolvePeriod();

    expect(period.from).toBe(
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
    );
    expect(period.gte.getUTCDate()).toBe(1);
    // `to` é o último dia do mês atual — confirmado indiretamente por `lt`
    // (exclusivo) ser exatamente 1 dia depois de `to`.
  });

  it('aceita from/to explícitos em YYYY-MM-DD', () => {
    const period = resolvePeriod('2026-07-01', '2026-07-31');
    expect(period.from).toBe('2026-07-01');
    expect(period.to).toBe('2026-07-31');
  });

  it('limite inferior é inclusivo (gte = from, à meia-noite UTC)', () => {
    const period = resolvePeriod('2026-07-01', '2026-07-31');
    expect(period.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('limite superior é exclusivo, um dia depois de "to" (nunca desloca por timezone)', () => {
    const period = resolvePeriod('2026-07-01', '2026-07-31');
    expect(period.lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('limite exclusivo atravessa corretamente a virada do ano', () => {
    const period = resolvePeriod('2026-12-01', '2026-12-31');
    expect(period.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejeita formato inválido (não ISO)', () => {
    expect(() => resolvePeriod('15-07-2026', '2026-07-31')).toThrow(BadRequestException);
  });

  it('rejeita mês impossível', () => {
    expect(() => resolvePeriod('2026-13-01', undefined)).toThrow(BadRequestException);
  });

  it('rejeita dia impossível (forma válida, calendário inválido — ex. 30 de fevereiro)', () => {
    expect(() => resolvePeriod('2026-02-30', undefined)).toThrow(BadRequestException);
  });

  it('rejeita from posterior a to', () => {
    expect(() => resolvePeriod('2026-07-31', '2026-07-01')).toThrow(BadRequestException);
  });

  it('aceita from igual a to (período de um único dia)', () => {
    const period = resolvePeriod('2026-07-15', '2026-07-15');
    expect(period.from).toBe('2026-07-15');
    expect(period.to).toBe('2026-07-15');
    expect(period.lt.toISOString()).toBe('2026-07-16T00:00:00.000Z');
  });
});
