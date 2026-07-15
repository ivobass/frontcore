import { TaxNumberExtractor } from './tax-number.extractor';
import { FiscalField } from '../types';

describe('TaxNumberExtractor', () => {
  const extractor = new TaxNumberExtractor();

  it('declara o campo SUPPLIER_TAX_ID', async () => {
    expect(extractor.field).toBe(FiscalField.SUPPLIER_TAX_ID);
  });

  it('extrai um NIF português (9 dígitos) com rótulo "NIF"', async () => {
    const result = await extractor.extract('NIF: 123456789');
    expect(result).toEqual({ value: '123456789', confidence: 90, source: expect.stringContaining('123456789') });
  });

  it('extrai um VAT intracomunitário com prefixo de país', async () => {
    const result = await extractor.extract('VAT Number: PT123456789');
    expect(result?.value).toBe('PT123456789');
  });

  it('extrai com rótulo "NIPC"', async () => {
    const result = await extractor.extract('NIPC 987654322');
    expect(result?.value).toBe('987654322');
  });

  it('extrai com rótulo "Contribuinte Nº" (achado real, "Ilha Pan")', async () => {
    const result = await extractor.extract('Contribuinte Nº 511132557');
    expect(result?.value).toBe('511132557');
  });

  it('extrai com rótulo "Contribuinte N.º:" (achado real, "Ovos Girão")', async () => {
    const result = await extractor.extract('Contribuinte N.º: 511022220');
    expect(result?.value).toBe('511022220');
  });

  it('extrai com rótulo "Tax ID"', async () => {
    const result = await extractor.extract('Tax ID: 123456789');
    expect(result?.value).toBe('123456789');
  });

  it('não confunde "vat" dentro de "activate" com um rótulo de NIF/VAT', async () => {
    expect(await extractor.extract('Please activate your account 123456789')).toBeNull();
  });

  it('devolve null sem rótulo, mesmo com uma sequência de 9 dígitos no texto', async () => {
    expect(await extractor.extract('Referência 123456789 sem contexto fiscal')).toBeNull();
  });

  describe('normalização de confusões de OCR (achado real, "Farmácia Esperança")', () => {
    it('reconhece "NTF" como confusão de OCR de "NIF" (I↔T)', async () => {
      const result = await extractor.extract('609978142 NTF 509978142');
      expect(result?.value).toBe('509978142');
    });

    it('recupera um NIF com "O" no lugar de "0"', async () => {
      const result = await extractor.extract('NIF: 5O9978142');
      expect(result?.value).toBe('509978142');
    });

    it('recupera um NIF com "I"/"l" no lugar de "1"', async () => {
      const result = await extractor.extract('NIF: 5Il978146');
      expect(result?.value).toBe('511978146');
    });

    it('devolve null quando a normalização não produz um número totalmente válido', async () => {
      // "X" não está no conjunto de letras confundíveis com dígitos —
      // nunca inventa um valor a partir de ruído não reconhecido.
      expect(await extractor.extract('NIF: 5X9978142')).toBeNull();
    });
  });

  describe('dígito de controlo do NIF português (achado real, Fase 6.12 — "Ilha Pan")', () => {
    it('aceita um NIF com dígito de controlo válido', async () => {
      // 511132557 é o NIF real do fornecedor no documento "Ilha Pan".
      expect(await extractor.extract('NIF: 511132557')).not.toBeNull();
    });

    it('rejeita um NIF com o formato certo (9 dígitos) mas dígito de controlo inválido', async () => {
      // 511004949 é o NIF do CLIENTE, indevidamente rotulado "NIF" no
      // mesmo documento "Ilha Pan" — falha o módulo 11 real, prova de
      // que não é preciso detetar "é do cliente" para o descartar: o
      // próprio número já não é um NIF português válido.
      expect(await extractor.extract('NIF: 511004949')).toBeNull();
    });

    it('não aplica o dígito de controlo a um VAT de 10-12 dígitos (não é NIF português)', async () => {
      const result = await extractor.extract('VAT Number: PT1234567890');
      expect(result?.value).toBe('PT1234567890');
    });
  });

  describe('vários candidatos no mesmo documento — vence o primeiro estruturalmente válido', () => {
    it('escolhe o candidato com checksum válido quando o primeiro rotulado "NIF" pertence ao cliente e falha o checksum (achado real, "Ilha Pan")', async () => {
      const text = 'Contribuinte Nº 511132557\ntexto de enchimento\nCliente\nNIF 511004949';
      const result = await extractor.extract(text);
      expect(result?.value).toBe('511132557');
    });
  });
});
