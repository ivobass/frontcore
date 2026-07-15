import { normalizeOcrDigits, DIGIT_LIKE_CLASS } from './ocr-normalize';

describe('normalizeOcrDigits', () => {
  it('substitui O por 0', () => {
    expect(normalizeOcrDigits('5O9978142')).toBe('509978142');
  });

  it('substitui I e l por 1', () => {
    expect(normalizeOcrDigits('5Il978142')).toBe('511978142');
  });

  it('substitui B por 8', () => {
    expect(normalizeOcrDigits('B09978142')).toBe('809978142');
  });

  it('substitui S por 5 e Z por 2', () => {
    expect(normalizeOcrDigits('S0997814Z')).toBe('509978142');
  });

  it('não altera uma string já totalmente numérica', () => {
    expect(normalizeOcrDigits('509978142')).toBe('509978142');
  });

  it('não altera letras que não fazem parte do conjunto confundível', () => {
    expect(normalizeOcrDigits('PT509978142')).toBe('PT509978142');
  });
});

describe('DIGIT_LIKE_CLASS', () => {
  it('é uma classe de carateres regex válida', () => {
    expect(() => new RegExp(DIGIT_LIKE_CLASS)).not.toThrow();
  });

  it('casa dígitos e as letras confundíveis usadas na captura solta', () => {
    const pattern = new RegExp(`^${DIGIT_LIKE_CLASS}$`);
    for (const char of ['0', '5', 'O', 'o', 'I', 'l', 'B', 'S', 'Z']) {
      expect(pattern.test(char)).toBe(true);
    }
    expect(pattern.test('x')).toBe(false);
  });
});
