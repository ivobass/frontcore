import { parseAiInvoiceExtraction } from './ai-invoice-extraction.parser';

const VALID = {
  schemaVersion: '1',
  supplier: { name: 'Acme', taxId: '123456789' },
  invoice: { number: 'FA1', issueDate: '2026-03-05', dueDate: null, currency: 'EUR' },
  totals: { subtotal: '100.00', vatAmount: '23.00', total: '123.00' },
  items: [
    { position: 1, description: 'Item A', quantity: '2', unit: 'un', unitPrice: '10.00', vatRate: '23', totalPrice: '20.00' },
  ],
};

const VALID_LINE = VALID.items[0];

describe('parseAiInvoiceExtraction', () => {
  it('resposta válida é devolvida tal e qual (campos conhecidos)', () => {
    expect(parseAiInvoiceExtraction(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('JSON inválido devolve null, nunca lança', () => {
    expect(parseAiInvoiceExtraction('{isto não é json')).toBeNull();
  });

  it('schemaVersion diferente de "1" devolve null', () => {
    expect(parseAiInvoiceExtraction(JSON.stringify({ ...VALID, schemaVersion: '2' }))).toBeNull();
  });

  it('supplier em falta devolve null', () => {
    const { supplier: _supplier, ...rest } = VALID;
    expect(parseAiInvoiceExtraction(JSON.stringify(rest))).toBeNull();
  });

  it('invoice em falta devolve null', () => {
    const { invoice: _invoice, ...rest } = VALID;
    expect(parseAiInvoiceExtraction(JSON.stringify(rest))).toBeNull();
  });

  it('totals em falta devolve null', () => {
    const { totals: _totals, ...rest } = VALID;
    expect(parseAiInvoiceExtraction(JSON.stringify(rest))).toBeNull();
  });

  it('items que não é array devolve null', () => {
    expect(parseAiInvoiceExtraction(JSON.stringify({ ...VALID, items: 'não é array' }))).toBeNull();
  });

  it('items vazio é válido (fatura sem linhas legíveis)', () => {
    const result = parseAiInvoiceExtraction(JSON.stringify({ ...VALID, items: [] }));
    expect(result?.items).toEqual([]);
  });

  it('uma linha sem "position" numérico invalida a resposta inteira', () => {
    const invalidItems = [{ ...VALID_LINE, position: 'um' }];
    expect(parseAiInvoiceExtraction(JSON.stringify({ ...VALID, items: invalidItems }))).toBeNull();
  });

  it('uma linha sem "description" (ou vazia) invalida a resposta inteira', () => {
    const invalidItems = [{ ...VALID_LINE, description: '' }];
    expect(parseAiInvoiceExtraction(JSON.stringify({ ...VALID, items: invalidItems }))).toBeNull();
  });

  it('array/objeto de topo em vez de objeto devolve null', () => {
    expect(parseAiInvoiceExtraction(JSON.stringify([VALID]))).toBeNull();
    expect(parseAiInvoiceExtraction('null')).toBeNull();
    expect(parseAiInvoiceExtraction('"uma string"')).toBeNull();
  });

  /**
   * Correção pós-revisão Codex — o parser era demasiado permissivo:
   * chave obrigatória ausente virava `null`, tipo errado virava `null`,
   * propriedades extra eram ignoradas. Isto contradizia a promessa de
   * "fronteira estrutural real, independente do schema strict do
   * provider". Os três testes abaixo substituem diretamente os
   * equivalentes da versão anterior (que agora afirmariam um
   * comportamento incorreto) — nunca apenas apagados, sempre trocados
   * pelo comportamento correto e documentado aqui.
   */
  describe('fronteira estrutural estrita (correção pós-revisão Codex)', () => {
    it('chave obrigatória AUSENTE (nunca confundida com valor null presente) invalida a resposta inteira', () => {
      // Ausência real da chave "taxId" — distinto de `{ taxId: null }`, que é válido.
      const { taxId: _taxId, ...supplierWithoutTaxId } = VALID.supplier;
      const raw = JSON.stringify({ ...VALID, supplier: supplierWithoutTaxId });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('o mesmo campo, mas presente e explicitamente null, é válido', () => {
      const raw = JSON.stringify({ ...VALID, supplier: { ...VALID.supplier, taxId: null } });
      expect(parseAiInvoiceExtraction(raw)?.supplier.taxId).toBeNull();
    });

    it('uma linha com uma chave opcional ausente (nunca só null) invalida a resposta inteira', () => {
      const { unit: _unit, ...lineWithoutUnit } = VALID_LINE;
      const raw = JSON.stringify({ ...VALID, items: [lineWithoutUnit] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('propriedade adicional fora do schema (a qualquer nível) invalida a resposta inteira — nunca ignorada silenciosamente', () => {
      expect(parseAiInvoiceExtraction(JSON.stringify({ ...VALID, extraField: 'nunca devia estar aqui' }))).toBeNull();
      expect(
        parseAiInvoiceExtraction(JSON.stringify({ ...VALID, supplier: { ...VALID.supplier, extra: 'x' } })),
      ).toBeNull();
      expect(
        parseAiInvoiceExtraction(JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, extra: 'x' }] })),
      ).toBeNull();
    });

    it('tipo errado num campo nullable-string (nunca convertido para null) invalida a resposta inteira', () => {
      const raw = JSON.stringify({ ...VALID, supplier: { name: 'Acme', taxId: 123456789 } });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });
  });

  /**
   * Validação decimal canónica (correção pós-revisão Codex) — os
   * campos financeiros (`quantity`/`unitPrice`/`vatRate`/`totalPrice`
   * nas linhas; `subtotal`/`vatAmount`/`total` no cabeçalho) só aceitam
   * `null` ou uma string decimal canónica dentro dos limites Prisma do
   * campo — nunca `parseFloat` permissivo.
   */
  describe('validação decimal (correção pós-revisão Codex)', () => {
    it.each(['abc', '123abc', '', 'NaN', 'Infinity', '1,25', '--1', '1.', '.5'])(
      'decimal inválido "%s" num campo de linha invalida a resposta inteira',
      (invalidDecimal) => {
        const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, unitPrice: invalidDecimal }] });
        expect(parseAiInvoiceExtraction(raw)).toBeNull();
      },
    );

    it('decimal fora do limite Prisma da coluna (unitPrice, Decimal(14,4) — máx. 10 dígitos inteiros) invalida a resposta inteira', () => {
      const tooLarge = '1'.repeat(11) + '.00'; // 11 dígitos inteiros, excede o máximo de 10
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, unitPrice: tooLarge }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('decimal no limite exato do Prisma (10 dígitos inteiros para unitPrice) continua válido', () => {
      const atLimit = '1'.repeat(10) + '.00';
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, unitPrice: atLimit }] });
      expect(parseAiInvoiceExtraction(raw)?.items[0].unitPrice).toBe(atLimit);
    });

    it('decimal com mais casas decimais do que a escala da coluna (vatRate, Decimal(5,2) — máx. 2 casas) invalida a resposta', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, vatRate: '23.456' }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('valor negativo canónico num total de CABEÇALHO (ex. desconto/nota de crédito) é aceite', () => {
      const raw = JSON.stringify({ ...VALID, totals: { ...VALID.totals, total: '-45.50' } });
      expect(parseAiInvoiceExtraction(raw)?.totals.total).toBe('-45.50');
    });

    it('decimal inválido num campo de totals de cabeçalho também invalida a resposta inteira', () => {
      const raw = JSON.stringify({ ...VALID, totals: { ...VALID.totals, subtotal: 'abc' } });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });
  });

  /**
   * Política de valores negativos (correção pós-revisão Codex, achado
   * 3, ALTO). Antes desta correção o parser aceitava negativos em
   * QUALQUER campo decimal, incluindo os de linha — mas o DTO humano
   * equivalente (`InvoiceDraftItemDto`) já usa `@Min(0)` em
   * `quantity`/`unitPrice`/`vatRate`/`totalPrice`, criando duas regras
   * financeiras diferentes consoante a origem (IA vs. humano) para o
   * MESMO campo. Alinhado agora: negativo em qualquer campo financeiro
   * de LINHA invalida a resposta inteira — nunca a IA persiste um valor
   * que o utilizador não podia guardar manualmente pela mesma UI de
   * revisão. Os totais de CABEÇALHO continuam a aceitar negativo (teste
   * acima, "validação decimal") — não são tocados por esta secção.
   */
  describe('política de valores negativos (correção pós-revisão Codex, achado 3)', () => {
    it('quantity = "-1" invalida a resposta inteira', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, quantity: '-1' }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('unitPrice = "-1.00" invalida a resposta inteira', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, unitPrice: '-1.00' }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('vatRate = "-23" invalida a resposta inteira', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, vatRate: '-23' }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('totalPrice = "-20.00" invalida a resposta inteira (mesma regra Min(0) de InvoiceDraftItemDto)', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, totalPrice: '-20.00' }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('quantity = "0" continua válido — só negativo é rejeitado, nunca zero (mesma regra de Min(0), não Min(0.01))', () => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, quantity: '0' }] });
      expect(parseAiInvoiceExtraction(raw)?.items[0].quantity).toBe('0');
    });
  });

  /**
   * `position` (correção pós-revisão Codex, achado 4, MÉDIO) — tem de
   * representar a ordem EXATA do documento: para um array com N linhas,
   * `items[i].position` tem de ser exatamente `i + 1`. `[1, 3]`/`[2, 1]`
   * deixaram de ser aceites — a versão anterior tratava sequencialidade
   * como "ideal, nunca obrigatória"; esse teste está substituído pelos
   * abaixo, que passam a exigir sequencialidade exata (nunca
   * reordenada silenciosamente).
   */
  describe('validação de position — ordem exata (correção pós-revisão Codex, achado 4)', () => {
    it.each([0, -1, 1.5, Number.NaN])('position %s (linha única) invalida a resposta inteira', (invalidPosition) => {
      const raw = JSON.stringify({ ...VALID, items: [{ ...VALID_LINE, position: invalidPosition }] });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('[1, 2, 3] — sequência exata — é válida', () => {
      const raw = JSON.stringify({
        ...VALID,
        items: [
          { ...VALID_LINE, position: 1, description: 'Linha A' },
          { ...VALID_LINE, position: 2, description: 'Linha B' },
          { ...VALID_LINE, position: 3, description: 'Linha C' },
        ],
      });
      const result = parseAiInvoiceExtraction(raw);
      expect(result?.items.map((item) => item.position)).toEqual([1, 2, 3]);
    });

    it('[1, 3] — salto na sequência — invalida a resposta inteira', () => {
      const raw = JSON.stringify({
        ...VALID,
        items: [
          { ...VALID_LINE, position: 1, description: 'Linha A' },
          { ...VALID_LINE, position: 3, description: 'Linha B' },
        ],
      });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('[2, 1] — fora de ordem — invalida a resposta inteira', () => {
      const raw = JSON.stringify({
        ...VALID,
        items: [
          { ...VALID_LINE, position: 2, description: 'Linha A' },
          { ...VALID_LINE, position: 1, description: 'Linha B' },
        ],
      });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('[1, 2, 2] — posição duplicada — invalida a resposta inteira', () => {
      const raw = JSON.stringify({
        ...VALID,
        items: [
          { ...VALID_LINE, position: 1, description: 'Linha A' },
          { ...VALID_LINE, position: 2, description: 'Linha B' },
          { ...VALID_LINE, position: 2, description: 'Linha C' },
        ],
      });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });

    it('[0, 1] — primeira posição inválida — invalida a resposta inteira', () => {
      const raw = JSON.stringify({
        ...VALID,
        items: [
          { ...VALID_LINE, position: 0, description: 'Linha A' },
          { ...VALID_LINE, position: 1, description: 'Linha B' },
        ],
      });
      expect(parseAiInvoiceExtraction(raw)).toBeNull();
    });
  });
});
