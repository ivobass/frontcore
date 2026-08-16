import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvoiceFormSheet } from './invoice-form-sheet';
import { ApiError } from '../../../lib/api';
import { withAuthRetry, SessionExpiredError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';

const createInvoice = vi.fn();
const updateInvoice = vi.fn();

vi.mock('../../../lib/invoices', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/invoices')>('../../../lib/invoices');
  return {
    ...actual,
    createInvoice: (...args: unknown[]) => createInvoice(...args),
    updateInvoice: (...args: unknown[]) => updateInvoice(...args),
  };
});

// `withAuthRetry`/`refreshSession` reais (a lógica de retry é o que está
// a ser testada) — só o `fetch` global (o próprio pedido de rede a
// `/auth/refresh`) é mockado. Mesmo padrão de
// `invoice-drafts/invoice-draft-review-sheet.test.tsx`.
//
// A cache de renovações (`refreshesByToken`, `lib/auth.ts`) é indexada
// pelo `refreshToken` e nunca limpa no sucesso — por isso cada teste
// deste ficheiro usa sempre um `refreshToken` distinto de qualquer
// outro, nunca reaproveitado.
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

const suppliers = [
  {
    id: 'sup-1',
    name: 'Hetzner',
    taxId: null,
    email: null,
    phone: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];
const categories = [
  { id: 'cat-1', name: 'Hosting', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
];

function fillMinimalForm() {
  // `FieldLabel required` acrescenta um "*" ao nome acessível (ver
  // `packages/ui/src/components/forms/field-label.tsx`) — por isso
  // regex, nunca o texto exato, para campos obrigatórios.
  fireEvent.change(screen.getByLabelText(/Data de emissão/), { target: { value: '2026-08-10' } });
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Servidor' } });
  fireEvent.change(screen.getByLabelText('Preço un.'), { target: { value: '50' } });
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
}

describe('InvoiceFormSheet — hardening de sessão (causa raiz: "Token de acesso inválido ou expirado." ao criar/editar faturas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 ao criar fatura renova a sessão uma única vez e repete a criação com o token novo — o utilizador nunca vê o erro intermédio', async () => {
    createInvoice
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce({ id: 'inv-1' });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token-novo-create', refreshToken: 'refresh-novo-create' }), {
        status: 200,
      }),
    );
    const onTokensRefreshed = vi.fn();
    const onSuccess = vi.fn();

    render(
      <InvoiceFormSheet
        open
        onOpenChange={() => {}}
        authFetch={realAuthFetch('token-create-antigo', 'refresh-create-antigo', onTokensRefreshed, vi.fn())}
        invoice={null}
        suppliers={suppliers}
        categories={categories}
        onSuccess={onSuccess}
      />,
    );

    fillMinimalForm();
    await submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(createInvoice).toHaveBeenCalledTimes(2);
    expect(createInvoice).toHaveBeenNthCalledWith(1, 'token-create-antigo', expect.anything());
    expect(createInvoice).toHaveBeenNthCalledWith(2, 'token-novo-create', expect.anything());
    expect(onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'token-novo-create',
      refreshToken: 'refresh-novo-create',
    });
    expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
  });

  it('401 ao editar fatura (updateInvoice) também renova e repete — exatamente uma vez, sem duplicar o PATCH', async () => {
    updateInvoice
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce({ id: 'inv-1' });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token-novo-edit', refreshToken: 'refresh-novo-edit' }), {
        status: 200,
      }),
    );
    const onSuccess = vi.fn();

    const invoice = {
      id: 'inv-1',
      supplierId: 'sup-1',
      categoryId: null,
      number: null,
      issueDate: '2026-08-10T00:00:00.000Z',
      dueDate: null,
      totalAmount: '50.00',
      status: 'PENDING' as const,
      notes: null,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
      supplier: { id: 'sup-1', name: 'Hetzner' },
      category: null,
      items: [{ id: 'item-1', description: 'Servidor', quantity: '1', unitPrice: '50.00', totalPrice: '50.00' }],
    };

    render(
      <InvoiceFormSheet
        open
        onOpenChange={() => {}}
        authFetch={realAuthFetch('token-edit-antigo', 'refresh-edit-antigo', vi.fn(), vi.fn())}
        invoice={invoice}
        suppliers={suppliers}
        categories={categories}
        onSuccess={onSuccess}
      />,
    );

    await submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    // Exatamente 2 chamadas totais (1 falhada + 1 repetida) — nunca uma
    // terceira, nunca a operação processada duas vezes do lado do
    // backend (o 401 vem sempre de antes de o handler correr).
    expect(updateInvoice).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshToken também expirado — termina a sessão (sessionExpired) em vez de mostrar o 401 cru, e nunca repete a operação', async () => {
    createInvoice.mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Refresh token inválido.' }), { status: 401 }),
    );
    const sessionExpired = vi.fn();

    render(
      <InvoiceFormSheet
        open
        onOpenChange={() => {}}
        authFetch={realAuthFetch('token-expired-antigo', 'refresh-expired-antigo', vi.fn(), sessionExpired)}
        invoice={null}
        suppliers={suppliers}
        categories={categories}
        onSuccess={() => {}}
      />,
    );

    fillMinimalForm();
    await submit();

    await waitFor(() => expect(sessionExpired).toHaveBeenCalledTimes(1));
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Token de acesso inválido ou expirado.')).not.toBeInTheDocument();
  });
});
