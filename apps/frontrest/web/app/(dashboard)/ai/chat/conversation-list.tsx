'use client';

import { Button, Typography } from '@frontcore/ui';
import type { ConversationSummary } from '../../../../lib/ai-chat';

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({ conversations, selectedId, onSelect, onNew }: ConversationListProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Button type="button" onClick={onNew} className="w-full">
        Nova conversa
      </Button>

      {conversations.length === 0 ? (
        <Typography variant="muted">Ainda não tens conversas.</Typography>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <li
              key={conversation.id}
              className={`rounded-md border p-3 ${
                conversation.id === selectedId ? 'border-primary bg-accent' : 'border-input'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className="w-full text-left"
                aria-current={conversation.id === selectedId}
              >
                <Typography variant="small" className="line-clamp-2">
                  {conversation.lastMessagePreview ?? 'Conversa vazia'}
                </Typography>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
