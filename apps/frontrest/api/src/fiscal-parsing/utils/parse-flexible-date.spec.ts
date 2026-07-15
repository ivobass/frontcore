import { parseFlexibleDate, isFutureDate } from './parse-flexible-date';

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

  describe('anos implausíveis (achado real: OCR trocou "2026" por "2096")', () => {
    it('devolve null para um ano muito abaixo do mínimo plausível', () => {
      expect(parseFlexibleDate('12/07/0026')).toBeNull();
    });

    it('devolve null para um ano muito acima do corrente (ruído de OCR, ex. 2096)', () => {
      expect(parseFlexibleDate('13/07/2096')).toBeNull();
    });

    it('aceita um ano dentro da folga plausível acima do corrente (vencimento a prazo)', () => {
      const yyyy = new Date().getUTCFullYear() + 1;
      expect(parseFlexibleDate(`01/01/${yyyy}`)).not.toBeNull();
    });
  });

  describe('normalização de confusões de OCR (ex. "20Z6" em vez de "2026")', () => {
    it('recupera um ano com "Z" no lugar de "2"', () => {
      const date = parseFlexibleDate('13/07/20Z6');
      expect(date?.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    });

    it('recupera um dia/mês com "O" no lugar de "0"', () => {
      const date = parseFlexibleDate('O2/O7/2026');
      expect(date?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
    });

    it('recupera uma data em formato ISO com letras confundíveis', () => {
      const date = parseFlexibleDate('2O26-07-13');
      expect(date?.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    });

    it('continua a rejeitar um ano implausível mesmo depois de normalizado', () => {
      // "2O96" normaliza para "2096" — continua implausível, a
      // normalização nunca contorna a validação de plausibilidade.
      expect(parseFlexibleDate('13/07/2O96')).toBeNull();
    });
  });
});

describe('isFutureDate', () => {
  it('devolve true para uma data estritamente depois de hoje', () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(isFutureDate(tomorrow)).toBe(true);
  });

  it('devolve false para a data de hoje', () => {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    expect(isFutureDate(todayUtc)).toBe(false);
  });

  it('devolve false para uma data no passado', () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    expect(isFutureDate(yesterday)).toBe(false);
  });
});
