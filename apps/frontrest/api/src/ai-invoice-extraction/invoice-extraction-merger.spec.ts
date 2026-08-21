import { reconcileInvoiceExtraction } from './invoice-extraction-merger';
import type { FiscalExtractionResult } from '../fiscal-parsing/types';
import type { AiInvoiceExtractionV1 } from './types/ai-invoice-extraction';

function emptyDeterministic(): FiscalExtractionResult {
  return {
    supplier: null,
    supplierTaxId: null,
    customer: null,
    invoice: { number: null, issueDate: null, dueDate: null, currency: null },
    totals: null,
    vat: null,
    confidence: 0,
    metadata: { extractorsRun: [], fieldsFound: [], processingTimeMs: 0, textLength: 0, rejectedCandidates: [] },
  };
}

function emptyAi(): AiInvoiceExtractionV1 {
  return {
    schemaVersion: '1',
    supplier: { name: null, taxId: null },
    invoice: { number: null, issueDate: null, dueDate: null, currency: null },
    totals: { subtotal: null, vatAmount: null, total: null },
    items: [],
  };
}

describe('reconcileInvoiceExtraction', () => {
  it('deterministic == AI → agreement, sugestão é o valor concordante', () => {
    const deterministic = emptyDeterministic();
    deterministic.supplierTaxId = { value: '511234740', confidence: 90 };
    const ai = { ...emptyAi(), supplier: { name: null, taxId: '511234740' } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.supplierTaxId).toEqual({
      status: 'agreement',
      deterministicValue: '511234740',
      aiValue: '511234740',
      suggestedValue: '511234740',
    });
  });

  it('deterministic != AI → conflict, nunca escolhe automaticamente (suggestedValue null)', () => {
    const deterministic = emptyDeterministic();
    deterministic.totals = { value: { totalAmount: 142.65 }, confidence: 80 };
    const ai = { ...emptyAi(), totals: { subtotal: null, vatAmount: null, total: '124.65' } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.total).toEqual({
      status: 'conflict',
      deterministicValue: '142.65',
      aiValue: '124.65',
      suggestedValue: null,
    });
  });

  it('deterministic vazio + AI presente → ai_only, sugestão é o valor da IA', () => {
    const deterministic = emptyDeterministic();
    const ai = { ...emptyAi(), invoice: { number: 'FA2026/1042', issueDate: null, dueDate: null, currency: null } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.invoiceNumber).toEqual({
      status: 'ai_only',
      deterministicValue: null,
      aiValue: 'FA2026/1042',
      suggestedValue: 'FA2026/1042',
    });
  });

  it('AI vazio (ou indisponível) + deterministic presente → deterministic_only, sugestão é o valor determinístico', () => {
    const deterministic = emptyDeterministic();
    deterministic.supplier = { value: { name: 'Acme Distribuição Lda' }, confidence: 85 };

    const result = reconcileInvoiceExtraction(deterministic, null);

    expect(result.supplierName).toEqual({
      status: 'deterministic_only',
      deterministicValue: 'Acme Distribuição Lda',
      aiValue: null,
      suggestedValue: 'Acme Distribuição Lda',
    });
  });

  it('ambos vazios → empty, sugestão null', () => {
    const result = reconcileInvoiceExtraction(emptyDeterministic(), emptyAi());

    expect(result.currency).toEqual({ status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null });
  });

  it('valor manual já existente tem prioridade absoluta — nunca reavaliado contra determinístico/IA, mesmo em conflito', () => {
    const deterministic = emptyDeterministic();
    deterministic.totals = { value: { totalAmount: 142.65 }, confidence: 80 };
    const ai = { ...emptyAi(), totals: { subtotal: null, vatAmount: null, total: '124.65' } };

    const result = reconcileInvoiceExtraction(deterministic, ai, { total: '999.99' });

    expect(result.total).toEqual({
      status: 'manual',
      deterministicValue: '142.65',
      aiValue: '124.65',
      suggestedValue: '999.99',
    });
  });

  it('correção humana explícita para null (o utilizador limpou o campo) também nunca é reavaliada', () => {
    const deterministic = emptyDeterministic();
    deterministic.invoice.currency = { value: 'EUR', confidence: 70 };

    const result = reconcileInvoiceExtraction(deterministic, emptyAi(), { currency: null });

    expect(result.currency).toEqual({ status: 'manual', deterministicValue: 'EUR', aiValue: null, suggestedValue: null });
  });

  it('valores monetários "iguais" mas com casas decimais diferentes (nunca vírgula) ainda contam como agreement', () => {
    const deterministic = emptyDeterministic();
    deterministic.totals = { value: { totalAmount: 142.6 }, confidence: 80 };
    const ai = { ...emptyAi(), totals: { subtotal: null, vatAmount: null, total: '142.60' } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.total.status).toBe('agreement');
  });

  /**
   * Correção pós-revisão Codex — o teste anterior afirmava que
   * `"142,60"` (vírgula decimal) contava como concordância com
   * `142.60`. Isto contradiz a Secção 10 da revisão: a comparação
   * monetária tem de usar o mesmo validador decimal estrito do parser
   * (`isDecimalEqual`), que rejeita vírgula como separador decimal — só
   * `parseAiInvoiceExtraction()` já garante que a IA nunca chega a
   * produzir uma string assim (o prompt já pede ponto decimal, e o
   * parser rejeitaria a resposta inteira se a IA o ignorasse); esta
   * função nunca deve "corrigir" silenciosamente um valor mal formado
   * que a chegasse mesmo assim (ex. um `manual` inserido por engano).
   * Comportamento corrigido: vírgula nunca concorda, mesmo que o valor
   * numérico "pareça" igual — vai para `conflict`, nunca `agreement`.
   */
  it('vírgula decimal nunca concorda automaticamente — tratada como valor inválido, nunca corrigida silenciosamente', () => {
    const deterministic = emptyDeterministic();
    deterministic.totals = { value: { totalAmount: 142.6 }, confidence: 80 };
    const ai = { ...emptyAi(), totals: { subtotal: null, vatAmount: null, total: '142,60' } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.total.status).toBe('conflict');
  });

  it('subtotal nunca tem contraparte determinística (FiscalExtractionResult não o extrai) — nunca "conflict"/"deterministic_only"', () => {
    const deterministic = emptyDeterministic();
    deterministic.totals = { value: { totalAmount: 123 }, confidence: 80 };
    const ai = { ...emptyAi(), totals: { subtotal: '100.00', vatAmount: null, total: '123.00' } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.subtotal).toEqual({
      status: 'ai_only',
      deterministicValue: null,
      aiValue: '100.00',
      suggestedValue: '100.00',
    });
  });

  it('datas determinísticas (Date) e da IA (string ISO) comparam corretamente quando concordam', () => {
    const deterministic = emptyDeterministic();
    deterministic.invoice.issueDate = { value: new Date('2026-03-05T00:00:00.000Z'), confidence: 90 };
    const ai = { ...emptyAi(), invoice: { number: null, issueDate: '2026-03-05', dueDate: null, currency: null } };

    const result = reconcileInvoiceExtraction(deterministic, ai);

    expect(result.issueDate.status).toBe('agreement');
    expect(result.issueDate.suggestedValue).toBe('2026-03-05');
  });

  it('items — sem contraparte determinística, passagem direta das linhas da IA', () => {
    const ai: AiInvoiceExtractionV1 = {
      ...emptyAi(),
      items: [
        { position: 1, description: 'Farinha', quantity: '2', unit: 'saco', unitPrice: '18.50', vatRate: '23', totalPrice: '37.00' },
      ],
    };

    const result = reconcileInvoiceExtraction(emptyDeterministic(), ai);

    expect(result.items).toEqual(ai.items);
  });

  it('items — IA indisponível (null) → lista vazia, nunca lança', () => {
    const result = reconcileInvoiceExtraction(emptyDeterministic(), null);
    expect(result.items).toEqual([]);
  });
});
