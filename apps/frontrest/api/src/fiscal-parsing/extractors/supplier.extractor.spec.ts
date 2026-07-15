import { SupplierExtractor } from './supplier.extractor';
import { FiscalField } from '../types';

/**
 * Texto OCR verbatim de documentos reais (Fase 6.8+, investigação
 * direta na base de dados — ver relatório técnico). Usado tal como
 * capturado, ruído incluído, para validar o scoring contra o mesmo
 * texto que motivou o redesenho do SupplierExtractor.
 */
const JMV_TEXT =
  "ATCUD:JFTRH7W2-1712156028\nFactura 1712156028\nsw Data: 14/04/2025 (ORIGINAL) [=] Ee E:>L [5]\no bar pasa\nEI oo\n> o o oseo IA: .\nVendedor: Cristina Teixeira Pintada á do\n| cliente: 1005713 e SEEN, :\n\"osso o\nContribuinte: PT51 1094949 [Ok Mo dA\nNota de Pedido: 210970693 / 82647234 F\nViReferência: EN 1201/00011780\n' CAFETARIA BAR MONUMENTAL LIDO, LDA.\n| QUIOSQUE - LOJA 10\nLocal d \" — ” ' ESTRADA MONUMENTAL\nocal de Entrega\nCAFETARIA BAR MONUMENTAL LIDO, LDA FUNCHAL\nQUIOSQUE - LOJA 10 9000-098 FUNCHAL\nESTRADA MONUMENTAL\nFUNCHAL\nP-9000-098 FUNCHAL L\nData de Vencimento: 14/05/2025 IBAN: PT50 0010 0000 775761600016 3 SWIFT: BBPIPTPL\nExpedição: N/ Carro — Data: 15/04/2025 Hora: 09:00:00 EMAIE: COI\nVÁLIDO COMO RECIBO APÓS BOA COBRANÇA\nArtigo | Designação | Quantidade IEC | ECO | Preço Uni. Desconto IVA | Valor EUR\n408194 | ACUCAR TORRE CX 1600 SAC 4 GR —T s cx \" 28,00 | \"” 3Strát|/ 228] 87,36\n| Artigos/Serviços à disposição do cliente/prestados a partir da data da ex; dição: Data do início do transporte. ou, na ausência desta. da data de erhi: 4 factura.\n| | |\n| | | |\n] ] |\n|\n|\n| |\n| |\n] | | ] |\n| | | | |!\n| |\n| | | |\n| | | |\n| | |\n| | |\n|\n| | ]\nÊ Taxa: 22% — Incidência: B736 ” Valor IVA: 19,22 ]\n| Valor liquido | Descontos Valor Liquido Desc.Fin. | Valor IVA Valor IEC Valor ECO | Total Factura\n| (Imposto Pago |\n| 140,00 52,64 87,36 0,00 19,22 0,00 | ooo | 106,58\nIwGl-Processado por programa certificado n.º 631/AT Recebi as mercadorias constantes\ndeste documento\n1O Cliente:\nLo\nPágina 1 de 1\nJMV - José Maria Vieira, SA - Rua Infante D. Henrique, 421 - 4435-288 Rio Tinto - NIF 503858471 Expedição: Armazêm do Funchal | SIRER: PTO1103071";

const COCA_COLA_TEXT =
  "ATCUD: JFZH2NW8-9823518819\nFAZ EUROPACIFIC VOTA\n! Ca Cota sore ENS\nAS Os\nCoca-Cola Europacific Partners Portugal, Unipessoal Lda SE oieA\nOta. da Saimoura, Cabanas -2929-509 Azeitão - PORTUGAL AI A Fatura/Recibo : ZFRC B036/9823519819\nChamada para a -ede fixa nacional: +351 808 200 248, das 09n às 18h/ E) ESA .\nFale connosco através do nosso portal: my ccep.com Jó Data : 29-05-2025\nCLIENTE MORADA DE ENVIO\n9408970 9408970\nCAFETARIA E BAR DO MONUMENTAL LIDO LDA CAFETARIA E BAR DO MONUMENTAL LIDO LDA\nEN EST. MONUMENTAL CC MONUM LIDO 10 EN EST. MONUMENTAL CC MONUM LIDO 10\n9000-100-S. MARTINHO (Portugal) 9000-100-S. MARTINHO (Portugal)\nCIF/NIF: 511094949\nDOCUMENTO NUMERO DATA TIPO DE PAGAMENTO DATA VTO PAG.\nINTERNO 9823519819 29-05-2025 Reposição de Fundos ND 29-05-2025\nCLIENTE LOCAL DE ENTREGA / MORADA MORADA\n760261 CAFETARIA BAR MONUMENTAL LIDO EST MONUMENTAL CC MONUM LIDO 10 9000-100-S. MARTINHO 914962461\nEntrep: Madeira Rota Prevenda: 1PG\nRegião: ILHAS FF:F Cadeia: CRO000\nORIGINAL - CLIENTE Rota Distrib : PRRM19\n- [CODIGO EAN ART LOTE DESCRIÇÃO QUANTIDADE PREÇO VALOR BRUTO VALOR TIPO\n\" — Rr!\n£] Documento Int.: 8661869752 Data: 29-05-2025 Total: 145,54 Doc. Ref ZECD DO01/2810138672\n$| 0000054026711 0704419 FUZE MANGO PINA VR30 C24 1,00 21,60 21,60 nor\nê PROMO-DN MARCAS VR 8,21\n3 IEC 0,50 0,50\n3| SUB-TOTAL 24 13,89\n£| 0000054490246 0703023 COCACOLA VR35 C24 PT 3.00 22,32 66,96 nor\n8 PROMO-DN MARCAS VR -23,84\n8 IEC 1,94 5,83\n$ SUB-TOTAL 72 48,95\nz\n| 5601163100313 0717226 LUSO PET50 C24 (63) 3,00 14,90 44,70 sor\ng Desc Base 44,70 18,77\n| SUB-TOTAL 72 25,93\nÕõ\n£| 5601163060518 0007235 LUSO PET1 5L P6 11,00 6,75 74,25 nor\n\"a Desc Base 74,25 -38,68\n- SUB-TOTAL 66 35,57\nz\n:\nH TOTAL PRODUTOS 18,00 118,01\nH TOTAL IEC 6.33\nH\nz Cód TARAS QJdeUM P.UMt V.Liguide\nz 0000905 GRADE+GARRAFAS VR30 CAPPY 1,00 511 5,11\ná\nH 0000905 GRADE+GARRAFAS VR30 CAPPY -1,00 5,11 511\n3 0000906 GRADE+GARRAFAS VR35 3,00 5,11 15,33\n& 0000906 GRADE+GARRAFAS VR35 -3,00 5,11 15,33 j\nê q\nH 4\na TOTAL TARAS 0,00 0,00 |\ní :\nê\nj j\n3\n3\nz :\nà ]j\n3 :\n: 8u'G - Processado por programa certificado n º631/AT\n3 TIPO VALOR DE INCIDÊNCIA *% TAXA VALOR \"” É\nH l\n$ 4\nH\nÉ\n-\n3 IBAN:PT50001800000253770200106 É\nã\n1 MM o\n$\nFi ———=—d —— [ce t\nDecseto Lei Nº 106/2013, de 27 de Dezembro\nNota 1 As taras vasihame retormável relativas sos produtos faturados não propriedade da CCEP Portuza! e não foram transaccionadas, ficando expressamente acoróada a sua devolução, não estando sujeto a IVA - alinea d)do NTE ATI\nCIVA e exciuidas do regime de bens em circulação - alinea h) do nº1 Anº3º Em caso de Migio o tribunal de Comarca de Setúbal é o único competente\nNota 2 Sato indicação expressa em contrário constante deste documento . os bens ora faturados foram entregues no seu adquirente na data de emisado da presente fatura\nNota 3 Transporte que não ultrapassa os limao: de isenção prescritos em 1 1 3.6 do RPE. Note 4 À renponsabêdade pela gestão dos residuos de embalagens foi transíeida para a Entidade Gestora, Sociedade Ponto Verde Max formações\nmokuindo valores das prestações financesas fixadas a favor daquela, em www pontovorde puvov him";

const OVOS_GIRAO_TEXT =
  "(GIRÃO =\nA ATCUD: 11325CZ)-44048\n[NH SS AEAADO|\n' ' ab CA AE do\nEstá Tudo Aqui! = PSA fu x\nAE ISCA FADO!\nNUNES & FREITAS, LDA OVO =. 2 RENATA\nz p - AAA, \"|\nPRODUÇÃO AVÍCOLA, TRANSFORMAÇÃO (o) Exmo.(s) Se.(s) 3 BA A\nE COMÉRCIO DE PRODUTOS ALIMENTARES G ] RA ERA ANA eta te Enio,\nCAMINHO DO VITAL Nº 5: 9300-226 QUINTA GRANI 959 ' 1 o fo SI AO ent É fado\nContribuinte N.º: 511022220 «351 291 943 292 Estrada Monumental, C.C. Monumental Lido, 1º Li 10 ERA to) ExSATA!\nCapital Social 400 000,00 EUR (Rede fixa Nacional) pç E AAA o)\nCRC. deC Lobos sob N.º COO44 / 82.12.07 info &grupogirao.pt São Martinho O] BE AM 5:\nSociedade por Quotas www .grupogirao pt 9000-100 Funchal ENAÃA Kd Ss.\nIBAN : CGD PT50 0035 0192 00004020630 22º Comiro Se imealtagem N TAS Original\nFatura FT FA.2025/44048\no\nData Vencimento Condição Pagamento Entidade V/N.º Contrib. Requisição\n30/05/2025 30/05/2025 Pronto Pagamento 4377 511094949\no CL e o er ra EEE E 5110949\nArtigo — Descrição Lote Arm Qtd. Un. Pr. Unitário Desc. IVA Valor\n0304057 Oleo Alimentar Tempero Alta Classe Cx=12* 11 100425-28 Az 2000 UN 1,95000 5,00 12,00 3,70\n0313011 Leite UHT Estrela Atlantico M/G cx=6x11 07/11/2025 AB 36,000 — UN 0,83000 0,00 4,00 29,88\n0305336 Amendoim C/ Sal Trevi Cx 12 x 1 kg 101X AB 1000 UN 3,23000 3,00 22,00 313\n0207314 Queijo Edamer Fatias Dom Villas Cx 8 x 1,250 <g 070525 sn2 5000 — K6 6,54000 5,00 4,00 31,06\n0210445 Fiambre Sandwich Barra TD Cx 3x +- 35 kg 251050669 A2 3874 —&«G 2,76000 4,00 22,00 10,26\n0207070 Manteiga Gresso C/Sal 1 Kg (cx=6Uni) 18/10/2025 Ex) 1000 UN 9,23000 3,00 4,00 8,95\nVendedor: Joana Reis RO02 29/05/2025 14:26:30\nDescontos Comerciais Desconto Financeiro Mercadoria/Serviços IVA Total (EUR ) 93,17\n2,65 0,00 89,63 6,19\n1 , ” Atenção: Trocas e Devoluções. Ovor até 48h açós sto de\nQuadro Resumo de Impostos a Desc sed entrega Outros produtos alimentares: 7 dia úteis sã. ato\nTaxa/Valor Incid./Qtd. Total N/ Morada - 2075-05-30 /07:01 — V/ Morada Ce mnitega Deve ser verificada à quantidade e\nIVA (4,00) 69,89 280 CAMINHO DO VITAL Nº 58 - APARTA! Estrada Monumertal, C.C. Monum, O cia\nAtriportabilicade peis gestão de Embalagens e revicum\nIVA (12,00) 3,70 0,44 , de embalagem foi transferida para a Envdde Gestora\ne 1336 os QUINTA GRANDE São Martinho Novo Venda é Ponta Venda. Male infermuações, incluindo 6s\nIVA (22,00) 13,39 2,95 9300-226 QUINTA GRANDE 9000-100 São Martinho valores das prestações fianceras fiada à favor destas\nPortugal (Ilha da Madeira) Portugal (Ilha da Madeira) a e aa\na4Ct Processado por Programa Cenificado nº 0030/AT / ET FA 2025/44048 os Dens e/ou serviços foram colocados à dispos. são na data 30/05/2025.\nFA TA Obrigado!\n(GIRÃO\nEstá Tudo Aqui!\nNUNES & FREITAS, LDA Exmo.(s) Sr.(s)\nCafetaria e Bar do Monumental Lido, Lda\nEstrada Monumental, C.C. Monumental Lido, 1º Lj 10\nVendedor: Joana Reis\nRO02 São Martinho\n9000-100 Funchal\nOriginal\nTalão de Conferência N.º 2025/44048\n——«————-«——-«———«—————————«—s «<Q qq a —rxr—rrrrrry\nEntidade V/N.º Contrib. Data Transportado Total (EUR)\n4377 511094949 30/05/2025 30/05/2025 93,17\n29/05/2025 14:26:30\n24Ct-Processado por Programa Certificado nº 0030/AT / FT FA 2025/44048 | \" ASSINATURA E CARIMBO";

describe('SupplierExtractor', () => {
  const extractor = new SupplierExtractor();

  it('declara o campo SUPPLIER', async () => {
    expect(extractor.field).toBe(FiscalField.SUPPLIER);
  });

  it('extrai o nome com rótulo "Fornecedor:"', async () => {
    const result = await extractor.extract('Fornecedor: Acme Distribuição Lda\nFatura N.º FA2026/1');
    expect(result).toEqual({
      value: { name: 'Acme Distribuição Lda' },
      confidence: 85,
      source: expect.stringContaining('Acme Distribuição Lda'),
    });
  });

  it('extrai o nome com rótulo "Supplier:"', async () => {
    const result = await extractor.extract('Supplier: Global Foods Inc.');
    expect(result?.value).toEqual({ name: 'Global Foods Inc.' });
  });

  it('extrai o nome com rótulo "Emitente:"', async () => {
    const result = await extractor.extract('Emitente: Padaria Central, Lda');
    expect(result?.value).toEqual({ name: 'Padaria Central, Lda' });
    expect(result?.confidence).toBe(85);
  });

  it('extrai o nome com rótulo "Vendor:"', async () => {
    const result = await extractor.extract('Vendor: Global Foods Inc.');
    expect(result?.value).toEqual({ name: 'Global Foods Inc.' });
  });

  it('extrai o nome com rótulo "Issued by:"', async () => {
    const result = await extractor.extract('Issued by: Acme Distribuição Lda');
    expect(result?.value).toEqual({ name: 'Acme Distribuição Lda' });
  });

  it('cai para o candidato com melhor pontuação quando não há rótulo, com confiança dinâmica (não fixa) refletindo os sinais encontrados', async () => {
    const result = await extractor.extract('Acme Distribuição Lda\nRua Principal, 123\nFatura N.º FA2026/1');
    // "Acme Distribuição Lda" tem sufixo legal (Lda) e morada vizinha
    // ("Rua Principal, 123") — confiança acima da baseline de 40 porque
    // reflete esses sinais, nunca um valor fixo (Fase 6.8+, objetivo
    // explícito de confiança dinâmica).
    expect(result).toEqual({
      value: { name: 'Acme Distribuição Lda' },
      confidence: 80,
      source: 'Acme Distribuição Lda',
    });
  });

  it('sem nenhum sinal estrutural (sem sufixo legal, sem NIF/telefone/morada perto, fora do topo do documento), a confiança do fallback fica na baseline baixa', async () => {
    // As 5 primeiras linhas são demasiado curtas para serem candidatas
    // (< MIN_SUPPLIER_NAME_LENGTH) — usadas só para empurrar o
    // candidato real para além do índice 5 e assim isolar o caso "zero
    // sinais", já que estar no topo do documento é, por si, um sinal
    // (bónus "early").
    const result = await extractor.extract('A\nB\nC\nD\nE\nQualquer Texto Aleatorio\nMais texto sem sinais');
    expect(result?.value).toEqual({ name: 'Qualquer Texto Aleatorio' });
    expect(result?.confidence).toBe(40);
  });

  it('ignora linhas vazias iniciais ao usar o fallback', async () => {
    const result = await extractor.extract('\n\n  Acme Lda  \nRua Principal, 123');
    expect(result?.value).toEqual({ name: 'Acme Lda' });
  });

  it('devolve null para texto totalmente vazio', async () => {
    expect(await extractor.extract('')).toBeNull();
  });

  describe('nunca aceita nomes demasiado curtos (achado real: OCR devolveu "To" como fornecedor)', () => {
    it('rejeita um rótulo explícito com valor de 2 caracteres, sem cair no fallback', async () => {
      const result = await extractor.extract('Fornecedor: To\nNIF: 509978142');
      expect(result).toBeNull();
    });

    it('rejeita um rótulo explícito com valor de 1 caractere', async () => {
      const result = await extractor.extract('Emitente: X\nData: 13/07/2026');
      expect(result).toBeNull();
    });

    it('aceita um rótulo explícito com exatamente o comprimento mínimo (3)', async () => {
      const result = await extractor.extract('Fornecedor: EDP\nNIF: 509978142');
      expect(result?.value).toEqual({ name: 'EDP' });
    });

    it('o fallback sem rótulo salta linhas demasiado curtas e usa a primeira linha válida', async () => {
      const result = await extractor.extract('To\nRua Principal, 123');
      expect(result?.value).toEqual({ name: 'Rua Principal, 123' });
    });

    it('rejeita o fallback sem rótulo quando nenhuma linha atinge o comprimento mínimo', async () => {
      const result = await extractor.extract('To\nX\nAB');
      expect(result).toBeNull();
    });
  });

  describe('scoring multi-sinal do fallback (Fase 6.8+ — "SupplierExtractor scoring")', () => {
    it('prefere uma linha com sufixo legal (LDA) a uma linha genérica anterior sem nenhum sinal', async () => {
      const result = await extractor.extract('Texto de cabeçalho qualquer sem sinais\nMercearia Silva & Filhos Lda\nRua das Flores, 10');
      expect(result?.value).toEqual({ name: 'Mercearia Silva & Filhos Lda' });
    });

    it('prefere uma linha perto de "NIF:" a uma linha só com sufixo legal mais distante', async () => {
      const text = [
        'Sociedade Genérica Qualquer, Lda',
        'texto de enchimento sem qualquer sinal estrutural',
        'texto de enchimento sem qualquer sinal estrutural',
        'texto de enchimento sem qualquer sinal estrutural',
        'texto de enchimento sem qualquer sinal estrutural',
        'texto de enchimento sem qualquer sinal estrutural',
        'Oficina do Motor Unipessoal',
        'NIF: 509978142',
      ].join('\n');
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ name: 'Oficina do Motor Unipessoal' });
    });

    it('nunca deixa uma linha ATCUD vencer como fornecedor, mesmo perto do topo do documento', async () => {
      const result = await extractor.extract('ATCUD: JFTRH7W2-1712156028\nRestaurante O Bom Garfo, Lda\nRua Central, 5');
      expect(result?.value).toEqual({ name: 'Restaurante O Bom Garfo, Lda' });
    });

    it('nunca deixa uma data solta no início da linha vencer como fornecedor', async () => {
      const result = await extractor.extract('13/07/2026 19:99:96\nPosto de Combustível Atlântico, Lda\nAv. do Mar, 200');
      expect(result?.value).toEqual({ name: 'Posto de Combustível Atlântico, Lda' });
    });

    it('penaliza uma linha vizinha de uma secção de CLIENTE, favorecendo o candidato do fornecedor', async () => {
      const text = [
        'Hotel Vista Mar, S.A.',
        'Av. Litoral, 88',
        'NIF: 511081383',
        'CLIENTE',
        'Nome do Cliente Qualquer Empresa, Lda',
      ].join('\n');
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ name: 'Hotel Vista Mar, S.A.' });
    });

    it('não penaliza um candidato só porque contém "Exmo" na PRÓPRIA linha (achado real: OCR funde colunas de fornecedor e cliente numa só linha)', async () => {
      const text = [
        'Nunes & Freitas, Lda Exmo.(s) Sr.(s)',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'Sociedade Qualquer Concorrente, Lda',
      ].join('\n');
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ name: 'Nunes & Freitas, Lda Exmo.(s) Sr.(s)' });
    });

    it('usa a repetição da linha no documento como desempate leve, nunca como sinal dominante sobre a proximidade a NIF', async () => {
      const text = [
        'Nome do Cliente Repetido, Lda',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'Fornecedor Verdadeiro, SA',
        'NIF: 511081383',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'texto de enchimento',
        'Nome do Cliente Repetido, Lda',
      ].join('\n');
      const result = await extractor.extract(text);
      expect(result?.value).toEqual({ name: 'Fornecedor Verdadeiro, SA' });
    });
  });

  describe('regressão explícita — nunca reintroduzir estes falsos positivos (Fase 6.8+)', () => {
    it('nunca aceita "seu adquirente" (frase de nota legal) como fornecedor', async () => {
      const text =
        'Coca-Cola Europacific Partners Portugal, Unipessoal Lda\nRua da Amoura, Cabanas\n' +
        'os bens ora faturados foram entregues no seu adquirente na data de emissão da presente fatura';
      const result = await extractor.extract(text);
      expect(result?.value.name).not.toMatch(/seu adquirente/i);
    });

    it('nunca aceita "1430 Data" (fragmento de número de fatura + rótulo de data) como fornecedor', async () => {
      const result = await extractor.extract('Fatura 14 N.º 1430 Data: 2025-04-15 ORIGINAL\nDismade — Distribuição da Madeira S.A.');
      expect(result?.value.name).not.toBe('1430 Data');
    });

    it('nunca aceita "4377" (código de entidade solto) como fornecedor', async () => {
      const result = await extractor.extract('4377 511094949\nNunes & Freitas, Lda');
      expect(result?.value.name).not.toBe('4377');
    });

    it('nunca aceita uma linha "ATCUD" como fornecedor', async () => {
      const result = await extractor.extract('ATCUD: JJWGRY65 — 1430\nDismade — Distribuição da Madeira S.A.');
      expect(result?.value.name).not.toMatch(/^atcud/i);
    });
  });

  describe('documentos reais (Fase 6.8+ — texto OCR verbatim de documentos reais, ver relatório técnico)', () => {
    it('Pingo Doce: identifica a entidade legal impressa na fatura, nunca "VOTE." (cabeçalho corrompido pelo OCR)', async () => {
      const text = 'VOTE.\nPOR fem Si\nO vam pad”\nHIPER\nTel.: 291722080\nLido Sol 11 - Distr .Prod.álimentares, S.A.\nSede: Sítio do Poço Barral ,São Martinho, Funchal\nRegisto C.R.C. Funchal-Matrícula/NIPC:511081383\nANREEE: PTOCIZ3O À C. Social: 12.500.000 EUR';
      const result = await extractor.extract(text);
      expect(result?.value.name).toBe('Lido Sol 11 - Distr .Prod.álimentares, S.A.');
      expect(result?.value.name).not.toBe('VOTE.');
    });

    it('JMV: identifica a linha de rodapé com o nome legal, nunca a linha ATCUD', async () => {
      const result = await extractor.extract(JMV_TEXT);
      expect(result?.value.name).toContain('JMV');
      expect(result?.value.name).not.toMatch(/^atcud/i);
    });

    it('Coca-Cola: identifica o emitente, nunca a linha ATCUD nem o nome do CLIENTE (secção vizinha)', async () => {
      const result = await extractor.extract(COCA_COLA_TEXT);
      expect(result?.value.name).toContain('Coca-Cola');
    });

    it('Farmácia Esperança: prefere a linha com sufixo legal (LDA) à primeira linha sem sufixo — acentos/OCR não são prioridade', async () => {
      const text = 'FARMACTA ESPERANÇA\nFARMAGTA ESPERANÇA LDA\nid DA PRATA 3\n9100-167 SANTA (\nO9OTA1A? do NTF:509978142';
      const result = await extractor.extract(text);
      expect(result?.value.name).toBe('FARMAGTA ESPERANÇA LDA');
    });

    it('Dismade: mantém a extração correta já existente (documento que já funcionava com a heurística antiga)', async () => {
      const text = 'DISMADE — Distribuição da Madeira S.A.\nZFI — Plataforma 7\nCaniçal\nNIF: 511039514 Capital Social: 1 000 000€';
      const result = await extractor.extract(text);
      expect(result?.value.name).toBe('DISMADE — Distribuição da Madeira S.A.');
    });

    it('Ovos Girão: identifica "NUNES & FREITAS, LDA" mesmo com a coluna do cliente fundida na mesma linha pelo OCR', async () => {
      const result = await extractor.extract(OVOS_GIRAO_TEXT);
      expect(result?.value.name).toContain('NUNES & FREITAS, LDA');
    });
  });
});
