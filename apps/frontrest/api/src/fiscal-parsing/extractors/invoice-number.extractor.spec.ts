import { InvoiceNumberExtractor } from './invoice-number.extractor';
import { FiscalField } from '../types';

describe('InvoiceNumberExtractor', () => {
  const extractor = new InvoiceNumberExtractor();

  it('declara o campo INVOICE_NUMBER', async () => {
    expect(extractor.field).toBe(FiscalField.INVOICE_NUMBER);
  });

  it('extrai o número com rótulo "Fatura N.º"', async () => {
    const result = await extractor.extract('Fatura N.º: FA2026/123\nData: 12/07/2026');
    expect(result).toEqual({
      value: 'FA2026/123',
      confidence: 85,
      source: expect.stringContaining('FA2026/123'),
    });
  });

  it('extrai o número com rótulo "Invoice Number"', async () => {
    const result = await extractor.extract('Invoice Number: INV-00123');
    expect(result?.value).toBe('INV-00123');
  });

  it('extrai o número com "Invoice #"', async () => {
    const result = await extractor.extract('Invoice #A12345');
    expect(result?.value).toBe('A12345');
  });

  it('extrai o número com rótulo "Factura N.º" (variante ortográfica)', async () => {
    const result = await extractor.extract('Factura N.º: FT2026/9');
    expect(result?.value).toBe('FT2026/9');
  });

  it('devolve null quando não há rótulo de fatura/invoice', async () => {
    expect(await extractor.extract('Nº de telefone: 912345678')).toBeNull();
  });

  it('devolve null para texto sem número de fatura', async () => {
    expect(await extractor.extract('Documento sem identificação')).toBeNull();
  });

  describe('nunca confunde o rótulo "Nº ATCUD" com o número da fatura (achado real, "Farmácia Esperança")', () => {
    it('devolve null para "Fatura Simplificada Nº ATCUD: ..." — cabeçalho composto real', async () => {
      expect(
        await extractor.extract('Fatura simplificada No ATCUD J6TFNCVS-47438'),
      ).toBeNull();
    });

    it('devolve null para "Fatura N.º ATCUD-XXXXXXXX-NNNNNNNN"', async () => {
      expect(await extractor.extract('Fatura N.º ATCUD-J6TFNCVS-47438')).toBeNull();
    });

    it('devolve null para "invoice number ATCUD ..."', async () => {
      expect(await extractor.extract('invoice number ATCUD J6TFNCVS-47438')).toBeNull();
    });

    it('continua a extrair um número de fatura genuíno mesmo com um ATCUD adjacente na mesma linha', async () => {
      const result = await extractor.extract(
        'Fatura-Recibo n.: FR-U006/47438 ATCUD J6TFNCVS-47438',
      );
      expect(result?.value).toBe('FR-U006/47438');
    });

    it('continua a extrair um número de fatura genuíno numa fatura multipágina, com ATCUD só na página seguinte', async () => {
      const result = await extractor.extract(
        'Fatura N.º FR-U006/47438\n\n--- Página 2 ---\n\nATCUD: J6TFNCVS-47438\nTotal: 14,50€',
      );
      expect(result?.value).toBe('FR-U006/47438');
    });
  });

  describe('número com prefixo de série separado por espaço (achado real, "Farmácia Esperança", segundo documento)', () => {
    it('extrai "FR U006/46931" — série e corpo separados por um espaço', async () => {
      const result = await extractor.extract('Fatura N.º FR U006/46931\n\nData: 11/07/2026');
      expect(result?.value).toBe('FR U006/46931');
    });

    it('nunca "vaza" para o campo seguinte quando este está na mesma linha, separado só por espaço', async () => {
      const result = await extractor.extract('Fatura N.º FR U006/46931 Data 11/07/2026');
      expect(result?.value).toBe('FR U006/46931');
    });

    it('continua a extrair um número sem espaço quando não há prefixo de série separado', async () => {
      const result = await extractor.extract('Fatura N.º FR-U006/47438');
      expect(result?.value).toBe('FR-U006/47438');
    });
  });

  describe('documentos reais (validação manual, Fase 6.8+, texto OCR real)', () => {
    it('nunca captura um caráter de ruído solto como prefixo de série (achado real: "N.t" — OCR de "N.º")', async () => {
      // Texto OCR real ("Farmácia Esperança"): "N.t" é ruído de OCR
      // sobre "N.º"; antes desta correção, o "t" solto satisfazia
      // sozinho o prefixo de série (1 caráter chegava) e o resultado
      // capturado era literalmente "t FR" — pior do que null.
      const result = await extractor.extract(
        'FATURA-RECIBO N.t FR VO06/47490\nData: 13/07/2096 12:29:26',
      );
      expect(result).toBeNull();
    });

    it('extrai o número real da Farmácia Monumental com "N.;" (OCR trocou ":" por ";")', async () => {
      const result = await extractor.extract('FATURA-RECIBO N.; FR UO03/151180\nData: 07/07/2026');
      expect(result?.value).toBe('FR UO03/151180');
    });

    it('devolve null quando a própria palavra-chave "fatura" vem ilegível do OCR (limitação conhecida)', async () => {
      // Texto OCR real: "EATURA-RECIBO" (F lido como E) — sem a
      // palavra-chave "fatura"/"factura"/"invoice" reconhecível, não
      // há como distinguir isto de um "Nº" solto sem contexto (ex.
      // telefone) sem arriscar falsos positivos noutros documentos.
      const result = await extractor.extract('EATURA-RECIBO N.: FR voo6/4693!\nData: 11-07-2026');
      expect(result).toBeNull();
    });
  });

  describe('falsos positivos perigosos — nunca devolver termos reservados nem frases comuns (Fase 6.8+, "false positive hardening")', () => {
    it('rejeita um candidato que é o próprio rótulo do campo seguinte (achado real, "Dismade": "1430 Data")', async () => {
      // Texto OCR real: "Fatura 14 N.º 1430 Data: 2025-04-15" — sem a
      // guarda de termos reservados, "1430 Data" (prefixo + espaço +
      // "Data") satisfazia a estrutura do candidato por inteiro.
      const result = await extractor.extract('Fatura 14 N.º 1430 Data: 2025-04-15 ORIGINAL');
      expect(result?.value).toBe('1430');
    });

    it('nunca casa a palavra-chave dentro de outra palavra (achado real, "Coca-Cola": "faturados")', async () => {
      // Texto OCR real: "...os bens ora faturados foram entregues no
      // seu adquirente..." — sem \b a seguir à palavra-chave, "fatura"
      // casava dentro de "faturados"; sem exigir pontuação a seguir a
      // "no", a preposição comum "no" servia de sub-rótulo válido,
      // capturando "seu adquirente" como se fosse um número de fatura.
      const result = await extractor.extract(
        'os bens ora faturados foram entregues no seu adquirente na data de emissão da presente fatura',
      );
      expect(result).toBeNull();
    });

    it.each(['Data', 'Cliente', 'Adquirente', 'Contribuinte', 'Total', 'Valor', 'Morada', 'Telefone'])(
      'rejeita um candidato que começa pelo termo reservado "%s"',
      async (term) => {
        const result = await extractor.extract(`Fatura N.º ${term} 12345`);
        expect(result).toBeNull();
      },
    );
  });

  describe('número sem sub-rótulo "N.º" — só quando o candidato começa por um dígito (achado real, "JMV")', () => {
    it('extrai "Factura 1712156028" — palavra-chave seguida diretamente do número, sem "N.º"', async () => {
      const result = await extractor.extract('ATCUD:JFTRH7W2-1712156028\nFactura 1712156028\nData: 14/04/2025');
      expect(result?.value).toBe('1712156028');
      expect(result?.confidence).toBe(65); // confiança média — sem "N.º" a ancorar o candidato
    });

    it('nunca aceita um candidato iniciado por letra sem sub-rótulo (evita capturar a próxima palavra comum da frase)', async () => {
      // Achado real ("Ovos Girão"): "Fatura FT FA.2025/44048" não tem
      // "N.º"; permitir um prefixo de letras aqui arriscaria capturar
      // a próxima palavra qualquer depois de "Fatura" (ex.
      // "Simplificada", "Recibo") em qualquer outro documento — limitação
      // conhecida, aceite em vez de arriscada.
      const result = await extractor.extract('Fatura FT FA.2025/44048\nData Vencimento: 30/05/2025');
      expect(result).toBeNull();
    });
  });

  describe('explainRejection — diagnóstico para a ferramenta de debug (Fase 6.8+)', () => {
    it('explica a rejeição por termo reservado', () => {
      const explanation = extractor.explainRejection('Fatura N.º 1430 Data: 2025-04-15');
      expect(explanation).toEqual({
        candidate: '1430 Data',
        reason: expect.stringContaining('"data"'),
      });
    });

    it('explica a rejeição de um candidato ATCUD', () => {
      const explanation = extractor.explainRejection('Fatura Simplificada Nº ATCUD J6TFNCVS-47438');
      expect(explanation?.reason).toContain('ATCUD');
    });

    it('devolve null quando não existiu nenhum candidato a explicar (nunca "inventa" uma explicação)', () => {
      expect(extractor.explainRejection('Documento sem identificação')).toBeNull();
    });
  });
});
