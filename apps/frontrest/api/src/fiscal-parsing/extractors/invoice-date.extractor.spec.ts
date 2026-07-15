import { InvoiceDateExtractor } from './invoice-date.extractor';
import { FiscalField } from '../types';

describe('InvoiceDateExtractor', () => {
  const extractor = new InvoiceDateExtractor();

  it('declara o campo INVOICE_DATE', async () => {
    expect(extractor.field).toBe(FiscalField.INVOICE_DATE);
  });

  it('extrai a data com rótulo "Data de Emissão"', async () => {
    const result = await extractor.extract('Data de Emissão: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(result?.confidence).toBe(80);
  });

  it('extrai a data com rótulo "Invoice Date" em formato ISO', async () => {
    const result = await extractor.extract('Invoice Date: 2026-07-12');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Date" simples', async () => {
    const result = await extractor.extract('Date: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Date of Issue"', async () => {
    const result = await extractor.extract('Date of Issue: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Issued on"', async () => {
    const result = await extractor.extract('Issued on: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('não confunde "Data de Vencimento" com data de emissão', async () => {
    expect(await extractor.extract('Data de Vencimento: 30/07/2026')).toBeNull();
  });

  it('devolve null quando não há data', async () => {
    expect(await extractor.extract('Documento sem datas')).toBeNull();
  });

  describe('nunca aceita data de emissão futura ou com ano implausível', () => {
    it('rejeita um ano trocado por ruído de OCR (achado real: "2026" lido como "2096")', async () => {
      const result = await extractor.extract('Data: 13/07/2096');
      expect(result).toBeNull();
    });

    it('rejeita uma data de emissão estritamente no futuro', async () => {
      const nextYear = new Date().getUTCFullYear() + 1;
      const result = await extractor.extract(`Data de Emissão: 01/01/${nextYear}`);
      expect(result).toBeNull();
    });

    it('aceita a data de hoje como emissão válida', async () => {
      const now = new Date();
      const dd = String(now.getUTCDate()).padStart(2, '0');
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = now.getUTCFullYear();
      const result = await extractor.extract(`Data de Emissão: ${dd}/${mm}/${yyyy}`);
      expect(result).not.toBeNull();
    });
  });

  describe('normalização de confusões de OCR — integração ponta-a-ponta (achado real, validação Docker)', () => {
    it('recupera um ano com letra confundível com dígito ("20Z6") através do próprio rótulo do extractor', async () => {
      // Achado real: `parseFlexibleDate` já tolerava isto isoladamente,
      // mas o rótulo deste extractor tinha o seu próprio grupo de data
      // com `\d` puro — a expressão inteira falhava antes de chegar a
      // `parseFlexibleDate`, anulando a tolerância. Só um teste ao
      // nível do extractor (não só de `parseFlexibleDate` isolado)
      // prova que a integração das duas peças funciona.
      const result = await extractor.extract('Data de Emissão: 13/07/20Z6');
      expect(result?.value.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    });

    it('recupera uma data em formato ISO com letra confundível', async () => {
      const result = await extractor.extract('Invoice Date: 2O26-07-13');
      expect(result?.value.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    });
  });
});
