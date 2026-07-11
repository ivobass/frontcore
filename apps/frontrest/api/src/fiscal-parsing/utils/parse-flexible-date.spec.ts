import { parseFlexibleDate } from './parse-flexible-date';

describe('parseFlexibleDate', () => {
  it('interpreta formato ISO YYYY-MM-DD', () => {
    const date = parseFlexibleDate('2026-07-12');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('interpreta formato DD/MM/YYYY', () => {
    const date = parseFlexibleDate('12/07/2026');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('interpreta formato DD-MM-YYYY', () => {
    const date = parseFlexibleDate('12-07-2026');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('interpreta formato DD.MM.YYYY', () => {
    const date = parseFlexibleDate('12.07.2026');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data de dentro de uma frase maior', () => {
    const date = parseFlexibleDate('Data de Emissão: 12/07/2026 — Vencimento: 30 dias');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('devolve null para datas sintaticamente inválidas (31 de fevereiro)', () => {
    expect(parseFlexibleDate('31/02/2026')).toBeNull();
  });

  it('devolve null para mês fora do intervalo 1-12', () => {
    expect(parseFlexibleDate('12/13/2026')).toBeNull();
  });

  it('devolve null quando não há nenhum padrão de data', () => {
    expect(parseFlexibleDate('sem data aqui')).toBeNull();
  });

  it('prefere o primeiro padrão ISO quando ambos os formatos aparecem no texto', () => {
    const date = parseFlexibleDate('2026-07-12 (12/07/2026)');
    expect(date?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });
});
