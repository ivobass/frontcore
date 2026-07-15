import { FiscalParsingService } from './fiscal-parsing.service';
import type { FiscalExtractor } from './contracts';
import { FiscalField } from './types';
import type { ExtractionMatch, FiscalExtractionResult } from './types';
import {
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
} from './extractors';

function buildService(): FiscalParsingService {
  return new FiscalParsingService([
    new SupplierExtractor(),
    new TaxNumberExtractor(),
    new CustomerExtractor(),
    new InvoiceNumberExtractor(),
    new InvoiceDateExtractor(),
    new DueDateExtractor(),
    new CurrencyExtractor(),
    new TotalsExtractor(),
    new VatExtractor(),
  ]);
}

function stubExtractor<T>(field: FiscalField, match: ExtractionMatch<T> | null): FiscalExtractor<T> {
  return { field, extract: async () => match };
}

const REALISTIC_INVOICE = `Acme Distribuição Lda
Fornecedor: Acme Distribuição Lda
NIF: 123456789
Cliente: Restaurante Sabor Único, Lda

Fatura N.º: FA2026/1042
Data de Emissão: 12/07/2026
Data de Vencimento: 30/07/2026

Subtotal: 40,00€
IVA (23%): 9,20€
Total a Pagar: 49,20€`;

describe('FiscalParsingService', () => {
  const service = buildService();

  describe('parse — documento completo e bem formado', () => {
    let result: FiscalExtractionResult;

    beforeAll(async () => {
      result = await service.parse(REALISTIC_INVOICE);
    });

    it('extrai o fornecedor pelo rótulo explícito', () => {
      expect(result.supplier?.value).toEqual({ name: 'Acme Distribuição Lda' });
      expect(result.supplier?.confidence).toBe(85);
    });

    it('extrai o NIF do fornecedor', () => {
      expect(result.supplierTaxId?.value).toBe('123456789');
    });

    it('extrai o cliente', () => {
      expect(result.customer?.value).toEqual({ name: 'Restaurante Sabor Único, Lda' });
    });

    it('extrai o número, datas e moeda da fatura', () => {
      expect(result.invoice.number?.value).toBe('FA2026/1042');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
      expect(result.invoice.dueDate?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
      expect(result.invoice.currency?.value).toBe('EUR');
    });

    it('extrai o total (não o subtotal)', () => {
      expect(result.totals?.value).toEqual({ totalAmount: 49.2 });
    });

    it('extrai a taxa e o montante de IVA', () => {
      expect(result.vat?.value).toEqual({ rate: 23, amount: 9.2 });
    });

    it('calcula a confiança agregada como a média dos campos encontrados', () => {
      // supplier(85) + taxId(90) + customer(85) + invoiceNumber(85) +
      // issueDate(80) + dueDate(80) + currency(50) + totals(85, rótulo
      // específico "Total a Pagar") + vat(85).
      const expectedAverage = Math.round(
        (85 + 90 + 85 + 85 + 80 + 80 + 50 + 85 + 85) / 9,
      );
      expect(result.confidence).toBe(expectedAverage);
    });

    it('preenche metadata com todos os extractors corridos e os campos encontrados', () => {
      expect(result.metadata.extractorsRun).toHaveLength(9);
      expect(result.metadata.fieldsFound).toHaveLength(9);
      expect(result.metadata.fieldsFound).toEqual(expect.arrayContaining(Object.values(FiscalField)));
      expect(result.metadata.textLength).toBe(REALISTIC_INVOICE.length);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('parse — texto sem nenhuma informação fiscal reconhecível', () => {
    it('só o fornecedor é encontrado (fallback de 1ª linha, confiança baixa) — todos os outros campos null', async () => {
      const result = await service.parse('texto sem qualquer informação fiscal reconhecível');

      // SupplierExtractor nunca devolve null para texto não vazio — cai
      // sempre para a heurística de fallback (ver supplier.extractor.ts).
      // Confiança 45 (não 40): scoring multi-sinal (Fase 6.8+) dá um
      // pequeno bónus a qualquer candidato no topo do documento ("early"),
      // mesmo sem nenhum outro sinal estrutural — nunca um valor fixo.
      expect(result.supplier).toEqual({
        value: { name: 'texto sem qualquer informação fiscal reconhecível' },
        confidence: 45,
        source: 'texto sem qualquer informação fiscal reconhecível',
      });
      expect(result.supplierTaxId).toBeNull();
      expect(result.customer).toBeNull();
      expect(result.invoice).toEqual({ number: null, issueDate: null, dueDate: null, currency: null });
      expect(result.totals).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.confidence).toBe(45);
      expect(result.metadata.fieldsFound).toEqual([FiscalField.SUPPLIER]);
    });

    it('devolve absolutamente todos os campos null e confiança 0 para texto vazio (nem o fallback do fornecedor encontra uma 1ª linha)', async () => {
      const result = await service.parse('');

      expect(result.supplier).toBeNull();
      expect(result.supplierTaxId).toBeNull();
      expect(result.customer).toBeNull();
      expect(result.invoice).toEqual({ number: null, issueDate: null, dueDate: null, currency: null });
      expect(result.totals).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.metadata.fieldsFound).toHaveLength(0);
    });

    it('não lança para texto vazio', async () => {
      await expect(service.parse('')).resolves.not.toThrow();
    });
  });

  describe('parse — documento parcial (só alguns campos presentes)', () => {
    it('devolve null apenas para os campos não encontrados, preservando os restantes', async () => {
      const result = await service.parse('Fatura N.º: FA2026/1\nTotal a Pagar: 100,00€');

      expect(result.invoice.number?.value).toBe('FA2026/1');
      expect(result.totals?.value).toEqual({ totalAmount: 100 });
      expect(result.customer).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.invoice.issueDate).toBeNull();
      expect(result.invoice.dueDate).toBeNull();
    });
  });

  describe('documentos reais — "Farmácia Esperança" (validação manual, Fase 6.8+)', () => {
    it('extrai corretamente o 1º documento real (ATCUD adjacente ao número da fatura)', async () => {
      const text =
        'Fornecedor:\n\nFARMACIA ESPERANÇA\n\nFARMACIA ESPERANÇA LDA\n\nNIF: 509978142\n\n' +
        'Fatura Simplificada No ATCUD J6TFNCVS-47438\nFatura N.º FR-U006/47438\n\n' +
        'Data: 13-07-2026\n\nTotal a Pagar: 14,50€\n';

      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'FARMACIA ESPERANÇA' });
      expect(result.supplierTaxId?.value).toBe('509978142');
      expect(result.invoice.number?.value).toBe('FR-U006/47438');
      expect(result.totals?.value).toEqual({ totalAmount: 14.5 });
    });

    it('extrai o fornecedor/NIF/total do 2º documento real (número de fatura com prefixo separado por espaço)', async () => {
      // Campos tal como reportados pelo utilizador a partir do documento
      // real — "Número: FR U006/46931", sem a palavra "fatura" próxima.
      // `InvoiceNumberExtractor` exige essa palavra-chave (guarda
      // deliberada contra apanhar um "Nº" solto, ex. telefone — ver
      // `invoice-number.extractor.ts`) e por isso não extrai este campo
      // nesta forma exata; ver limitação documentada no relatório desta
      // fase. Os restantes campos, que não dependem dessa palavra-chave,
      // são todos extraídos corretamente.
      const text =
        'Fornecedor: FARMACIA ESPERANÇA\nNIF: 509978142\nNúmero: FR U006/46931\n' +
        'Data: 11/07/2026\nTotal: 109,55€';

      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'FARMACIA ESPERANÇA' });
      expect(result.supplierTaxId?.value).toBe('509978142');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-11T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 109.55 });
    });
  });

  describe('documentos reais — texto OCR bruto real (validação manual, Fase 6.8+, retirado da BD real)', () => {
    it('Farmácia Esperança — 3º PDF real: rejeita a data implausível (2096), extrai o resto que é recuperável', async () => {
      // ocrText tal como persistido pelo Worker real para este draft —
      // não uma reconstrução limpa. Nome do fornecedor precedido de "A"
      // solto (ruído de OCR de um logótipo) e NIF rotulado "NTF" em vez
      // de "NIF" (confusão real de OCR). Número da fatura e NIF ficam
      // por extrair nesta amostra em concreto — ver limitações
      // documentadas no relatório desta fase (palavra-chave "fatura"/
      // rótulo "NIF" ilegíveis do OCR não são recuperáveis por regex
      // sem arriscar falsos positivos noutros documentos).
      const text =
        'A\n\nFARMACIA ESPERANÇA\nFARMACTA ESPERANÇA LDA\ngia dA PRATA, 3\n' +
        '"IVO 167 SANTA (CJ\nS09970142 plo. NIF:509978142\n' +
        'FATURA-RECIBO N.t FR VO06/47490\nData: 13/07/2096 12:29:26\n' +
        'lotal (Furos): 14,50\nATCUD: JGTENCVS-47/438';

      const result = await service.parse(text);

      // Scoring multi-sinal (Fase 6.8+): prefere "FARMACTA ESPERANÇA LDA"
      // (sufixo legal LDA, sinal forte) a "FARMACIA ESPERANÇA" (sem
      // sufixo, apesar de melhor escrita) — o mesmo comportamento
      // validado contra o documento real desta farmácia (ver relatório
      // técnico); acentos/ruído de OCR não são prioridade (indicação
      // explícita do utilizador).
      expect(result.supplier?.value).toEqual({ name: 'FARMACTA ESPERANÇA LDA' });
      expect(result.supplierTaxId?.value).toBe('509978142'); // rótulo "NIF:" aparece uma 2ª vez, corretamente escrito
      expect(result.invoice.number).toBeNull(); // "N.t" — ruído de OCR sem prefixo de série recuperável
      expect(result.invoice.issueDate).toBeNull(); // ano 2096 — rejeitado por implausível
      expect(result.totals?.value).toEqual({ totalAmount: 14.5 }); // "lotal" — tolerância a confusão OCR T→l
    });

    it('Farmácia Monumental — PDF real: extrai fornecedor/NIF/data/número/total, todos os 5 campos recuperáveis', async () => {
      const text =
        'E MONUMENTAL\n\' FARMACTA MONUMENTAL UNIPESSOAL LDA\nESTRADA MONUMENTAL, 456J\n' +
        '9000-250 FUNCHAL\nCRC-FUNCHAL/ 09928 NIF:511234740\n' +
        'FATURA-RECIBO N.; FR UO03/151180\nData: 07/07/2026 14:53:22\n' +
        'rotal (Euros): 37,80';

      const result = await service.parse(text);

      // Scoring multi-sinal (Fase 6.8+): já não cai para a 1ª linha
      // truncada ("E MONUMENTAL", corte do OCR a montante) — encontra a
      // linha com o nome legal completo (sufixo "UNIPESSOAL LDA"), uma
      // melhoria direta face à heurística antiga de "primeira linha".
      expect(result.supplier?.value).toEqual({ name: "' FARMACTA MONUMENTAL UNIPESSOAL LDA" });
      expect(result.supplierTaxId?.value).toBe('511234740');
      expect(result.invoice.number?.value).toBe('FR UO03/151180');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-07T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 37.8 });
    });

    it('Mercedes-Benz Financial Services — PDF real: documento de financiamento, não uma "fatura" — extrai fornecedor/total, número/data ficam por extrair (layout sem os rótulos esperados, não um bug)', async () => {
      const text =
        'Mercedes-Benz Financial Services Portugal\nSociedade Financeira de Crédito, S.A.\n' +
        'FCL FCL231/231689097\nData Val 05-04-2026\n' +
        'Base V.A. Total a pagar: 829,23 Eur\nATCUD:JF56FCYX-231689097';

      const result = await service.parse(text);

      // Nome legal real desta entidade parte-se em duas linhas no OCR
      // ("Mercedes-Benz Financial Services Portugal" + "Sociedade
      // Financeira de Crédito, S.A."). O scoring multi-sinal (Fase 6.8+)
      // prefere a linha com sufixo legal (S.A.) — sinal genérico mais
      // forte do que "está no topo do documento" — mesmo perdendo a
      // marca comercial reconhecível; trade-off conhecido e documentado
      // no relatório técnico, não corrigido com uma regra específica
      // para este fornecedor (objetivo explícito: scoring genérico).
      expect(result.supplier?.value).toEqual({ name: 'Sociedade Financeira de Crédito, S.A.' });
      expect(result.totals?.value).toEqual({ totalAmount: 829.23 });
      // Documento de financiamento, não uma fatura portuguesa padrão —
      // nunca tem um rótulo "Fatura N.º"/"Data de Emissão" reconhecível;
      // arquiteturalmente fora do alcance destes extractors sem um novo
      // conjunto de rótulos dedicado a este tipo de documento.
      expect(result.invoice.number).toBeNull();
      expect(result.invoice.issueDate).toBeNull();
    });
  });

  describe('independência dos extractors', () => {
    it('cada extractor corre sobre o mesmo texto de forma isolada — um extractor lançar não é possível aqui, mas um "null" de um não afeta os outros', async () => {
      const result = await service.parse('Cliente: Restaurante Sabor Único, Lda');

      expect(result.customer?.value).toEqual({ name: 'Restaurante Sabor Único, Lda' });
      // SupplierExtractor cai para a heurística de fallback (scoring
      // multi-sinal), que aqui escolhe a própria linha do cliente —
      // demonstra que os extractors não partilham estado nem se corrigem
      // mutuamente. Confiança 70 (não 40): a linha tem sufixo legal
      // ("Lda") e está no topo do documento — sinais genuínos, mesmo
      // aplicados por engano a uma linha de cliente neste texto sintético.
      expect(result.supplier?.value).toEqual({ name: 'Cliente: Restaurante Sabor Único, Lda' });
      expect(result.supplier?.confidence).toBe(70);
    });
  });

  describe('vários extractors a competir pelo mesmo campo (ex. um extractor por país no futuro)', () => {
    it('vence o de maior confiança, independentemente da ordem de registo', async () => {
      const weak: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'FRACO',
        confidence: 30,
        source: 'fraco',
      });
      const strong: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'FORTE',
        confidence: 95,
        source: 'forte',
      });

      const weakFirst = await new FiscalParsingService([weak, strong]).parse('qualquer texto');
      const strongFirst = await new FiscalParsingService([strong, weak]).parse('qualquer texto');

      expect(weakFirst.supplierTaxId).toEqual({ value: 'FORTE', confidence: 95, source: 'forte' });
      expect(strongFirst.supplierTaxId).toEqual({ value: 'FORTE', confidence: 95, source: 'forte' });
    });

    it('em empate exato de confiança, vence o primeiro extractor a ser registado (regra determinística, não arbitrária)', async () => {
      const first: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'PRIMEIRO',
        confidence: 80,
        source: 'primeiro',
      });
      const second: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'SEGUNDO',
        confidence: 80,
        source: 'segundo',
      });

      const result = await new FiscalParsingService([first, second]).parse('qualquer texto');

      expect(result.supplierTaxId?.value).toBe('PRIMEIRO');
    });

    it('metadata.fieldsFound não duplica o campo mesmo com dois extractors a alimentá-lo', async () => {
      const a = stubExtractor(FiscalField.CURRENCY, { value: 'EUR', confidence: 50, source: 'a' });
      const b = stubExtractor(FiscalField.CURRENCY, { value: 'EUR', confidence: 85, source: 'b' });

      const result = await new FiscalParsingService([a, b]).parse('qualquer texto');

      expect(result.metadata.fieldsFound).toEqual([FiscalField.CURRENCY]);
    });
  });

  describe('rejectedCandidates — diagnóstico de falsos positivos (Fase 6.8+, "false positive hardening")', () => {
    it('nunca populado para um campo que foi encontrado, mesmo que outro candidato tivesse sido rejeitado', async () => {
      const result = await service.parse('Fatura N.º FA2026/1\nTotal a Pagar: 100,00€');
      expect(result.metadata.rejectedCandidates).toEqual([]);
    });

    it('explica a rejeição do número da fatura quando o candidato continha um termo reservado', async () => {
      const result = await service.parse('Fatura N.º FR Data: 2025-04-15');
      const rejection = result.metadata.rejectedCandidates.find((r) => r.field === FiscalField.INVOICE_NUMBER);
      expect(rejection).toEqual({
        field: FiscalField.INVOICE_NUMBER,
        candidate: 'FR Data',
        reason: expect.stringContaining('"data"'),
      });
      expect(result.invoice.number).toBeNull();
    });

    it('vazio ([]), nunca omitido, quando não há nada a explicar', async () => {
      const result = await service.parse('Documento sem qualquer informação fiscal reconhecível');
      expect(result.metadata.rejectedCandidates).toEqual([]);
    });
  });

  describe('confiança agregada nunca mascara falsos positivos (Objetivo D)', () => {
    it('um documento onde apenas fornecedor+data foram encontrados nunca reporta confiança "alta" que esconda a cobertura baixa', async () => {
      const result = await service.parse('Fornecedor: Acme Lda\nData de Emissão: 12/07/2026');
      // Só 2 dos 9 campos possíveis — a confiança agregada reflete só
      // esses 2 (85+80)/2=82,5→83; a cobertura real fica visível em
      // `metadata.fieldsFound.length`, nunca escondida dentro do
      // agregado.
      expect(result.metadata.fieldsFound).toHaveLength(2);
      expect(result.confidence).toBe(83);
    });

    it('um candidato rejeitado (número "FR Data") nunca contribui para a confiança agregada', async () => {
      // As duas variantes têm exatamente os mesmos campos reais
      // encontráveis (fornecedor + data) — só a 1ª tem, adicionalmente,
      // um candidato a número de fatura que acaba rejeitado.
      const withRejection = await service.parse('Fornecedor: Acme Lda\nFatura N.º FR Data: 12/07/2026');
      const withoutAnyInvoiceNumberAttempt = await service.parse('Fornecedor: Acme Lda\nData: 12/07/2026');
      // A confiança agregada é idêntica com ou sem o candidato
      // rejeitado — a rejeição nunca "conta" nem para mais nem para
      // menos no agregado, exatamente como um campo nunca tentado.
      expect(withRejection.confidence).toBe(withoutAnyInvoiceNumberAttempt.confidence);
      expect(withRejection.metadata.rejectedCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('documentos reais adicionais — estrutura documental, nunca por nome de fornecedor (Fase 6.8+)', () => {
    it('fatura A4 B2B com número puramente numérico sem "N.º" (achado real, "JMV")', async () => {
      const text =
        'ATCUD:JFTRH7W2-1712156028\n' +
        'Factura 1712156028\n' +
        'Data: 14/04/2025 (ORIGINAL)\n' +
        'Contribuinte: PT511094949\n' +
        'Data de Vencimento: 14/05/2025\n' +
        'Total Factura\n' +
        '(Imposto Pago\n' +
        '140,00 52,64 87,36 0,00 19,22 0,00 | ooo | 106,58';

      const result = await service.parse(text);

      expect(result.invoice.number?.value).toBe('1712156028');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2025-04-14T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 106.58 });
    });

    it('talão de supermercado com fornecedor/data/total, sem rótulo "Fornecedor:" (achado real, "Pingo Doce")', async () => {
      const text =
        'Lido Sol 11 - Distr.Prod.alimentares, S.A.\n' +
        'Registo C.R.C. Funchal-Matrícula/NIPC:511081383\n' +
        'TOTAL 52,86\n' +
        'TOTAL POUPANÇA (4,86)\n' +
        'TOTAL A PAGAR 48,00\n' +
        'TOTAL PAGO 50,00\n' +
        'Fatura/Recibo FR 00010027312041858/003161\n' +
        'Data de emissão: 19/05/2025';

      const result = await service.parse(text);

      // Fallback de 1ª linha, confiança baixa — sem rótulo explícito
      // "Fornecedor:" neste documento real.
      expect(result.supplier?.value).toEqual({ name: 'Lido Sol 11 - Distr.Prod.alimentares, S.A.' });
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2025-05-19T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 48 });
    });

    it('documento ambíguo — campos perigosos ficam null em vez de um valor duvidoso (achado real, "Coca-Cola")', async () => {
      const text =
        'Coca-Cola Europacific Partners Portugal, Unipessoal Lda\n' +
        'Fatura/Recibo : ZFRC B036/9823519819\n' +
        'os bens ora faturados foram entregues no seu adquirente na data de emissão da presente fatura';

      const result = await service.parse(text);

      // Sem "N.º" a ancorar e sem o candidato começar por um dígito
      // (limitação conhecida e aceite — ver invoice-number.extractor.ts)
      // — nunca "seu adquirente".
      expect(result.invoice.number).toBeNull();
    });
  });
});
