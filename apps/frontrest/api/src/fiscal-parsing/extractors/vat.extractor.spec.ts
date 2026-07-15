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

  describe('tabela de discriminação de IVA (achado real: "Valor" confundido com "Valor IVA")', () => {
    it('extrai o valor de IVA correto (2ª coluna), não a base tributável (1ª coluna) — documento real 1', async () => {
      const result = await extractor.extract('Totais de IVA:\n\naxa Valor Valor IVA Líquido\n4% 13,94 0,56 14,50');
      expect(result?.value).toEqual({ rate: 4, amount: 0.56 });
      expect(result?.confidence).toBe(90);
    });

    it('extrai corretamente mesmo com o cabeçalho lido de forma diferente pelo OCR — documento real 2', async () => {
      const result = await extractor.extract(
        'Total (Euros): 109,55\nTotais de Va a oo\nTaxã valor Valor IVA Liquído\n4% 76,83 3,07 79,90\n22% 24,30 5,35 29,65',
      );
      expect(result?.value).toEqual({ rate: 4, amount: 3.07 });
    });

    it('extrai corretamente com o "T" de "Taxa" ausente do OCR — documento real 3 (Farmácia Monumental)', async () => {
      const result = await extractor.extract(
        "'ptais de IVA: DA ADO\naxa Valor Valor IVA Líquido\n4% 12,60 0,50 13,10\n22% 20,25 4,45 24,70",
      );
      expect(result?.value).toEqual({ rate: 4, amount: 0.5 });
    });

    it('nunca confunde uma tabela de linhas de produto (sem "IVA" nas proximidades) com a tabela de discriminação', async () => {
      const result = await extractor.extract(
        'Designação Unidade Preço Desconto Total\n1 ROLO PLAST BOLHA UNID. 10.24 0.00 10.24',
      );
      expect(result).toBeNull();
    });
  });
});
