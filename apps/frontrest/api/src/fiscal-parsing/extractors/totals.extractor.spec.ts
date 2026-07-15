import { TotalsExtractor } from './totals.extractor';
import { FiscalField } from '../types';

describe('TotalsExtractor', () => {
  const extractor = new TotalsExtractor();

  it('declara o campo TOTALS', async () => {
    expect(extractor.field).toBe(FiscalField.TOTALS);
  });

  it('extrai o total com rótulo "Total a Pagar", com confiança alta (rótulo específico)', async () => {
    const result = await extractor.extract('Total a Pagar: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
    expect(result?.confidence).toBe(85);
  });

  it('extrai o total com rótulo "Total" simples, com confiança mais baixa (rótulo genérico, ambíguo)', async () => {
    const result = await extractor.extract('Subtotal: 40,00€\nIVA: 5,90€\nTotal: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
    expect(result?.confidence).toBe(60);
  });

  it('extrai o total com rótulo "Grand Total" em formato EN', async () => {
    const result = await extractor.extract('Grand Total: $1,234.56');
    expect(result?.value).toEqual({ totalAmount: 1234.56 });
  });

  it('extrai o total com rótulo "Valor Total"', async () => {
    const result = await extractor.extract('Valor Total: 100,00€');
    expect(result?.value).toEqual({ totalAmount: 100 });
  });

  it('não confunde "Total do IVA" com o total da fatura', async () => {
    expect(await extractor.extract('Total do IVA: 4,60€')).toBeNull();
  });

  it('devolve null quando não há total', async () => {
    expect(await extractor.extract('Documento sem valores')).toBeNull();
  });

  describe('discriminação IVA/subtotal antes do total final (nunca fica com o primeiro "Total"-rotulado)', () => {
    it('prefere "Total a Pagar" a um "Total" genérico anterior no mesmo documento', async () => {
      const result = await extractor.extract(
        'Total: 89,00€\nIVA 23%: 20,55€\nTotal a Pagar: 109,55€',
      );
      expect(result?.value).toEqual({ totalAmount: 109.55 });
      expect(result?.confidence).toBe(85);
    });

    it('prefere "Total a Pagar" a um "Total Ilíquido" anterior (ambos com rótulo "total")', async () => {
      const result = await extractor.extract('Total Ilíquido: 89,00€\nTotal a Pagar: 109,55€');
      expect(result?.value).toEqual({ totalAmount: 109.55 });
    });

    it('entre dois rótulos específicos, fica com o último (o total final vem depois da discriminação)', async () => {
      const result = await extractor.extract('Valor Total: 89,00€\nTotal a Pagar: 109,55€');
      expect(result?.value).toEqual({ totalAmount: 109.55 });
    });
  });

  describe('documentos reais (validação manual, Fase 6.8+, texto OCR real de 3 PDFs distintos)', () => {
    it('"lotal (Furos): 14,50" — OCR real: "T" lido como "l", "Euros" como "Furos"', async () => {
      const result = await extractor.extract('lotal (Furos): 14,50');
      expect(result?.value).toEqual({ totalAmount: 14.5 });
    });

    it('"Total (Euros): 109,55" — anotação parentética de moeda entre o rótulo e o valor', async () => {
      const result = await extractor.extract('Total (Euros): 109,55');
      expect(result?.value).toEqual({ totalAmount: 109.55 });
    });

    it('"rotal (Euros): 37,80" — OCR real: "T" lido como "r" (Farmácia Monumental)', async () => {
      const result = await extractor.extract('rotal (Euros): 37,80');
      expect(result?.value).toEqual({ totalAmount: 37.8 });
    });

    it('"Base V.A. Total a pagar: 829,23 Eur" — texto real Mercedes, moeda depois do valor', async () => {
      const result = await extractor.extract('Base V.A. Total a pagar: 829,23 Eur');
      expect(result?.value).toEqual({ totalAmount: 829.23 });
    });

    it('nunca confunde "Subtotal" com "lotal"/"rotal" — \\b continua a proteger a fronteira de palavra', async () => {
      expect(await extractor.extract('Subtotal (Euros): 40,00')).toBeNull();
    });
  });

  describe('falsos positivos perigosos — nunca aceitar um código/entidade como se fosse um total (Fase 6.8+, "false positive hardening")', () => {
    it('nunca aceita um inteiro sem separador decimal como total (achado real, "Ovos Girão": código "Entidade" 4377 lido como total)', async () => {
      const text =
        'Entidade V/N.º Contrib. Data Transportado Total (EUR)\n4377 511094949 30/05/2025 30/05/2025 93,17';
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ totalAmount: 93.17 });
    });

    it('recupera "Total Factura" quando o valor está numa linha de dados alinhada, não na própria linha do rótulo (achado real, "JMV")', async () => {
      const text =
        'Valor liquido Descontos Valor Liquido Desc.Fin. Valor IVA Valor IEC Valor ECO Total Factura\n' +
        '(Imposto Pago\n' +
        '140,00 52,64 87,36 0,00 19,22 0,00 | ooo | 106,58';
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ totalAmount: 106.58 });
    });

    it('desqualifica um rótulo "Total" seguido de outra coisa que não pontuação/valor — mesmo quando outra ocorrência do rótulo, sem essa poluição, resolve corretamente (achado real, "Dismade": "Total 5 NA" era cabeçalho de coluna de produtos)', async () => {
      // "Total 5 NA" e "Total DOC €:" são ambos desqualificados (texto
      // não numérico logo a seguir ao rótulo, nunca pontuação/vazio) —
      // acaba em null, tal como o documento real (achado, não
      // assumido): sem nenhuma ocorrência resolvível, é mais seguro
      // devolver null do que arriscar o valor errado de uma linha de
      // produto vizinha.
      const text = 'Ref. Designação GM. PU Total 5 NA\nL & M Blue (1x20cig)\n1509 10 5,10 48,32 0%\nTotal DOC €: 445,11';
      const result = await extractor.extract(text);
      expect(result).toBeNull();
    });

    it('recupera "Total:" mesmo quando outras ocorrências não relacionadas do rótulo genérico existem no documento (achado real, "Coca-Cola": Total Produtos/IEC/Taras são desqualificadas, não ambíguas)', async () => {
      // "TOTAL PRODUTOS"/"TOTAL IEC"/"TOTAL TARAS" são desqualificados
      // (texto não numérico logo a seguir), nunca contam como
      // candidatos — só "Total:" (imediatamente seguido do valor)
      // resolve, por isso não há ambiguidade real aqui.
      const text =
        'Total: 145,54 Doc. Ref ZECD DO01/2810138672\n' +
        'TOTAL PRODUTOS 18,00 118,01\n' +
        'TOTAL IEC 6,33\n' +
        'TOTAL TARAS 0,00 0,00';
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ totalAmount: 145.54 });
      expect(result?.confidence).toBe(60);
    });

    it('devolve null quando duas ocorrências do rótulo genérico resolvem para valores diferentes, sem nenhum rótulo específico a desambiguar', async () => {
      const result = await extractor.extract('Total: 89,00€\nTotal: 120,50€');
      expect(result).toBeNull();
    });

    it('nunca aceita um total de valor exatamente zero', async () => {
      expect(await extractor.extract('Total a Pagar: 0,00€')).toBeNull();
    });
  });

  describe('explainRejection — diagnóstico para a ferramenta de debug (Fase 6.8+)', () => {
    it('explica a ambiguidade entre vários candidatos genéricos com valores diferentes', () => {
      const explanation = extractor.explainRejection('Total: 89,00€\nTotal: 120,50€');
      expect(explanation?.reason).toContain('valores candidatos');
      expect(explanation?.candidate).toContain('89,00');
      expect(explanation?.candidate).toContain('120,50');
    });

    it('devolve null quando extract() teria aceitado o resultado (nada a explicar)', () => {
      expect(extractor.explainRejection('Total a Pagar: 45,90€')).toBeNull();
    });

    it('devolve null quando não existiu nenhum candidato de todo', () => {
      expect(extractor.explainRejection('Documento sem valores')).toBeNull();
    });
  });

  describe('estruturas documentais genéricas (Fase 6.8+, "motor OCR fiscal português")', () => {
    it('supermercado — talão com TOTAL/TOTAL A PAGAR/TOTAL PAGO/TROCO, fica com o específico', async () => {
      const text = 'TOTAL 52,86\nTOTAL POUPANÇA (4,86)\nTOTAL A PAGAR 48,00\nTOTAL PAGO 50,00\nTROCO 2,00';
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ totalAmount: 48 });
    });

    it('combustível — talão compacto, "Total a Pagar" direto', async () => {
      const result = await extractor.extract('Gasóleo Simples 45,32L x 1,689€/L\nTotal a Pagar: 76,55€');
      expect(result?.value).toEqual({ totalAmount: 76.55 });
    });

    it('fatura A4 B2B — "Total Factura" após bloco de descontos/impostos', async () => {
      const text = 'Valor bruto 200,00\nDesconto 10,00\nIVA 23% 43,70\nTotal Factura: 233,70';
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ totalAmount: 233.7 });
    });

    it('talão térmico — só "Total:" sozinho, sem discriminação', async () => {
      const result = await extractor.extract('Papelaria Aliança\nTotal: 4,50€');
      expect(result?.value).toEqual({ totalAmount: 4.5 });
    });
  });
});
