import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import InvoiceDraftDebugPage from './page';

const getInvoiceDraft = vi.fn();
const getFiscalExtractionDebug = vi.fn();

vi.mock('../../../../lib/invoice-drafts', () => ({
  getInvoiceDraft: (...args: unknown[]) => getInvoiceDraft(...args),
  getFiscalExtractionDebug: (...args: unknown[]) => getFiscalExtractionDebug(...args),
}));

const getUpload = vi.fn();

vi.mock('../../../../lib/uploads', () => ({
  getUpload: (...args: unknown[]) => getUpload(...args),
}));

vi.mock('../../../../lib/session-context', () => ({
  useSession: () => ({
    session: { accessToken: 'token-abc' },
    me: { user: { id: 'u1', email: 'x@x.com', name: null }, organization: { id: 'org-1', name: 'Org', slug: 'org' }, role: 'MANAGER' },
    logout: () => Promise.resolve(),
  }),
}));

const draft = {
  id: 'draft-1',
  supplierId: null,
  categoryId: null,
  number: null,
  issueDate: null,
  dueDate: null,
  totalAmount: null,
  notes: null,
  ocrText: 'FARMACIA ESPERANÇA\nNIF: 509978142',
  ocrConfidence: 91,
  ocrStatus: 'COMPLETED' as const,
  ocrError: null,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
  supplier: null,
  category: null,
  storageObject: {
    id: 'obj-1',
    filename: 'esperanca.pdf',
    contentType: 'application/pdf',
    size: 12345,
    createdAt: '2026-07-14T00:00:00.000Z',
  },
};

const fiscalResult = {
  supplier: { value: { name: 'FARMACIA ESPERANÇA' }, confidence: 85, source: 'FARMACIA ESPERANÇA' },
  supplierTaxId: { value: '509978142', confidence: 90, source: 'NIF: 509978142' },
  customer: null,
  invoice: { number: null, issueDate: null, dueDate: null, currency: null },
  totals: null,
  vat: null,
  confidence: 87,
  metadata: { extractorsRun: [], fieldsFound: [], processingTimeMs: 2, textLength: 40, rejectedCandidates: [] },
};

describe('InvoiceDraftDebugPage (Fase 6.8+)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceDraft.mockResolvedValue(draft);
    getFiscalExtractionDebug.mockResolvedValue(fiscalResult);
    getUpload.mockResolvedValue({ ...draft.storageObject, downloadUrl: 'https://example.com/x.pdf' });
  });

  it('carrega e mostra o pipeline completo para um rascunho ao introduzir o ID', async () => {
    render(<InvoiceDraftDebugPage />);

    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    await waitFor(() => expect(getInvoiceDraft).toHaveBeenCalledWith('token-abc', 'draft-1'));

    expect(await screen.findByRole('heading', { name: 'esperanca.pdf' })).toBeInTheDocument();
    expect(screen.getAllByText(/FARMACIA ESPERANÇA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/509978142/).length).toBeGreaterThan(0);
  });

  it('nunca chama getFiscalExtractionDebug quando o OCR ainda não concluiu', async () => {
    getInvoiceDraft.mockResolvedValue({ ...draft, ocrStatus: 'PROCESSING', ocrText: null });

    render(<InvoiceDraftDebugPage />);
    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    await waitFor(() => expect(getInvoiceDraft).toHaveBeenCalled());
    await screen.findByRole('heading', { name: 'esperanca.pdf' });

    expect(getFiscalExtractionDebug).not.toHaveBeenCalled();
  });

  it('permite carregar dois rascunhos lado a lado para comparação', async () => {
    render(<InvoiceDraftDebugPage />);

    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    fireEvent.change(screen.getByPlaceholderText(/cmrkkwhh6/), { target: { value: 'draft-2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[1]);

    await waitFor(() => {
      expect(getInvoiceDraft).toHaveBeenCalledWith('token-abc', 'draft-1');
      expect(getInvoiceDraft).toHaveBeenCalledWith('token-abc', 'draft-2');
    });
    expect(await screen.findAllByRole('heading', { name: 'esperanca.pdf' })).toHaveLength(2);
  });

  it('mostra o campo IVA e, para cada campo, a regra do extractor responsável', async () => {
    getFiscalExtractionDebug.mockResolvedValue({
      ...fiscalResult,
      vat: { value: { rate: 4, amount: 0.56 }, confidence: 90, source: 'axa Valor Valor IVA Líquido\n4% 13,94 0,56 14,50' },
    });

    render(<InvoiceDraftDebugPage />);
    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    await screen.findByRole('heading', { name: 'esperanca.pdf' });

    expect(screen.getByText('9. IVA extraído')).toBeInTheDocument();
    expect(screen.getByText(/4% \/ 0.56 €/)).toBeInTheDocument();
    expect(screen.getByText('VatExtractor — ver regra')).toBeInTheDocument();
    expect(screen.getByText('SupplierExtractor — ver regra')).toBeInTheDocument();
    expect(screen.getByText('TaxNumberExtractor — ver regra')).toBeInTheDocument();
  });

  it('mostra o candidato rejeitado e o motivo quando um campo tem uma explicação de rejeição (Fase 6.8+, "false positive hardening")', async () => {
    getFiscalExtractionDebug.mockResolvedValue({
      ...fiscalResult,
      metadata: {
        ...fiscalResult.metadata,
        rejectedCandidates: [
          { field: 'invoiceNumber', candidate: '1430 Data', reason: 'o candidato contém o termo reservado "data"' },
        ],
      },
    });

    render(<InvoiceDraftDebugPage />);
    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    await screen.findByRole('heading', { name: 'esperanca.pdf' });

    expect(screen.getByText('Candidato rejeitado')).toBeInTheDocument();
    expect(screen.getByText('"1430 Data"')).toBeInTheDocument();
    expect(screen.getByText(/termo reservado "data"/)).toBeInTheDocument();
  });

  it('nunca mostra "candidato rejeitado" para um campo sem nenhuma explicação de rejeição', async () => {
    render(<InvoiceDraftDebugPage />);
    fireEvent.change(screen.getByPlaceholderText(/cmrkl7jyd/), { target: { value: 'draft-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Carregar' })[0]);

    await screen.findByRole('heading', { name: 'esperanca.pdf' });

    expect(screen.queryByText('Candidato rejeitado')).not.toBeInTheDocument();
  });
});
