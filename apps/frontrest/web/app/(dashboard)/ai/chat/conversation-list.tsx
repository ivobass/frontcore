'use client';

import { Button, EmptyState, Typography } from '@frontcore/ui';
import type { ConversationSummary } from '../../../../lib/ai-chat';

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleteRequest: (conversation: ConversationSummary) => void;
}

/** Ordenação por `updatedAt DESC` já garantida pelo backend (`AiChatService.listConversations()`) — nunca reordenado aqui (Fase 8.3). */
export function ConversationList({ conversations, selectedId, onSelect, onNew, onDeleteRequest }: ConversationListProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Button type="button" onClick={onNew} className="w-full">
        Nova conversa
      </Button>

      {conversations.length === 0 ? (
        <EmptyState title="Ainda não tens conversas." description="As tuas conversas vão aparecer aqui." />
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <li
              key={conversation.id}
              className={`group flex items-center gap-1 rounded-md border p-3 ${
                conversation.id === selectedId ? 'border-primary bg-accent' : 'border-input'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className="min-w-0 flex-1 text-left"
                aria-current={conversation.id === selectedId}
              >
                <Typography variant="small" className="line-clamp-2">
                  {conversation.titlePreview ?? 'Conversa vazia'}
                </Typography>
              </button>
              <button
                type="button"
                onClick={() => onDeleteRequest(conversation)}
                aria-label={`Eliminar conversa "${conversation.titlePreview ?? 'Conversa vazia'}"`}
                className="shrink-0 rounded-md px-2 py-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
