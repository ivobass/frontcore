import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvoiceDraftReviewSheet } from './invoice-draft-review-sheet';
import { ApiError } from '../../../lib/api';

const getInvoiceDraft = vi.fn();
const updateInvoiceDraft = vi.fn();
const deleteInvoiceDraft = vi.fn();
const promoteInvoiceDraft = vi.fn();
const getInvoiceDraftFiscalSuggestions = vi.fn();

vi.mock('../../../lib/invoice-drafts', () => ({
  getInvoiceDraft: (...args: unknown[]) => getInvoiceDraft(...args),
  updateInvoiceDraft: (...args: unknown[]) => updateInvoiceDraft(...args),
  deleteInvoiceDraft: (...args: unknown[]) => deleteInvoiceDraft(...args),
  promoteInvoiceDraft: (...args: unknown[]) => promoteInvoiceDraft(...args),
  getInvoiceDraftFiscalSuggestions: (...args: unknown[]) => getInvoiceDraftFiscalSuggestions(...args),
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
        accessToken="token"
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
        accessToken="token"
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
    expect(updateInvoiceDraft).not.toHaveBeenCalled();
  });

  it('"Guardar alterações" envia só os campos alterados face ao valor guardado', async () => {
    getInvoiceDraft.mockResolvedValue(baseDraft);
    updateInvoiceDraft.mockResolvedValue({ ...baseDraft, number: 'F-100', issueDate: '2026-07-01T00:00:00.000Z', totalAmount: '250.50' });

    render(
      <InvoiceDraftReviewSheet
        open
        onOpenChange={() => {}}
        draftId="draft-1"
        accessToken="token"
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
      expect(updateInvoiceDraft).toHaveBeenCalledWith('token', 'draft-1', {
        number: 'F-100',
        issueDate: '2026-07-01',
        totalAmount: 250.5,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        <InvoiceDraftReviewSheet open onOpenChange={() => {}} draftId="draft-1" accessToken="token" canManage {...noopProps} />,
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
        accessToken="token"
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

  describe('Hardening pós-validação manual — "Token de acesso inválido ou expirado."', () => {
    const draftReadyToPromote = {
      ...baseDraft,
      ocrStatus: 'FAILED' as const,
      supplierId: 'sup-1',
      issueDate: '2026-07-01T00:00:00.000Z',
      totalAmount: '100.00',
      supplier: { id: 'sup-1', name: 'ACME' },
    };

    async function clickPromoteAndConfirm() {
      const promoteTrigger = await screen.findByRole('button', { name: 'Promover a fatura' });
      await waitFor(() => expect(promoteTrigger).toBeEnabled());
      fireEvent.click(promoteTrigger);
      const confirmButton = await screen.findByRole('button', { name: 'Promover' });
      fireEvent.click(confirmButton);
    }

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
          accessToken="token-antigo"
          refreshToken="refresh-antigo"
          onTokensRefreshed={onTokensRefreshed}
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

    it('refreshToken também expirado — mostra uma mensagem clara e distinta, nunca o 401 cru, e nunca repete a promoção uma segunda vez', async () => {
      getInvoiceDraft.mockResolvedValue(draftReadyToPromote);
      promoteInvoiceDraft.mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Refresh token inválido.' }), { status: 401 }),
      );

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          accessToken="token-antigo"
          refreshToken="refresh-antigo"
          onTokensRefreshed={() => {}}
          canManage
          {...noopProps}
        />,
      );

      await clickPromoteAndConfirm();

      await screen.findByText('A sua sessão expirou. Inicie sessão novamente.');
      expect(promoteInvoiceDraft).toHaveBeenCalledTimes(1);
    });

    it('sem refreshToken/onTokensRefreshed (retrocompatibilidade) — 401 mostra o erro tal como antes, nunca tenta renovar', async () => {
      getInvoiceDraft.mockResolvedValue(draftReadyToPromote);
      promoteInvoiceDraft.mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
      global.fetch = vi.fn();

      render(
        <InvoiceDraftReviewSheet
          open
          onOpenChange={() => {}}
          draftId="draft-1"
          accessToken="token-antigo"
          canManage
          {...noopProps}
        />,
      );

      await clickPromoteAndConfirm();

      await screen.findByText('Token de acesso inválido ou expirado.');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(promoteInvoiceDraft).toHaveBeenCalledTimes(1);
    });
  });
});
