import { VatExtractor } from './vat.extractor';
import { FiscalField } from '../types';

describe('VatExtractor', () => {
  const extractor = new VatExtractor();

  it('declara o campo VAT', async () => {
    expect(extractor.field).toBe(FiscalField.VAT);
  });

  it('extrai taxa e montante juntos: "IVA (23%): 12,34€"', async () => {
    const result = await extractor.extract('IVA (23%): 12,34€');
    expect(result?.value).toEqual({ rate: 23, amount: 12.34 });
    expect(result?.confidence).toBe(85);
  });

  it('extrai taxa e montante em formato "VAT 20%: 5.00"', async () => {
    const result = await extractor.extract('VAT 20%: 5.00');
    expect(result?.value).toEqual({ rate: 20, amount: 5 });
  });

  it('extrai só a taxa quando não há montante próximo', async () => {
    const result = await extractor.extract('Sujeito a IVA 23% conforme legislação em vigor.');
    expect(result?.value).toEqual({ rate: 23 });
    expect(result?.confidence).toBe(70);
  });

  it('extrai só o montante quando não há taxa (com símbolo monetário)', async () => {
    const result = await extractor.extract('IVA: 12,34€');
    expect(result?.value).toEqual({ amount: 12.34 });
    expect(result?.confidence).toBe(65);
  });

  it('não confunde "IVA: 23" sem símbolo monetário com um montante', async () => {
    expect(await extractor.extract('IVA: 23')).toBeNull();
  });

  it('não confunde "vat" dentro de "activate" com uma taxa de IVA', async () => {
    expect(await extractor.extract('Please activate 23% of the discount policy')).toBeNull();
  });

  it('devolve null quando não há nenhuma menção a IVA/VAT', async () => {
    expect(await extractor.extract('Documento sem impostos')).toBeNull();
  });
});
