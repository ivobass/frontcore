import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ApiError } from '../../../lib/api';
import { withAuthRetry, SessionExpiredError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';
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

/** `authFetch` de teste sem qualquer renovação — para os testes que não exercitam o hardening de sessão. */
function simpleAuthFetch(accessToken: string): AuthFetch {
  return (request) => request(accessToken);
}

/**
 * `authFetch` real (`withAuthRetry()`), só o `fetch` global
 * (`/auth/refresh`) é mockado — nunca uma renovação mascarada por um
 * mock estático. Com estado (guarda sempre o par de tokens mais
 * recente, nunca só os iniciais) — o mesmo comportamento do
 * `sessionRef` real (`lib/session-context.tsx`): esta folha faz DOIS
 * pedidos autenticados sequenciais (`createUpload()` depois
 * `createInvoiceDraft()`); sem isto, uma renovação despoletada pelo
 * primeiro pedido nunca seria vista pelo segundo, reproduzindo
 * exatamente a causa raiz da Secção 3 (closures presas a tokens
 * antigos).
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
        authFetch={simpleAuthFetch('token')}
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
        authFetch={simpleAuthFetch('token')}
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

  describe('Hardening de sessão — correção final pós-revisão Codex ("Token de acesso inválido ou expirado.")', () => {
    it('401 ao criar o upload renova a sessão uma única vez e repete o upload — depois cria o rascunho normalmente', async () => {
      createUpload
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce({ id: 'obj-2', filename: 'fatura.pdf' });
      createInvoiceDraft.mockResolvedValue({ id: 'draft-1' });
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo-upload', refreshToken: 'refresh-novo-upload' }), {
          status: 200,
        }),
      );
      const onCreated = vi.fn();

      render(
        <CreateInvoiceDraftDialog
          open
          onOpenChange={() => {}}
          authFetch={realAuthFetch('token-upload-antigo', 'refresh-upload-antigo', vi.fn(), vi.fn())}
          onCreated={onCreated}
          onChanged={() => {}}
          notifyError={() => {}}
        />,
      );

      selectFile();

      await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'draft-1' }));
      expect(createUpload).toHaveBeenCalledTimes(2);
      expect(createUpload).toHaveBeenNthCalledWith(1, 'token-upload-antigo', expect.anything());
      expect(createUpload).toHaveBeenNthCalledWith(2, 'token-novo-upload', expect.anything());
      // O passo seguinte (criar o rascunho) já usa o token renovado — nunca o antigo.
      expect(createInvoiceDraft).toHaveBeenCalledWith('token-novo-upload', { storageObjectId: 'obj-2' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('401 ao criar o rascunho (depois do upload já ter sucedido) renova a sessão uma única vez e repete só esse passo — nunca repete o upload', async () => {
      createInvoiceDraft
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce({ id: 'draft-2' });
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token-novo-draft', refreshToken: 'refresh-novo-draft' }), {
          status: 200,
        }),
      );
      const onCreated = vi.fn();

      render(
        <CreateInvoiceDraftDialog
          open
          onOpenChange={() => {}}
          authFetch={realAuthFetch('token-draft-antigo', 'refresh-draft-antigo', vi.fn(), vi.fn())}
          onCreated={onCreated}
          onChanged={() => {}}
          notifyError={() => {}}
        />,
      );

      selectFile();

      await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'draft-2' }));
      // O upload em si nunca sofreu 401 — só uma chamada, nunca repetida.
      expect(createUpload).toHaveBeenCalledTimes(1);
      expect(createInvoiceDraft).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
