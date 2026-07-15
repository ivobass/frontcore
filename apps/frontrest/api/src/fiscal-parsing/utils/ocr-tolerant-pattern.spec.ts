import { tolerantWord } from './ocr-tolerant-pattern';

describe('tolerantWord', () => {
  it('substitui apenas a letra maiúscula por uma classe tolerante, mantendo as minúsculas literais (achado real: "Total" → "lotal"/"rotal")', () => {
    expect(tolerantWord('Total')).toBe('[TIl1r]otal');
  });

  it('a classe tolerante do T casa com as variantes de OCR observadas', () => {
    const pattern = new RegExp(`^${tolerantWord('Total')}$`);
    for (const variant of ['Total', 'lotal', 'Iotal', '1otal', 'rotal']) {
      expect(pattern.test(variant)).toBe(true);
    }
    expect(pattern.test('Xotal')).toBe(false);
  });

  it('substitui apenas a letra C (marcada em maiúscula pelo chamador) por uma classe tolerante ao C↔G (achado real: "FARMACIA" → "FARMAGTA")', () => {
    expect(tolerantWord('farmaCia')).toBe('farma[CG]ia');
  });

  it('uma letra maiúscula sem grupo de confusão conhecido fica literal (com a sua própria capitalização)', () => {
    expect(tolerantWord('Farmacia')).toBe('Farmacia');
  });

  it('não altera letras sem grupo de confusão conhecido', () => {
    expect(tolerantWord('lda')).toBe('lda');
  });

  it('não altera dígitos nem pontuação', () => {
    expect(tolerantWord('T-2026')).toBe('[TIl1r]-2026');
  });
});
