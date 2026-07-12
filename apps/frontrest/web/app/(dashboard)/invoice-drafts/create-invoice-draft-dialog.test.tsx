import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ApiError } from '../../../lib/api';
import { CreateInvoiceDraftDialog } from './create-invoice-draft-dialog';

const createUpload = vi.fn();
const deleteUpload = vi.fn();
const createInvoiceDraft = vi.fn();

vi.mock('../../../lib/uploads', () => ({
  createUpload: (...args: unknown[]) => createUpload(...args),
  deleteUpload: (...args: unknown[]) => deleteUpload(...args),
}));

vi.mock('../../../lib/invoice-drafts', () => ({
  createInvoiceDraft: (...args: unknown[]) => createInvoiceDraft(...args),
}));

function selectFile() {
  // O conteúdo do Dialog é renderizado num Portal do Radix (fora do
  // `container` devolvido por `render()`) — procurar em `document.body`.
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['conteúdo'], 'fatura.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('CreateInvoiceDraftDialog — limpeza não-cega do upload (Fase 6.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUpload.mockResolvedValue({ id: 'obj-1', filename: 'fatura.pdf' });
  });

  it('409 (draft nunca chegou a existir) → elimina o StorageObject órfão', async () => {
    createInvoiceDraft.mockRejectedValue(new ApiError('Conflito.', 409));
    const notifyError = vi.fn();
    const onChanged = vi.fn();

    render(
      <CreateInvoiceDraftDialog
        open
        onOpenChange={() => {}}
        accessToken="token"
        onCreated={() => {}}
        onChanged={onChanged}
        notifyError={notifyError}
      />,
    );

    selectFile();

    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith('token', 'obj-1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('503 (draft pode já existir, só o job falhou) → NÃO elimina o StorageObject', async () => {
    createInvoiceDraft.mockRejectedValue(new ApiError('Falha ao agendar OCR.', 503));
    const notifyError = vi.fn();
    const onChanged = vi.fn();

    render(
      <CreateInvoiceDraftDialog
        open
        onOpenChange={() => {}}
        accessToken="token"
        onCreated={() => {}}
        onChanged={onChanged}
        notifyError={notifyError}
      />,
    );

    selectFile();

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(deleteUpload).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });
});
