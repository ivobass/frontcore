'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Alert, AlertDescription, Spinner } from '@frontcore/ui';
import { useSession } from '../../../../lib/session-context';
import { useFeedback } from '../../../../lib/use-feedback';
import { FeedbackBanner } from '../../../../components/feedback-banner';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import { listConversations, getConversation, sendChatMessage, deleteConversation } from '../../../../lib/ai-chat';
import type { ConversationSummary, ChatMessage } from '../../../../lib/ai-chat';
import { ConversationList } from './conversation-list';
import { ChatThread } from './chat-thread';

export default function AiChatPage() {
  const { session } = useSession();
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
      const result = await listConversations(session.accessToken);
      setConversations(result.items);
    } catch (err) {
      setConversationsError(err instanceof Error ? err.message : 'Erro ao carregar as conversas.');
    } finally {
      setConversationsLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getConversation(session.accessToken, selectedId)
      .then((detail) => {
        if (cancelled) return;
        setMessages(detail.messages);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSendError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, session.accessToken]);

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
      const result = await sendChatMessage(session.accessToken, {
        conversationId: selectedId ?? undefined,
        message: content,
      });
      setDraft('');
      setSelectedId(result.conversationId);
      const detail = await getConversation(session.accessToken, result.conversationId);
      setMessages(detail.messages);
      await loadConversations();
    } catch (err) {
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
      await deleteConversation(session.accessToken, deleting.id);
      setConversations((prev) => prev.filter((c) => c.id !== deleting.id));
      if (selectedId === deleting.id) {
        handleNew();
      }
      notifySuccess('Conversa eliminada.');
      setDeleting(null);
    } catch (err) {
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
