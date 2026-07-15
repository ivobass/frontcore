import { FiscalParsingService } from './fiscal-parsing.service';
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

/**
 * Testes por TIPO/estrutura de documento, não por fornecedor — Fase
 * 6.8+ ("motor OCR fiscal português", generalização pedida
 * explicitamente pelo utilizador). Cada fixture usa um nome de empresa
 * fictício, escolhido só para o texto parecer um documento real; as
 * asserções verificam sempre a extração de um valor presente no texto
 * (comportamento genérico do extractor), nunca uma regra codificada
 * para esse nome específico — trocar o nome fictício por outro
 * qualquer não altera nenhuma linha de código de produção nem devia
 * alterar o resultado do teste.
 */
function buildService(): FiscalParsingService {
  return new FiscalParsingService([
    new SupplierExtractor(),
    new CustomerExtractor(),
    new InvoiceNumberExtractor(),
    new InvoiceDateExtractor(),
    new DueDateExtractor(),
    new CurrencyExtractor(),
    new TotalsExtractor(),
    new VatExtractor(),
    new TaxNumberExtractor(),
  ]);
}

describe('FiscalParsingService — por tipo de documento (estrutura, não fornecedor)', () => {
  const service = buildService();

  describe('supermercado — fatura simplificada com discriminação de IVA', () => {
    const text = [
      'Fornecedor: Mercearia Central Lda',
      'NIF: 501234560',
      '',
      'Fatura Simplificada N.º FS A/12345',
      'Data: 05/07/2026',
      '',
      'Pão 0,90',
      'Leite 1,20',
      'Total (Euros): 12,30',
      '',
      'Taxa Valor Valor IVA Líquido',
      '6% 11,60 0,70 12,30',
    ].join('\n');

    it('extrai fornecedor, NIF, número, data, total e o IVA correto (2ª coluna, não a base)', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Mercearia Central Lda' });
      expect(result.supplierTaxId?.value).toBe('501234560');
      expect(result.invoice.number?.value).toBe('FS A/12345');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-05T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 12.3 });
      expect(result.vat?.value).toEqual({ rate: 6, amount: 0.7 });
    });
  });

  describe('farmácia — múltiplas taxas de IVA (6% + 23%)', () => {
    const text = [
      'Fornecedor: Farmácia Bem-Estar, Lda',
      'NIF: 502345678',
      'Fatura-Recibo N.º FR 2026/998',
      'Data: 02/07/2026',
      'Total (Euros): 45,90',
      '',
      'Taxa Valor Valor IVA Líquido',
      '6% 20,00 1,20 21,20',
      '23% 20,00 4,60 24,60',
    ].join('\n');

    it('fica com a 1ª linha da discriminação (regra determinística, documentada como limitação de IVA multi-taxa)', async () => {
      const result = await service.parse(text);

      expect(result.totals?.value).toEqual({ totalAmount: 45.9 });
      expect(result.vat?.value).toEqual({ rate: 6, amount: 1.2 });
    });
  });

  describe('combustível — talão de posto de abastecimento (layout compacto)', () => {
    const text = [
      'Posto Estrada Nacional, Unipessoal Lda',
      'Contribuinte: 503456780',
      '',
      'Fatura N.º FT 2026/45213',
      'Data: 09/07/2026',
      '',
      'Gasóleo Simples 45,32L x 1,689€/L',
      'Total a Pagar: 76,55€',
    ].join('\n');

    it('extrai o total mesmo em layout compacto sem tabela de IVA', async () => {
      const result = await service.parse(text);

      expect(result.totals?.value).toEqual({ totalAmount: 76.55 });
      expect(result.invoice.number?.value).toBe('FT 2026/45213');
    });

    it('extrai o NIF pelo rótulo "Contribuinte" (Fase 6.12 — antes era uma limitação conhecida, achado real "Ilha Pan"/"Ovos Girão")', async () => {
      const result = await service.parse(text);
      expect(result.supplierTaxId?.value).toBe('503456780');
    });
  });

  describe('loja de eletrónica / bricolage — fatura bem formada, sem ruído de OCR', () => {
    const text = [
      'Fornecedor: Mega Loja de Ferramentas, S.A.',
      'NIF: 504567890',
      'Fatura N.º FA 2026/778812',
      'Data de Emissão: 01/07/2026',
      'Data de Vencimento: 31/07/2026',
      'Subtotal: 200,00€',
      'IVA (23%): 46,00€',
      'Total a Pagar: 246,00€',
    ].join('\n');

    it('extrai todos os campos principais de um documento limpo, sem discriminação em tabela', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Mega Loja de Ferramentas, S.A.' });
      expect(result.invoice.number?.value).toBe('FA 2026/778812');
      expect(result.invoice.dueDate?.value.toISOString()).toBe('2026-07-31T00:00:00.000Z');
      expect(result.totals?.value).toEqual({ totalAmount: 246 });
      expect(result.vat?.value).toEqual({ rate: 23, amount: 46 });
    });
  });

  describe('restaurante — fatura-recibo com detalhe de mesa/serviço', () => {
    const text = [
      'Emitente: Tasca do Bairro, Lda',
      'NIF: 505678901',
      'Fatura-Recibo N.º FR U100/00456',
      'Data: 10/07/2026',
      'Mesa N.º 7 — 4 pessoas',
      'Menu do dia x4 48,00',
      'Água x2 3,00',
      'Total (Euros): 51,00',
    ].join('\n');

    it('ignora ruído de domínio (nº de mesa) e extrai fornecedor/número/total corretamente', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Tasca do Bairro, Lda' });
      expect(result.invoice.number?.value).toBe('FR U100/00456');
      expect(result.totals?.value).toEqual({ totalAmount: 51 });
    });
  });

  describe('banco / seguradora / serviços B2B — extrato/apólice sem estrutura de "fatura" padrão', () => {
    const text = [
      'Companhia de Seguros Confiança, S.A.',
      'Apólice N.º 998877/2026',
      'Prémio anual: 312,45€',
      'Data de início: 01/06/2026',
    ].join('\n');

    it('extrai o fornecedor pela 1ª linha (fallback com scoring) mesmo sem rótulo "Fornecedor:", com confiança dinâmica pelo sufixo legal (S.A.)', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Companhia de Seguros Confiança, S.A.' });
      expect(result.supplier?.confidence).toBe(70);
    });

    it('não inventa número de fatura nem data de emissão quando o documento não usa essa terminologia — limitação estrutural, não um bug', async () => {
      const result = await service.parse(text);

      expect(result.invoice.number).toBeNull();
      expect(result.invoice.issueDate).toBeNull();
    });
  });

  describe('serviços B2B — fatura de consultadoria com IBAN/condições de pagamento (ruído comum)', () => {
    const text = [
      'Fornecedor: Consultoria Digital Norte, Unipessoal Lda',
      'NIF: 506789012',
      'Fatura N.º FCT 2026/031',
      'Data de Emissão: 03/07/2026',
      'IBAN: PT50 0000 0000 0000 0000 0000 0',
      'Condições de pagamento: 30 dias',
      'Total a Pagar: 1 250,00€',
    ].join('\n');

    it('não confunde dígitos do IBAN com o número da fatura', async () => {
      const result = await service.parse(text);
      expect(result.invoice.number?.value).toBe('FCT 2026/031');
    });

    it('limitação conhecida: "1 250,00€" (milhar separado por espaço) não é reconhecido — devolve null, nunca um valor parcial errado', async () => {
      // Achado ao escrever este teste, não assumido: `DECIMAL_AMOUNT`
      // (Fase 6.8+, "false positive hardening") exige um separador
      // decimal com exatamente 2 dígitos finais no MESMO token — "1
      // 250,00" nunca corresponde por inteiro (o espaço não é um
      // separador de milhar reconhecido). Antes desta fase, a captura
      // antiga (sem essa exigência) parava no primeiro espaço e
      // devolvia "1" — um valor errado, não apenas incompleto. Agora
      // devolve null: nenhum documento real analisado nesta fase usa
      // espaço como separador de milhar (todos usam "." ou ","), e
      // "null" é sempre preferível a um valor parcial errado.
      const result = await service.parse(text);
      expect(result.totals).toBeNull();
    });
  });

  describe('talão simples — sem número de fatura nem data, só fornecedor e total', () => {
    const text = ['Papelaria Aliança', 'Total: 4,50€'].join('\n');

    it('extrai o que existe, sem inventar os campos em falta', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Papelaria Aliança' });
      expect(result.totals?.value).toEqual({ totalAmount: 4.5 });
      expect(result.invoice.number).toBeNull();
      expect(result.invoice.issueDate).toBeNull();
      expect(result.supplierTaxId).toBeNull();
    });
  });

  describe('nota de crédito — total com sinal negativo (Fase 6.12, categoria de fixture em falta)', () => {
    const text = [
      'Fornecedor: Acme Distribuição Lda',
      'Nota de Crédito N.º NC2026/12',
      'Data: 09/07/2026',
      'Total a Pagar: -45,90€',
    ].join('\n');

    it('devolve null para o total em vez de um valor negativo inventado — limitação conhecida, sem evidência real de suporte a sinal negativo', async () => {
      const result = await service.parse(text);

      expect(result.supplier?.value).toEqual({ name: 'Acme Distribuição Lda' });
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-09T00:00:00.000Z');
      // O sinal negativo não é reconhecido pelo padrão de montante —
      // devolve null (seguro) em vez de "45,90" (positivo, errado) ou de
      // inventar suporte a negativos sem evidência real de um documento
      // que precise disso.
      expect(result.totals).toBeNull();
    });
  });
});
