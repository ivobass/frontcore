import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvoiceDraftReviewSheet } from './invoice-draft-review-sheet';
import { ApiError } from '../../../lib/api';
import { withAuthRetry, SessionExpiredError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';

/** `authFetch` de teste sem qualquer renovação — equivalente ao antigo `accessToken` cru, para os testes que não exercitam o hardening de sessão. */
function simpleAuthFetch(accessToken: string): AuthFetch {
  return (request) => request(accessToken);
}

const getInvoiceDraft = vi.fn();
const deleteInvoiceDraft = vi.fn();
const promoteInvoiceDraft = vi.fn();
const getInvoiceDraftFiscalSuggestions = vi.fn();
const runAiInvoiceExtraction = vi.fn();
/**
 * Correção pós-revisão Codex (achado 9) — `handleSave()` passou a
 * chamar `saveInvoiceDraftReview()` (um único `PATCH :id/review`,
 * atómico no backend) em vez de `updateInvoiceDraft()` +
 * `replaceInvoiceDraftItems()` como dois pedidos independentes. Os
 * testes que antes verificavam esses dois pedidos separados foram
 * atualizados para verificar o pedido combinado — comportamento
 * genuinamente novo, não um enfraquecimento de cobertura (a garantia
 * "só os campos alterados são enviados" e "nunca envia um pedido vazio"
 * continua coberta, agora sobre o payload combinado).
 */
const saveInvoiceDraftReview = vi.fn();

vi.mock('../../../lib/invoice-drafts', () => ({
  getInvoiceDraft: (...args: unknown[]) => getInvoiceDraft(...args),
  deleteInvoiceDraft: (...args: unknown[]) => deleteInvoiceDraft(...args),
  promoteInvoiceDraft: (...args: unknown[]) => promoteInvoiceDraft(...args),
  getInvoiceDraftFiscalSuggestions: (...args: unknown[]) => getInvoiceDraftFiscalSuggestions(...args),
  runAiInvoiceExtraction: (...args: unknown[]) => runAiInvoiceExtraction(...args),
  saveInvoiceDraftReview: (...args: unknown[]) => saveInvoiceDraftReview(...args),
}));

// `withAuthRetry`/`refreshSession` reais (a lógica de retry é o que está
// a ser testado) — só o `fetch` global (o próprio pedido de rede a
// `/auth/refresh`) é mockado, hardening pós-validação manual, "Token de
// acesso inválido ou expirado.".
const originalFetch = global.fetch;

const listSuppliers = vi.fn();

vi.mock('../../../lib/suppliers', () => ({
  listSuppliers: (...args: unknown[]) => listSuppliers(...args),
}));

vi.mock('../../../lib/expense-categories', () => ({
  listExpenseCategories: () => Promise.resolve([]),
}));

const baseDraft = {
  id: 'draft-1',
  supplierId: null,
  categoryId: null,
  number: null,
  issueDate: null,
  dueDate: null,
  totalAmount: null,
  notes: null,
  ocrText: 'texto extraído',
  ocrConfidence: 90,
  ocrStatus: 'COMPLETED' as const,
  ocrError: null,
  itemsReviewedByHuman: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  supplier: null,
  category: null,
  storageObject: {
    id: 'obj-1',
    filename: 'fatura.pdf',
    contentType: 'application/pdf',
    size: 123,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  items: [],
};

const suggestions = {
  supplier: null,
  supplierTaxId: null,
  invoice: {
    number: { value: 'F-100', confidence: 85 },
    issueDate: { value: '2026-07-01T00:00:00.000Z', confidence: 80 },
    dueDate: null,
  },
  totals: { value: { totalAmount: 250.5 }, confidence: 75 },
  confidence: 80,
};

const noopProps = {
  onSaved: () => {},
  onDeleted: () => {},
  onPromoted: () => {},
};

describe('InvoiceDraftReviewSheet (Fase 6.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceDraftFiscalSuggestions.mockResolvedValue(suggestions);
    listSuppliers.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('MEMBER: vê revisão em modo de leitura, sem formulário nem ações de escrita', async () => {
    getInvoiceDraft.mockResolvedValue(baseDraft);

    render(
      <InvoiceDraftReviewSheet
        open
        onOpenChange={() => {}}
        draftId="draft-1"
        authFetch={simpleAuthFetch('token')}
        canManage={false}
        {...noopProps}
      />,
    );

    await screen.findByText(/Fornecedor:/);

    expect(screen.queryByRole('button', { name: 'Guardar alterações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promover a fatura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar rascunho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('MANAGER+: "Aplicar sugestões" preenche o formulário sem chamar PATCH', async () => {
    getInvoiceDraft.mockResolvedValue(baseDraft);

    render(
      <InvoiceDraftReviewSheet
        open
        onOpenChange={() => {}}
        draftId="draft-1"
        authFetch={simpleAuthFetch('token')}
        canManage
        {...noopProps}
      />,
    );

    const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
    fireEvent.click(applyButton);

    // applySuggestions() é assíncrona (recarrega fornecedores antes de
    // resolver — ver correção "Farmacia Esperanca") — esperar o efeito
    // observável em vez de assumir que o clique já terminou.
    expect(await screen.findByDisplayValue('F-100')).toBeInTheDocument();
    expect(saveInvoiceDraftReview).not.toHaveBeenCalled();
  });

  it('"Guardar alterações" envia só os campos alterados face ao valor guardado, num único pedido atómico (achado 9)', async () => {
    getInvoiceDraft.mockResolvedValue(baseDraft);
    saveInvoiceDraftReview.mockResolvedValue({ ...baseDraft, number: 'F-100', issueDate: '2026-07-01T00:00:00.000Z', totalAmount: '250.50' });

    render(
      <InvoiceDraftReviewSheet
        open
        onOpenChange={() => {}}
        draftId="draft-1"
        authFetch={simpleAuthFetch('token')}
        canManage
        {...noopProps}
      />,
    );

    const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
    fireEvent.click(applyButton);
    await screen.findByDisplayValue('F-100'); // espera applySuggestions() (assíncrona) terminar antes de guardar

    const saveButton = screen.getByRole('button', { name: 'Guardar alterações' });
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(saveInvoiceDraftReview).toHaveBeenCalledWith('token', 'draft-1', {
        patch: {
          number: 'F-100',
          issueDate: '2026-07-01',
          totalAmount: 250.5,
        },
      }),
    );
  });

  describe('"Aplicar sugestões" resolve o fornecedor (correção Fase 6.8)', () => {
    const mercedesSuggestions = {
      ...suggestions,
      supplier: { value: { name: 'Mercedes-Benz Financial Services Portugal' }, confidence: 90 },
      supplierTaxId: null,
    };

    it('fornecedor encontrado por NIF — Select atualizado sem o utilizador abrir o dropdown', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-farmacia', name: 'Farmácia Monumental Lda', taxId: '511234740' }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'FARMACIA MONUMENTAL' }, confidence: 88 },
        supplierTaxId: { value: '511 234 740', confidence: 95 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('sup-farmacia'));
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });

    it('fornecedor encontrado por nome normalizado (hífen/espaços diferentes) quando não há NIF sugerido', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-mb', name: 'Mercedes Benz Financial Services Portugal', taxId: null }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue(mercedesSuggestions);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('sup-mb'));
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });

    it('fornecedor inexistente — Select mantém "Por atribuir" e mostra aviso claro', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue(mercedesSuggestions);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(supplierSelect.value).toBe('');
      expect(
        await screen.findByText(
          'Fornecedor sugerido "Mercedes-Benz Financial Services Portugal" não existe na lista de fornecedores. Crie ou associe o fornecedor manualmente.',
        ),
      ).toBeInTheDocument();
    });

    it('nunca falha silenciosamente e continua a preencher os restantes campos mesmo sem correspondência de fornecedor', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue(mercedesSuggestions);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      await screen.findByText(/não existe na lista de fornecedores/);
      expect(screen.getByDisplayValue('F-100')).toBeInTheDocument();
      expect(screen.getByDisplayValue('250.5')).toBeInTheDocument();
    });

    it('regressão real (validação manual, "Farmacia Monumental"/NIF 511234740): NIF sugerido sem correspondência RECUA para nome — fornecedor criado sem NIF (campo opcional) é encontrado por nome', async () => {
      // Reproduz exatamente os payloads reais capturados via API/OCR/parsing
      // reais (não simulados) durante o diagnóstico desta correção: um
      // fornecedor criado manualmente sem preencher o campo NIF (opcional
      // no formulário) tem taxId: null — a versão anterior desistia ali e
      // nunca tentava o nome, mesmo idêntico.
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-farmacia-sem-nif', name: 'Farmacia Monumental', taxId: null }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'Farmacia Monumental' }, confidence: 85 },
        supplierTaxId: { value: '511234740', confidence: 90 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('sup-farmacia-sem-nif'));
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });

    it('regressão real ("FARMACIA ESPERANCA"/NIF 509978142, capturada via OCR/parsing reais em Docker): supplier.value é objeto, sem rótulo "Fornecedor:" no documento — fallback de 1ª linha ainda resolve por nome', async () => {
      // Payloads exatamente como capturados da API real (não parafraseados):
      // supplier.value é sempre { name: string } (nunca string solta —
      // confirmado no contrato DraftFiscalSuggestions e no JSON real), o
      // parsing usou o fallback de 1ª linha (sem rótulo "Fornecedor:" no
      // documento, confiança 40) e o NIF foi extraído corretamente.
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'supplier-esperanca', name: 'FARMACIA ESPERANCA', taxId: null }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'FARMACIA ESPERANCA' }, confidence: 40 },
        supplierTaxId: { value: '509978142', confidence: 90 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('supplier-esperanca'));
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });

    it('recarrega a lista de fornecedores no momento do clique — encontra um fornecedor criado depois de a folha já estar aberta', async () => {
      // Reproduz a causa real identificada nesta correção: `suppliers` só
      // era carregada uma vez, ao abrir a folha. Um fornecedor criado
      // depois (ex. noutro separador, sem fechar esta folha) ficava
      // invisível ao matcher até a folha ser fechada e reaberta.
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers
        .mockResolvedValueOnce({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }) // ao abrir a folha — fornecedor ainda não existia
        .mockResolvedValueOnce({
          items: [{ id: 'supplier-esperanca', name: 'FARMACIA ESPERANCA', taxId: null }],
          page: 1,
          pageSize: 100,
          total: 1,
          totalPages: 1,
        }); // recarregada no clique — fornecedor já existe entretanto
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'FARMACIA ESPERANCA' }, confidence: 40 },
        supplierTaxId: { value: '509978142', confidence: 90 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('supplier-esperanca'));
      expect(listSuppliers).toHaveBeenCalledTimes(2);
    });

    it('NIF sugerido sem correspondência E nome sem correspondência — nenhum fornecedor resolvido, aviso mostrado', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-outro', name: 'Um Fornecedor Completamente Diferente', taxId: '999999990' }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'Farmácia Monumental' }, confidence: 88 },
        supplierTaxId: { value: '511234740', confidence: 95 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(supplierSelect.value).toBe('');
      expect(await screen.findByText(/não existe na lista de fornecedores/)).toBeInTheDocument();
    });

    it('fornecedor homónimo com NIF diferente do sugerido — NÃO seleciona automaticamente, mostra aviso de conflito distinto', async () => {
      // "ABC Informática" (NIF 500111111) já existe na lista; a sugestão
      // aponta para "ABC Informática" com um NIF diferente (500333333).
      // A procura por NIF falha (nenhum fornecedor tem 500333333); o
      // nome homónimo TEM um NIF registado — logo não é "por preencher",
      // é um conflito real (duas entidades homónimas). Nunca decidir
      // isto sozinho: sem seleção automática, aviso explícito distinto
      // do aviso genérico de "não existe".
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-abc-1', name: 'ABC Informática', taxId: '500111111' }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'ABC Informática' }, confidence: 88 },
        supplierTaxId: { value: '500333333', confidence: 92 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(supplierSelect.value).toBe('');
      expect(
        await screen.findByText(
          'Fornecedor sugerido "ABC Informática" existe na lista, mas com um NIF diferente do sugerido (500333333). Verifique e associe manualmente.',
        ),
      ).toBeInTheDocument();
      // Nunca o aviso genérico de "não existe" — este é um conflito, não uma ausência.
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });

    it('mesmo nome e mesmo NIF — seleciona automaticamente (caminho direto por NIF)', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-abc-exato', name: 'ABC Informática', taxId: '500111111' }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue({
        ...suggestions,
        supplier: { value: { name: 'ABC Informática' }, confidence: 92 },
        supplierTaxId: { value: '500111111', confidence: 95 },
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      await waitFor(() => expect(supplierSelect.value).toBe('sup-abc-exato'));
      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
      expect(screen.queryByText(/NIF diferente do sugerido/)).not.toBeInTheDocument();
    });

    it('escolher manualmente um fornecedor depois do aviso limpa o aviso', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      listSuppliers.mockResolvedValue({
        items: [{ id: 'sup-manual', name: 'Outro Fornecedor', taxId: null }],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      });
      getInvoiceDraftFiscalSuggestions.mockResolvedValue(mercedesSuggestions);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);
      await screen.findByText(/não existe na lista de fornecedores/);

      const supplierSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      fireEvent.change(supplierSelect, { target: { value: 'sup-manual' } });

      expect(screen.queryByText(/não existe na lista de fornecedores/)).not.toBeInTheDocument();
    });
  });

  it('promoção exige confirmação — clicar em "Promover a fatura" não chama a API antes de confirmar', async () => {
    getInvoiceDraft.mockResolvedValue({
      ...baseDraft,
      ocrStatus: 'FAILED' as const,
      supplierId: 'sup-1',
      issueDate: '2026-07-01T00:00:00.000Z',
      totalAmount: '100.00',
      supplier: { id: 'sup-1', name: 'ACME' },
    });

    render(
      <InvoiceDraftReviewSheet
        open
        onOpenChange={() => {}}
        draftId="draft-1"
        authFetch={simpleAuthFetch('token')}
        canManage
        {...noopProps}
      />,
    );

    const promoteTrigger = await screen.findByRole('button', { name: 'Promover a fatura' });
    await waitFor(() => expect(promoteTrigger).toBeEnabled());
    fireEvent.click(promoteTrigger);

    expect(promoteInvoiceDraft).not.toHaveBeenCalled();

    const confirmButton = await screen.findByRole('button', { name: 'Promover' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(promoteInvoiceDraft).toHaveBeenCalledWith('token', 'draft-1'));
  });

  describe('Linhas de fatura (Fase 6.14)', () => {
    const draftWithItem = {
      ...baseDraft,
      items: [
        {
          id: 'item-1',
          position: 1,
          description: 'Farinha 25kg',
          quantity: '2',
          unit: 'saco',
          unitPrice: '18.50',
          vatRate: '23',
          totalPrice: '37.00',
        },
      ],
    };

    const reconciliation = {
      supplierName: { status: 'agreement', deterministicValue: 'Acme', aiValue: 'Acme', suggestedValue: 'Acme' },
      supplierTaxId: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      invoiceNumber: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      issueDate: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      dueDate: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      currency: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      subtotal: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      vatAmount: { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null },
      total: {
        status: 'conflict',
        deterministicValue: '100.00',
        aiValue: '999.99',
        suggestedValue: null,
      },
      items: [
        {
          position: 1,
          description: 'Farinha 25kg (sugestão IA)',
          quantity: '2',
          unit: 'saco',
          unitPrice: '18.50',
          vatRate: '23',
          totalPrice: '37.00',
        },
      ],
    };

    it('MEMBER vê as linhas em modo de leitura, sem inputs', async () => {
      getInvoiceDraft.mockResolvedValue(draftWithItem);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage={false} {...noopProps} />,
      );

      await screen.findByText('Farinha 25kg');
      expect(screen.queryByRole('button', { name: 'Adicionar linha' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Descrição da linha/)).not.toBeInTheDocument();
    });

    it('MANAGER+: "Adicionar linha" cria uma linha vazia editável', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const addButton = await screen.findByRole('button', { name: 'Adicionar linha' });
      fireEvent.click(addButton);

      expect(await screen.findByLabelText('Descrição da linha 1')).toBeInTheDocument();
    });

    it('editar uma linha e guardar chama saveInvoiceDraftReview só com `items` (sem `patch`) quando o cabeçalho não mudou — achado 9', async () => {
      getInvoiceDraft.mockResolvedValue(draftWithItem);
      saveInvoiceDraftReview.mockResolvedValue({ ...draftWithItem, items: draftWithItem.items });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const descriptionInput = await screen.findByLabelText('Descrição da linha 1');
      fireEvent.change(descriptionInput, { target: { value: 'Farinha 25kg (corrigido)' } });

      const saveButton = screen.getByRole('button', { name: 'Guardar alterações' });
      fireEvent.click(saveButton);

      await waitFor(() =>
        expect(saveInvoiceDraftReview).toHaveBeenCalledWith('token', 'draft-1', {
          items: [
            {
              position: 1,
              description: 'Farinha 25kg (corrigido)',
              quantity: 2,
              unit: 'saco',
              unitPrice: 18.5,
              vatRate: 23,
              totalPrice: 37,
            },
          ],
        }),
      );
    });

    it('eliminar uma linha e guardar envia o array sem essa linha (nunca inclui deleteMany explícito — a substituição é sempre integral)', async () => {
      getInvoiceDraft.mockResolvedValue(draftWithItem);
      saveInvoiceDraftReview.mockResolvedValue({ ...draftWithItem, items: [] });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      await screen.findByLabelText('Descrição da linha 1');
      fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

      const saveButton = screen.getByRole('button', { name: 'Guardar alterações' });
      fireEvent.click(saveButton);

      await waitFor(() => expect(saveInvoiceDraftReview).toHaveBeenCalledWith('token', 'draft-1', { items: [] }));
    });

    it('reordenar linhas (mover para baixo) atualiza a posição enviada ao guardar', async () => {
      const twoItems = {
        ...baseDraft,
        items: [
          { id: 'item-1', position: 1, description: 'A', quantity: null, unit: null, unitPrice: null, vatRate: null, totalPrice: null },
          { id: 'item-2', position: 2, description: 'B', quantity: null, unit: null, unitPrice: null, vatRate: null, totalPrice: null },
        ],
      };
      getInvoiceDraft.mockResolvedValue(twoItems);
      saveInvoiceDraftReview.mockResolvedValue(twoItems);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      await screen.findByLabelText('Descrição da linha 1');
      fireEvent.click(screen.getByLabelText('Mover linha 1 para baixo'));

      const saveButton = screen.getByRole('button', { name: 'Guardar alterações' });
      fireEvent.click(saveButton);

      await waitFor(() =>
        expect(saveInvoiceDraftReview).toHaveBeenCalledWith('token', 'draft-1', {
          items: [
            expect.objectContaining({ position: 1, description: 'B' }),
            expect.objectContaining({ position: 2, description: 'A' }),
          ],
        }),
      );
    });

    it('linha com descrição vazia bloqueia "Guardar alterações" com um erro, nunca chama saveInvoiceDraftReview', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const addButton = await screen.findByRole('button', { name: 'Adicionar linha' });
      fireEvent.click(addButton);
      await screen.findByLabelText('Descrição da linha 1');

      fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }));

      expect(await screen.findByText('Todas as linhas precisam de uma descrição.')).toBeInTheDocument();
      expect(saveInvoiceDraftReview).not.toHaveBeenCalled();
    });

    /**
     * Achado 9 — o cenário concreto identificado na revisão (cabeçalho
     * gravado com sucesso, linhas falham, UI nunca reflete o sucesso
     * parcial) deixa de ser possível: com um único pedido atómico, ou os
     * dois persistem, ou nenhum. Este teste prova que uma falha no
     * pedido combinado nunca aplica um estado parcial à UI — o rascunho
     * local permanece exatamente como estava antes da tentativa.
     */
    it('achado 9 — se o pedido combinado falhar, nada é aplicado localmente (nunca um sucesso parcial silencioso de cabeçalho+linhas)', async () => {
      getInvoiceDraft.mockResolvedValue(draftWithItem);
      saveInvoiceDraftReview.mockRejectedValue(new Error('Falha ao gravar.'));

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const descriptionInput = await screen.findByLabelText('Descrição da linha 1');
      fireEvent.change(descriptionInput, { target: { value: 'Farinha 25kg (tentativa falhada)' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }));

      expect(await screen.findByText('Falha ao gravar.')).toBeInTheDocument();
      // O valor editado continua visível (o formulário local não foi
      // limpo nem substituído por um resultado do servidor) — a UI nunca
      // finge que a operação foi bem-sucedida nem parcialmente aplicada.
      expect(screen.getByDisplayValue('Farinha 25kg (tentativa falhada)')).toBeInTheDocument();
    });

    it('"Analisar com IA" chama runAiInvoiceExtraction, mostra a reconciliação (incl. conflito) e atualiza as linhas com o resultado', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      runAiInvoiceExtraction.mockResolvedValue({
        reconciliation,
        itemsPersisted: true,
        items: [
          {
            id: 'item-ai-1',
            position: 1,
            description: 'Farinha 25kg (sugestão IA)',
            quantity: '2',
            unit: 'saco',
            unitPrice: '18.50',
            vatRate: '23',
            totalPrice: '37.00',
          },
        ],
      });

      render(
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" authFetch={simpleAuthFetch('token')} canManage {...noopProps} />,
      );

      const aiButton = await screen.findByRole('button', { name: 'Analisar com IA' });
      fireEvent.click(aiButton);

      await waitFor(() => expect(runAiInvoiceExtraction).toHaveBeenCalledWith('token', 'draft-1'));
      expect(await screen.findByText(/conflito/)).toBeInTheDocument();
      expect(await screen.findByDisplayValue('Farinha 25kg (sugestão IA)')).toBeInTheDocument();
    });
  });

  describe('Hardening de sessão — correção final pós-revisão Codex ("Token de acesso inválido ou expirado.")', () => {
    const draftReadyToPromote = {
      ...baseDraft,
      ocrStatus: 'FAILED' as const,
      supplierId: 'sup-1',
      issueDate: '2026-07-01T00:00:00.000Z',
      totalAmount: '100.00',
      supplier: { id: 'sup-1', name: 'ACME' },
    };

    /**
     * `authFetch` real (`withAuthRetry()` de `lib/auth.ts`, nunca
     * reimplementado aqui) — só o `fetch` global (`/auth/refresh`) é
     * mockado, para a lógica de renovação genuína ser exercitada, nunca
     * mascarada por um mock estático que finge sempre sucesso.
     */
    function realAuthFetch(
      initialAccessToken: string,
      initialRefreshToken: string,
      onTokensRefreshed: (tokens: { accessToken: string; refreshToken: string }) => void,
      sessionExpired: () => void,
    ): AuthFetch {
      let current = { accessToken: initialAccessToken, refreshToken: initialRefreshToken };
      return (request) =>
        withAuthRetry(current.accessToken, current.refreshToken, request, (tokens) => {
          current = tokens;
          onTokensRefreshed(tokens);
        }).catch((err) => {
          if (err instanceof SessionExpiredError) sessionExpired();
          throw err;
        });
    }

    async function clickPromoteAndConfirm() {
      const promoteTrigger = await screen.findByRole('button', { name: 'Promover a fatura' });
      await waitFor(() => expect(promoteTrigger).toBeEnabled());
      fireEvent.click(promoteTrigger);
      const confirmButton = await screen.findByRole('button', { name: 'Promover' });
      fireEvent.click(confirmButton);
    }

    it('401 na ABERTURA do rascunho (getInvoiceDraft) renova a sessão uma única vez e repete o pedido — o rascunho aparece sem erro intermédio', async () => {
      getInvoiceDraft
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce(baseDraft);
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo-abertura', refreshToken: 'refresh-novo-abertura' }), {
          status: 200,
        }),
      );
      const onTokensRefreshed = vi.fn();

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          authFetch={realAuthFetch('token-abertura', 'refresh-abertura', onTokensRefreshed, vi.fn())}
          canManage
          {...noopProps}
        />,
      );

      await screen.findByRole('button', { name: 'Eliminar rascunho' });
      expect(getInvoiceDraft).toHaveBeenCalledTimes(2);
      expect(getInvoiceDraft).toHaveBeenNthCalledWith(1, 'token-abertura', 'draft-1');
      expect(getInvoiceDraft).toHaveBeenNthCalledWith(2, 'token-novo-abertura', 'draft-1');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(onTokensRefreshed).toHaveBeenCalledWith({
        accessToken: 'token-novo-abertura',
        refreshToken: 'refresh-novo-abertura',
      });
      expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
    });

    it('401 ao GUARDAR alterações renova a sessão uma única vez e repete o PATCH combinado exatamente uma vez — nunca duplicado', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      saveInvoiceDraftReview
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce({ ...baseDraft, number: 'F-100', issueDate: '2026-07-01T00:00:00.000Z', totalAmount: '250.50' });
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo-save', refreshToken: 'refresh-novo-save' }), {
          status: 200,
        }),
      );

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          authFetch={realAuthFetch('token-save-antigo', 'refresh-save-antigo', vi.fn(), vi.fn())}
          canManage
          {...noopProps}
        />,
      );

      const applyButton = await screen.findByRole('button', { name: 'Aplicar sugestões' });
      fireEvent.click(applyButton);
      await screen.findByDisplayValue('F-100');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }));

      await waitFor(() => expect(saveInvoiceDraftReview).toHaveBeenCalledTimes(2));
      expect(saveInvoiceDraftReview).toHaveBeenNthCalledWith(1, 'token-save-antigo', 'draft-1', expect.anything());
      expect(saveInvoiceDraftReview).toHaveBeenNthCalledWith(2, 'token-novo-save', 'draft-1', expect.anything());
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
    });

    it('401 ao ELIMINAR o rascunho renova a sessão uma única vez e repete o DELETE exatamente uma vez — nunca duplicado', async () => {
      getInvoiceDraft.mockResolvedValue(baseDraft);
      deleteInvoiceDraft
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce(undefined);
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo-delete', refreshToken: 'refresh-novo-delete' }), {
          status: 200,
        }),
      );
      const onDeleted = vi.fn();

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          authFetch={realAuthFetch('token-delete-antigo', 'refresh-delete-antigo', vi.fn(), vi.fn())}
          canManage
          {...noopProps}
          onDeleted={onDeleted}
        />,
      );

      await screen.findByRole('button', { name: 'Eliminar rascunho' });
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar rascunho' }));
      const confirmButton = await screen.findByRole('button', { name: 'Eliminar' });
      fireEvent.click(confirmButton);

      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
      expect(deleteInvoiceDraft).toHaveBeenCalledTimes(2);
      expect(deleteInvoiceDraft).toHaveBeenNthCalledWith(1, 'token-delete-antigo', 'draft-1');
      expect(deleteInvoiceDraft).toHaveBeenNthCalledWith(2, 'token-novo-delete', 'draft-1');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('401 num pedido de promoção renova a sessão uma única vez e repete a promoção com o token novo', async () => {
      getInvoiceDraft.mockResolvedValue(draftReadyToPromote);
      promoteInvoiceDraft
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce({ id: 'inv-1' });
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo', refreshToken: 'refresh-novo' }), { status: 200 }),
      );
      const onTokensRefreshed = vi.fn();

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          authFetch={realAuthFetch('token-antigo', 'refresh-antigo', onTokensRefreshed, vi.fn())}
          canManage
          {...noopProps}
        />,
      );

      await clickPromoteAndConfirm();

      await waitFor(() => expect(promoteInvoiceDraft).toHaveBeenCalledTimes(2));
      expect(promoteInvoiceDraft).toHaveBeenNthCalledWith(1, 'token-antigo', 'draft-1');
      expect(promoteInvoiceDraft).toHaveBeenNthCalledWith(2, 'token-novo', 'draft-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({ body: JSON.stringify({ refreshToken: 'refresh-antigo' }) }),
      );
      expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'token-novo', refreshToken: 'refresh-novo' });
      expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
    });

    it('refreshToken também expirado — termina a sessão (sessionExpired) em vez de mostrar o 401 cru, e nunca repete a promoção uma segunda vez', async () => {
      // Achado real (validação manual): antes desta correção, este
      // cenário só mostrava uma mensagem de erro na folha, deixando o
      // utilizador "autenticado visualmente" com uma sessão já morta em
      // `localStorage`, em vez de terminar a sessão e reencaminhar para
      // `/login`.
      getInvoiceDraft.mockResolvedValue(draftReadyToPromote);
      promoteInvoiceDraft.mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Refresh token inválido.' }), { status: 401 }),
      );
      const sessionExpired = vi.fn();

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          authFetch={realAuthFetch('token-antigo-2', 'refresh-antigo-2', vi.fn(), sessionExpired)}
          canManage
          {...noopProps}
        />,
      );

      await clickPromoteAndConfirm();

      await waitFor(() => expect(sessionExpired).toHaveBeenCalledTimes(1));
      expect(promoteInvoiceDraft).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
    });
  });
});
