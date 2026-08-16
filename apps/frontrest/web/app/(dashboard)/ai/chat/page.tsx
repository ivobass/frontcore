'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Alert, AlertDescription, Spinner } from '@frontcore/ui';
import { useSession } from '../../../../lib/session-context';
import { useFeedback } from '../../../../lib/use-feedback';
import { FeedbackBanner } from '../../../../components/feedback-banner';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import { listConversations, getConversation, sendChatMessage, deleteConversation } from '../../../../lib/ai-chat';
import type { ConversationSummary, ChatMessage } from '../../../../lib/ai-chat';
import { isSessionLifecycleError } from '../../../../lib/auth';
import { ConversationList } from './conversation-list';
import { ChatThread } from './chat-thread';

export default function AiChatPage() {
  // `authFetch()` (`useSession()`, `lib/session-context.tsx`) — chamada
  // autenticada centralizada: lê sempre os tokens mais recentes (nunca
  // `session.accessToken` capturado no início do handler), renova a
  // sessão uma única vez num 401, e termina a sessão de forma uniforme
  // (`sessionExpired()`, já chamado internamente) se a renovação falhar.
  // Correção final pós-revisão Codex — achado real: `handleSend()`
  // encadeia `sendChatMessage()` → `getConversation()` →
  // `loadConversations()`; sem ler sempre a `ref` mais recente, uma
  // renovação despoletada pela primeira chamada deixava as seguintes,
  // na mesma invocação do handler, a usar tokens já desatualizados.
  const { authFetch } = useSession();
  const { feedback, notifySuccess, notifyError } = useFeedback();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function loadConversations() {
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const result = await authFetch((token) => listConversations(token));
      setConversations(result.items);
    } catch (err) {
      // `authFetch()` já chamou `sessionExpired()` — nunca mostrar o erro
      // local, a página vai já ser substituída pelo redirecionamento.
      if (isSessionLifecycleError(err)) return;
      setConversationsError(err instanceof Error ? err.message : 'Erro ao carregar as conversas.');
    } finally {
      setConversationsLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    authFetch((token) => getConversation(token, selectedId))
      .then((detail) => {
        if (cancelled) return;
        setMessages(detail.messages);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isSessionLifecycleError(err)) return;
        setSendError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function handleNew() {
    setSelectedId(null);
    setMessages([]);
    setSendError(null);
    setDraft('');
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const result = await authFetch((token) =>
        sendChatMessage(token, { conversationId: selectedId ?? undefined, message: content }),
      );
      setDraft('');
      setSelectedId(result.conversationId);
      const detail = await authFetch((token) => getConversation(token, result.conversationId));
      setMessages(detail.messages);
      await loadConversations();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setSendError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  /**
   * Atualização imediata (Fase 8.3) — remove da lista local logo após o
   * sucesso do pedido, sem refazer `listConversations()` nem qualquer
   * refresh da página. Se a conversa eliminada era a ativa, volta ao
   * estado "nova conversa".
   */
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await authFetch((token) => deleteConversation(token, deleting.id));
      setConversations((prev) => prev.filter((c) => c.id !== deleting.id));
      if (selectedId === deleting.id) {
        handleNew();
      }
      notifySuccess('Conversa eliminada.');
      setDeleting(null);
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      notifyError(err instanceof Error ? err.message : 'Erro ao eliminar a conversa.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assistente IA"
        description="Faz perguntas sobre os dados financeiros confirmados da tua organização."
      />

      <FeedbackBanner feedback={feedback} />

      {conversationsError ? (
        <Alert variant="destructive">
          <AlertDescription>{conversationsError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <div className="md:border-r md:pr-6">
          {conversationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNew={handleNew}
              onDeleteRequest={setDeleting}
            />
          )}
        </div>

        <ChatThread
          messages={messages}
          loading={detailLoading}
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          sending={sending}
          sendError={sendError}
        />
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar conversa"
        description={`Tens a certeza que queres eliminar "${deleting?.titlePreview ?? 'esta conversa'}"? Esta ação não pode ser desfeita.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
