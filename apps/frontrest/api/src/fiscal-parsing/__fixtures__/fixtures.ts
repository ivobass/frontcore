/**
 * Document Regression Test Suite (Fase 6.13) — descreve cada fixture,
 * nunca o texto OCR em si (isso vive no `.txt` correspondente, um
 * ficheiro por documento, para cada um poder ser revisto/versionado
 * isoladamente). Consumido por `fiscal-parsing.regression.spec.ts`.
 *
 * `expected` é a BASELINE ATUAL confirmada — nunca o resultado ideal.
 * Nunca alterar um valor aqui sem primeiro confirmar manualmente que o
 * extractor mudou de propósito (ver `docs/phases/phase-6.13-document-regression-test-suite.md`,
 * secção "Baseline"): primeiro corrige-se o extractor, valida-se à
 * mão, só depois se atualiza `expected` — nunca o contrário.
 */

export interface RegressionExpectation {
  supplierName: string | null;
  supplierConfidence: number | null;
  supplierTaxId: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  /** ISO 8601 ou `null`. */
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  vatRate: number | null;
  vatAmount: number | null;
}

export interface RegressionFixture {
  name: string;
  /** Nome do ficheiro `.txt` dentro deste diretório. */
  file: string;
  /** Porque este documento está na suite — obrigatório, uma frase concreta, nunca vaga. */
  reason: string;
  expected: RegressionExpectation;
}

export const REGRESSION_FIXTURES: RegressionFixture[] = [
  {
    name: 'Pingo Doce',
    file: 'pingo-doce.txt',
    reason:
      'SupplierExtractor deixou de escolher ruído de cabeçalho ("VOTE.") — agora escolhe a entidade legal real impressa na fatura, mesmo sem a marca comercial existir como texto limpo.',
    expected: {
      supplierName: 'Lido Sol 11 - Distr .Prod.álimentares, S.A.',
      supplierConfidence: 80,
      supplierTaxId: '511081383',
      customerName: null,
      invoiceNumber: null,
      issueDate: '2025-05-19T00:00:00.000Z',
      dueDate: null,
      currency: 'EUR',
      totalAmount: 48,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Ovos Girão',
    file: 'ovos-girao.txt',
    reason:
      'NIF do fornecedor só rotulado "Contribuinte N.º:" (Fase 6.12); fornecedor real fundido pelo OCR com o início da saudação ao cliente na mesma linha.',
    expected: {
      supplierName: 'NUNES & FREITAS, LDA Exmo.(s) Sr.(s)',
      supplierConfidence: 80,
      supplierTaxId: '511022220',
      customerName: null,
      invoiceNumber: null,
      issueDate: '2025-05-30T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: 93.17,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'JMV',
    file: 'jmv.txt',
    reason:
      'Linha ATCUD nunca deve vencer como fornecedor; NIF do fornecedor corretamente escolhido (dígito de controlo válido) apesar do NIF do cliente também aparecer no documento.',
    expected: {
      supplierName:
        'JMV - José Maria Vieira, SA - Rua Infante D. Henrique, 421 - 4435-288 Rio Tinto - NIF 503858471 Expedição: Armazêm do Funchal | SIRER: PTO1103071',
      supplierConfidence: 80,
      supplierTaxId: '503858471',
      customerName: '1005713 e SEEN, :',
      invoiceNumber: '1712156028',
      issueDate: '2025-04-14T00:00:00.000Z',
      dueDate: '2025-05-14T00:00:00.000Z',
      currency: null,
      totalAmount: 106.58,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Ilha Pan',
    file: 'ilha-pan.txt',
    reason:
      'Regressão do NIF do cliente (Fase 6.12): o documento tem dois NIF rotulados — o do cliente (511004949, checksum inválido) e o do fornecedor via "Contribuinte Nº" (511132557, checksum válido). Protege que o correto continua a vencer.',
    expected: {
      supplierName: '9125-042 Caniço IL HOPAN-Panificação e Pastelaria, Lda 133',
      supplierConfidence: 80,
      supplierTaxId: '511132557',
      customerName: null,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      currency: 'EUR',
      totalAmount: 36.7,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Coca-Cola',
    file: 'coca-cola.txt',
    reason:
      'Limitação conhecida documentada, não regressão: o único NIF rotulado no documento pertence ao cliente (estruturalmente válido, checksum passa) — protege que continua a ser este valor específico, não um valor pior. Também protege a moeda "USD" (falso positivo pré-existente, ruído de tabela OCR interpretado como "$") — documentado, não corrigido.',
    expected: {
      supplierName: 'Coca-Cola Europacific Partners Portugal, Unipessoal Lda SE oieA',
      supplierConfidence: 80,
      supplierTaxId: '511094949',
      customerName: null,
      invoiceNumber: null,
      issueDate: '2025-05-29T00:00:00.000Z',
      dueDate: null,
      currency: 'USD',
      totalAmount: 145.54,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Leroy',
    file: 'leroy.txt',
    reason:
      'Marca comercial ("Leroy Merlin") fundida pelo OCR com o nome da empresa cliente na mesma linha; único NIF válido do documento, sem forma segura de confirmar a quem pertence.',
    expected: {
      supplierName: 'BCM BRICOLAGE S.A, Rua Quinta do Paizinho 10/12, 2790- ima:',
      supplierConfidence: 80,
      supplierTaxId: '509854419',
      customerName: null,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      totalAmount: null,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Mercedes (FCL)',
    file: 'mercedes.txt',
    reason:
      'Documento de financiamento sem estrutura de fatura padrão — protege que nenhum campo é inventado (número/data/total continuam null) e que o nome do fornecedor, mesmo imperfeito, nunca regride para o ruído de cabeçalho original ("Pr").',
    expected: {
      supplierName: 'Mercedes-Bens Financial Services Portugal - Sociedade',
      supplierConfidence: 75,
      supplierTaxId: null,
      customerName: null,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      totalAmount: null,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Farmácia Esperança — PNG novo (OCR muito ruidoso)',
    file: 'farmacia-esperanca-png-novo.txt',
    reason:
      'Tolerância a erros de OCR severos ("FARMACTA ESPDI RANÇA" em vez de "FARMACIA ESPERANÇA") — protege que o sufixo legal continua a ser reconhecido apesar do ruído, sem inventar a ortografia correta.',
    expected: {
      supplierName: 'FARMACTA ESPDI RANÇA LDA',
      supplierConfidence: 80,
      supplierTaxId: null,
      customerName: null,
      invoiceNumber: 'FR VUNO6/47515',
      issueDate: '2026-07-13T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: 5.41,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Farmácia Esperança — PDF 1 (data implausível)',
    file: 'farmacia-esperanca-pdf-1.txt',
    reason:
      'Data de emissão implausível (ano 2096, dígito trocado por OCR) corretamente rejeitada (null, não um valor inventado); tolerância T→l em "lotal"; coluna correta do IVA (0,56, não a base 13,94).',
    expected: {
      supplierName: 'FARMACIA ESPERANÇA LDA',
      supplierConfidence: 70,
      supplierTaxId: '509978142',
      customerName: null,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      totalAmount: 14.5,
      vatRate: 4,
      vatAmount: 0.56,
    },
  },
  {
    name: 'Farmácia Esperança — PDF 2 (múltiplas taxas de IVA)',
    file: 'farmacia-esperanca-pdf-2.txt',
    reason:
      'Documento com duas taxas de IVA discriminadas (4% e 22%) — protege que a extração fica determinística com a primeira linha da tabela, sem oscilar entre execuções.',
    expected: {
      supplierName: 'FARMACIA ESPERANÇA LDA',
      supplierConfidence: 80,
      supplierTaxId: '509978142',
      customerName: null,
      invoiceNumber: 'FR vyoo6/4693',
      issueDate: '2026-07-11T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: null,
      vatRate: 4,
      vatAmount: 3.07,
    },
  },
  {
    name: 'Farmácia Esperança — PNG antigo (OCR limpo)',
    file: 'farmacia-esperanca-png-antigo.txt',
    reason:
      'Documento de controlo com OCR de alta qualidade — protege o caminho "feliz" (quase todos os campos corretos) contra qualquer regressão introduzida por hardening pensado para casos ruidosos.',
    expected: {
      supplierName: 'FARMACIA ESPERANCA LDA',
      supplierConfidence: 80,
      supplierTaxId: '509978142',
      customerName: null,
      invoiceNumber: 'FR U006/46931',
      issueDate: '2026-07-11T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: null,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Farmácia Monumental — PDF real (múltiplas taxas de IVA)',
    file: 'farmacia-monumental-real.txt',
    reason:
      'Segunda ocorrência real de múltiplas taxas de IVA (4% e 22%), documento distinto da Farmácia Esperança; protege a coluna correta do IVA (0,50, não a base 12,60).',
    expected: {
      supplierName: "|! FARMACTA MONUMENTAL UNIPESSOAL LDA",
      supplierConfidence: 80,
      supplierTaxId: '511234740',
      customerName: null,
      invoiceNumber: 'FR VUO03/151180',
      issueDate: '2026-07-07T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: 37.8,
      vatRate: 4,
      vatAmount: 0.5,
    },
  },
  {
    name: 'Farmácia Monumental — sintética (regressão do total colado à moeda)',
    file: 'farmacia-monumental-sintetica.txt',
    reason:
      'Regressão real corrigida na Fase 6.12: "Total a Pagar: 35,40EUR" (moeda colada ao valor sem separador) fazia `\\b` falhar na fronteira de palavra e o total desaparecia inteiro. Documento sintético com rótulos explícitos — isola exatamente este caso sem ruído de OCR à volta.',
    expected: {
      supplierName: 'Farmacia Monumental',
      supplierConfidence: 85,
      supplierTaxId: '511234740',
      customerName: null,
      invoiceNumber: 'FM-2026-42',
      issueDate: '2026-07-10T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: 35.4,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Datas incoerentes (sintético)',
    file: 'datas-incoerentes.txt',
    reason:
      'Verificação de coerência entre campos (Fase 6.12): dueDate anterior a issueDate deve ser descartado (null), sem afetar issueDate — única verificação de coerência hoje implementada em FiscalParsingService.',
    expected: {
      supplierName: 'Acme Distribuição Lda',
      supplierConfidence: 85,
      supplierTaxId: null,
      customerName: null,
      invoiceNumber: null,
      issueDate: '2026-07-10T00:00:00.000Z',
      dueDate: null,
      currency: null,
      totalAmount: null,
      vatRate: null,
      vatAmount: null,
    },
  },
  {
    name: 'Nota de crédito — total negativo (sintético)',
    file: 'nota-de-credito.txt',
    reason:
      'Categoria de documento em falta identificada na Fase 6.12: total com sinal negativo não é reconhecido pelo padrão de montante — protege o comportamento seguro (null, nunca um valor positivo inventado a partir de um negativo).',
    expected: {
      supplierName: 'Acme Distribuição Lda',
      supplierConfidence: 85,
      supplierTaxId: null,
      customerName: null,
      invoiceNumber: null,
      issueDate: '2026-07-09T00:00:00.000Z',
      dueDate: null,
      currency: 'EUR',
      totalAmount: null,
      vatRate: null,
      vatAmount: null,
    },
  },
];
