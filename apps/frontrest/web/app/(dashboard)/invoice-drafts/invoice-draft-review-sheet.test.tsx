import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvoiceDraftReviewSheet } from './invoice-draft-review-sheet';

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

vi.mock('../../../lib/suppliers', () => ({
  listSuppliers: () => Promise.resolve({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }),
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

    expect(updateInvoiceDraft).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('F-100')).toBeInTheDocument();
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
    fireEvent.click(promoteTrigger);

    expect(promoteInvoiceDraft).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: 'Promover' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(promoteInvoiceDraft).toHaveBeenCalledWith('token', 'draft-1'));
  });
});
