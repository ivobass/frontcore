import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AiChatPage from './page';

const listConversations = vi.fn();
const getConversation = vi.fn();
const sendChatMessage = vi.fn();
const deleteConversation = vi.fn();

vi.mock('../../../../lib/ai-chat', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/ai-chat')>('../../../../lib/ai-chat');
  return {
    ...actual,
    listConversations: (...args: unknown[]) => listConversations(...args),
    getConversation: (...args: unknown[]) => getConversation(...args),
    sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
    deleteConversation: (...args: unknown[]) => deleteConversation(...args),
  };
});

vi.mock('../../../../lib/session-context', () => ({
  useSession: () => ({
    session: { accessToken: 'token-abc' },
    me: {
      user: { id: 'u1', email: 'x@x.com', name: null },
      organization: { id: 'org-1', name: 'Org', slug: 'org' },
      role: 'MANAGER',
    },
    logout: () => Promise.resolve(),
  }),
}));

const emptyList = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

const conversationA = {
  id: 'conv-a',
  createdAt: '2026-07-16T10:00:00Z',
  updatedAt: '2026-07-16T10:05:00Z',
  titlePreview: 'Prévia da conversa A',
};
const conversationB = {
  id: 'conv-b',
  createdAt: '2026-07-15T10:00:00Z',
  updatedAt: '2026-07-15T10:05:00Z',
  titlePreview: 'Prévia da conversa B',
};

const messagesA = [
  { id: 'm1', role: 'USER', content: 'Quanto gastei este mês?', createdAt: '2026-07-16T10:00:00Z' },
  { id: 'm2', role: 'ASSISTANT', content: 'Gastaste 370,00 € este mês.', createdAt: '2026-07-16T10:00:05Z' },
];
const messagesB = [
  { id: 'm3', role: 'USER', content: 'Quem são os principais fornecedores?', createdAt: '2026-07-15T10:00:00Z' },
  { id: 'm4', role: 'ASSISTANT', content: 'Hetzner é o principal fornecedor.', createdAt: '2026-07-15T10:00:05Z' },
];

describe('AiChatPage (Fase 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o estado de loading das conversas enquanto o pedido está pendente', async () => {
    listConversations.mockReturnValue(new Promise(() => {}));
    render(<AiChatPage />);
    expect(document.querySelector('[class*="animate-spin"]')).toBeTruthy();
  });

  it('mostra o estado vazio quando não existem conversas', async () => {
    listConversations.mockResolvedValue(emptyList);
    render(<AiChatPage />);
    expect(await screen.findByText('Ainda não tens conversas.')).toBeInTheDocument();
    expect(screen.getByText('Escreve uma pergunta para começar.')).toBeInTheDocument();
  });

  it('lista as conversas existentes e permite mudar entre elas', async () => {
    listConversations.mockResolvedValue({ items: [conversationA, conversationB], page: 1, pageSize: 20, total: 2, totalPages: 1 });
    getConversation.mockImplementation((_token: string, id: string) =>
      Promise.resolve(
        id === 'conv-a' ? { ...conversationA, messages: messagesA } : { ...conversationB, messages: messagesB },
      ),
    );

    render(<AiChatPage />);
    await screen.findByText('Prévia da conversa A');

    fireEvent.click(screen.getByText('Prévia da conversa A'));
    expect(await screen.findByText('Gastaste 370,00 € este mês.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Prévia da conversa B'));
    expect(await screen.findByText('Hetzner é o principal fornecedor.')).toBeInTheDocument();
    expect(screen.queryByText('Gastaste 370,00 € este mês.')).not.toBeInTheDocument();
  });

  it('permite enviar uma mensagem numa conversa nova e mostra a resposta do assistente', async () => {
    listConversations.mockResolvedValue(emptyList);
    sendChatMessage.mockResolvedValue({
      conversationId: 'conv-new',
      message: { id: 'm2', role: 'ASSISTANT', content: 'Resposta do assistente.', createdAt: '2026-07-16T10:00:05Z' },
    });
    getConversation.mockResolvedValue({
      id: 'conv-new',
      createdAt: '2026-07-16T10:00:00Z',
      updatedAt: '2026-07-16T10:00:05Z',
      titlePreview: 'Qual é o meu total de despesas?',
      messages: [
        { id: 'm1', role: 'USER', content: 'Qual é o meu total de despesas?', createdAt: '2026-07-16T10:00:00Z' },
        { id: 'm2', role: 'ASSISTANT', content: 'Resposta do assistente.', createdAt: '2026-07-16T10:00:05Z' },
      ],
    });

    render(<AiChatPage />);
    await screen.findByText('Ainda não tens conversas.');

    fireEvent.change(screen.getByLabelText('Mensagem para o assistente'), {
      target: { value: 'Qual é o meu total de despesas?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Resposta do assistente.')).toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledWith('token-abc', {
      conversationId: undefined,
      message: 'Qual é o meu total de despesas?',
    });
  });

  it('mostra um erro claro quando o envio falha', async () => {
    listConversations.mockResolvedValue(emptyList);
    sendChatMessage.mockRejectedValue(new Error('O assistente de IA está indisponível de momento.'));

    render(<AiChatPage />);
    await screen.findByText('Ainda não tens conversas.');

    fireEvent.change(screen.getByLabelText('Mensagem para o assistente'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('O assistente de IA está indisponível de momento.')).toBeInTheDocument();
  });

  it('não permite enviar uma mensagem vazia — botão desabilitado, sem chamar a API', async () => {
    listConversations.mockResolvedValue(emptyList);
    render(<AiChatPage />);
    await screen.findByText('Ainda não tens conversas.');

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mensagem para o assistente'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('uma conversa inacessível (404) mostra erro — nunca o conteúdo de outra conversa', async () => {
    listConversations.mockResolvedValue({ items: [conversationA], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    getConversation.mockRejectedValue(new Error('Conversa não encontrada.'));

    render(<AiChatPage />);
    await screen.findByText('Prévia da conversa A');
    fireEvent.click(screen.getByText('Prévia da conversa A'));

    expect(await screen.findByText('Conversa não encontrada.')).toBeInTheDocument();
    expect(screen.queryByText(messagesB[0].content)).not.toBeInTheDocument();
    expect(screen.queryByText(messagesA[0].content)).not.toBeInTheDocument();
  });

  it('desabilita o campo de texto e o botão de envio enquanto o pedido está em curso', async () => {
    listConversations.mockResolvedValue(emptyList);
    getConversation.mockResolvedValue({
      id: 'conv-x',
      createdAt: '2026-07-16T10:00:00Z',
      updatedAt: '2026-07-16T10:00:00Z',
      titlePreview: null,
      messages: [],
    });
    let resolveSend: (value: unknown) => void = () => undefined;
    sendChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    render(<AiChatPage />);
    await screen.findByText('Ainda não tens conversas.');

    const textarea = screen.getByLabelText('Mensagem para o assistente');
    const sendButton = screen.getByRole('button', { name: 'Enviar' });

    fireEvent.change(textarea, { target: { value: 'Olá' } });
    fireEvent.click(sendButton);

    await waitFor(() => expect(textarea).toBeDisabled());
    expect(sendButton).toBeDisabled();

    resolveSend({
      conversationId: 'conv-x',
      message: { id: 'm2', role: 'ASSISTANT', content: 'ok', createdAt: '2026-07-16T10:00:00Z' },
    });

    await waitFor(() => expect(textarea).not.toBeDisabled());
  });

  describe('Fase 8.3 — gestão de conversas', () => {
    it('clicar em eliminar abre um diálogo de confirmação, sem eliminar de imediato', async () => {
      listConversations.mockResolvedValue({ items: [conversationA], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      render(<AiChatPage />);
      await screen.findByText('Prévia da conversa A');

      fireEvent.click(screen.getByLabelText('Eliminar conversa "Prévia da conversa A"'));

      expect(await screen.findByText('Eliminar conversa')).toBeInTheDocument();
      expect(deleteConversation).not.toHaveBeenCalled();
    });

    it('confirmar elimina a conversa e remove-a da lista imediatamente, sem refresh', async () => {
      listConversations.mockResolvedValue({ items: [conversationA, conversationB], page: 1, pageSize: 20, total: 2, totalPages: 1 });
      deleteConversation.mockResolvedValue(undefined);
      render(<AiChatPage />);
      await screen.findByText('Prévia da conversa A');

      fireEvent.click(screen.getByLabelText('Eliminar conversa "Prévia da conversa A"'));
      await screen.findByText('Eliminar conversa');
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      await waitFor(() => expect(screen.queryByText('Prévia da conversa A')).not.toBeInTheDocument());
      expect(screen.getByText('Prévia da conversa B')).toBeInTheDocument();
      expect(deleteConversation).toHaveBeenCalledWith('token-abc', 'conv-a');
      // Nunca voltou a chamar listConversations — atualização só local (sem refresh).
      expect(listConversations).toHaveBeenCalledTimes(1);
    });

    it('cancelar não elimina nada', async () => {
      listConversations.mockResolvedValue({ items: [conversationA], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      render(<AiChatPage />);
      await screen.findByText('Prévia da conversa A');

      fireEvent.click(screen.getByLabelText('Eliminar conversa "Prévia da conversa A"'));
      await screen.findByText('Eliminar conversa');
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(deleteConversation).not.toHaveBeenCalled();
      expect(screen.getByText('Prévia da conversa A')).toBeInTheDocument();
    });

    it('eliminar a conversa ativa volta ao estado de nova conversa', async () => {
      listConversations.mockResolvedValue({ items: [conversationA], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      getConversation.mockResolvedValue({ ...conversationA, messages: messagesA });
      deleteConversation.mockResolvedValue(undefined);
      render(<AiChatPage />);
      await screen.findByText('Prévia da conversa A');

      fireEvent.click(screen.getByText('Prévia da conversa A'));
      await screen.findByText('Gastaste 370,00 € este mês.');

      fireEvent.click(screen.getByLabelText('Eliminar conversa "Prévia da conversa A"'));
      await screen.findByText('Eliminar conversa');
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      await waitFor(() => expect(screen.queryByText('Gastaste 370,00 € este mês.')).not.toBeInTheDocument());
    });

    it('erro ao eliminar mostra feedback, sem remover a conversa da lista', async () => {
      listConversations.mockResolvedValue({ items: [conversationA], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      deleteConversation.mockRejectedValue(new Error('Erro ao eliminar a conversa.'));
      render(<AiChatPage />);
      await screen.findByText('Prévia da conversa A');

      fireEvent.click(screen.getByLabelText('Eliminar conversa "Prévia da conversa A"'));
      await screen.findByText('Eliminar conversa');
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      expect(await screen.findByText('Erro ao eliminar a conversa.')).toBeInTheDocument();
      expect(screen.getByText('Prévia da conversa A')).toBeInTheDocument();
    });
  });
});
