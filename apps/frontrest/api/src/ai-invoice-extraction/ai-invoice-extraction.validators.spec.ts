import {
  DECIMAL_LIMITS,
  isCanonicalDecimalString,
  isDecimalEqual,
  isDecimalWithinPrismaLimits,
  isNonNegativeDecimal,
  isValidPosition,
} from './ai-invoice-extraction.validators';

describe('isCanonicalDecimalString', () => {
  it.each(['1', '1.5', '1.500', '1234.56', '0', '0.0', '-5', '-5.25'])(
    'aceita %s como decimal canónico',
    (value) => {
      expect(isCanonicalDecimalString(value)).toBe(true);
    },
  );

  it.each(['abc', '12abc', '', 'NaN', 'Infinity', '1,25', '--1', '1.', '.5', '+1', '1e5', '1.2.3'])(
    'rejeita %s — nunca um decimal válido',
    (value) => {
      expect(isCanonicalDecimalString(value)).toBe(false);
    },
  );
});

describe('isDecimalWithinPrismaLimits', () => {
  it('rejeita imediatamente uma string não-canónica, sem tentar avaliar limites', () => {
    expect(isDecimalWithinPrismaLimits('abc', 12, 2)).toBe(false);
  });

  it('aceita um valor exatamente no limite (parte inteira e decimal ambas no máximo)', () => {
    expect(isDecimalWithinPrismaLimits('99999999999.999', 14, 3)).toBe(true);
  });

  it('rejeita quando a parte inteira excede precision - scale em 1 dígito', () => {
    expect(isDecimalWithinPrismaLimits('9999999999999.99', 14, 2)).toBe(false);
  });

  it('rejeita quando a parte decimal excede scale em 1 casa', () => {
    expect(isDecimalWithinPrismaLimits('1.234', 12, 2)).toBe(false);
  });

  /**
   * Correção pós-revisão Codex (achado 2) — a migração original da Fase
   * 6.14 mudou `InvoiceItem.quantity`/`InvoiceDraftItem.quantity` de
   * `Decimal(10,2)` para `Decimal(10,3)` e `unitPrice` de `Decimal(12,4)`
   * para `Decimal(12,4)`... na prática `Decimal(10,2)→Decimal(10,3)` e
   * `Decimal(12,2)→Decimal(12,4)`, reduzindo a capacidade da parte
   * inteira (8→7 dígitos para quantity, 10→8 para unitPrice) — um valor
   * que cabia no schema ANTES desta fase podia deixar de caber depois
   * dela. A correção usa `Decimal(11,3)`/`Decimal(14,4)`, preservando
   * exatamente a capacidade inteira anterior (8 e 10 dígitos,
   * respetivamente) enquanto acrescenta as casas decimais extra. Estes
   * testes prova que os valores-limite do schema ANTERIOR a esta fase
   * (8 dígitos inteiros + 2 decimais para quantity; 10 dígitos inteiros +
   * 2 decimais para unitPrice) continuam representáveis nos tipos
   * corrigidos.
   */
  it('quantity: valor-limite do schema anterior (8 dígitos inteiros + 2 decimais, Decimal(10,2)) continua válido em Decimal(11,3)', () => {
    expect(isDecimalWithinPrismaLimits('99999999.99', DECIMAL_LIMITS.quantity.precision, DECIMAL_LIMITS.quantity.scale)).toBe(
      true,
    );
  });

  it('quantity: 9 dígitos inteiros (nunca cabia nem antes nem depois) continua corretamente rejeitado', () => {
    expect(
      isDecimalWithinPrismaLimits('999999999.99', DECIMAL_LIMITS.quantity.precision, DECIMAL_LIMITS.quantity.scale),
    ).toBe(false);
  });

  it('unitPrice: valor-limite do schema anterior (10 dígitos inteiros + 2 decimais, Decimal(12,2)) continua válido em Decimal(14,4)', () => {
    expect(
      isDecimalWithinPrismaLimits('9999999999.99', DECIMAL_LIMITS.unitPrice.precision, DECIMAL_LIMITS.unitPrice.scale),
    ).toBe(true);
  });

  it('unitPrice: 11 dígitos inteiros (nunca cabia nem antes nem depois) continua corretamente rejeitado', () => {
    expect(
      isDecimalWithinPrismaLimits('99999999999.99', DECIMAL_LIMITS.unitPrice.precision, DECIMAL_LIMITS.unitPrice.scale),
    ).toBe(false);
  });

  it('totalPrice/headerAmount (Decimal(12,2), inalterado nesta correção): valor-limite continua válido', () => {
    expect(
      isDecimalWithinPrismaLimits('9999999999.99', DECIMAL_LIMITS.totalPrice.precision, DECIMAL_LIMITS.totalPrice.scale),
    ).toBe(true);
  });
});

describe('isDecimalEqual', () => {
  it('concorda quando ambos os valores são canónicos e numericamente iguais, mesmo com casas decimais diferentes', () => {
    expect(isDecimalEqual('142.6', '142.60')).toBe(true);
  });

  it('nunca concorda quando um dos lados usa vírgula decimal — tratado como inválido, nunca corrigido silenciosamente', () => {
    expect(isDecimalEqual('142.60', '142,60')).toBe(false);
  });

  it('nunca concorda com um prefixo parcialmente numérico (comportamento antigo de parseFloat permissivo)', () => {
    expect(isDecimalEqual('123.00abc', '123')).toBe(false);
  });

  it('respeita a tolerância para diferenças de arredondamento genuínas', () => {
    expect(isDecimalEqual('100.001', '100.004')).toBe(true);
    expect(isDecimalEqual('100.00', '100.01')).toBe(false);
  });
});

/**
 * Correção pós-revisão Codex (achado 3, ALTO — política de valores
 * negativos). Usada pelos campos financeiros de LINHA
 * (`quantity`/`unitPrice`/`vatRate`/`totalPrice`), alinhando o parser
 * de IA com `InvoiceDraftItemDto` (`@Min(0)` nos quatro campos) — nunca
 * usada para os totais de cabeçalho, que continuam a aceitar negativo
 * (descontos/notas de crédito, mesma regra de
 * `UpdateInvoiceDraftDto.totalAmount`).
 */
describe('isNonNegativeDecimal', () => {
  it.each(['0', '0.00', '1', '1.50', '99999.99'])('aceita %s — canónico e não-negativo', (value) => {
    expect(isNonNegativeDecimal(value)).toBe(true);
  });

  it.each(['-1', '-1.00', '-0.01', '-99999.99'])('rejeita %s — canónico mas negativo', (value) => {
    expect(isNonNegativeDecimal(value)).toBe(false);
  });

  it.each(['abc', '1,25', '', 'NaN'])('rejeita %s — nem sequer um decimal canónico', (value) => {
    expect(isNonNegativeDecimal(value)).toBe(false);
  });
});

describe('isValidPosition', () => {
  it.each([1, 2, 100])('aceita %s como position válida', (value) => {
    expect(isValidPosition(value)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, '1', null, undefined])('rejeita %s como position inválida', (value) => {
    expect(isValidPosition(value)).toBe(false);
  });
});
