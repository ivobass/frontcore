'use client';

import type { KeyboardEvent } from 'react';
import { Alert, AlertDescription, Button, Spinner, Textarea, Typography } from '@frontcore/ui';
import type { ChatMessage } from '../../../../lib/ai-chat';

interface ChatThreadProps {
  messages: ChatMessage[];
  loading: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
}

export function ChatThread({
  messages,
  loading,
  draft,
  onDraftChange,
  onSend,
  sending,
  sendError,
}: ChatThreadProps) {
  const canSend = !sending && draft.trim().length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Alert>
        <AlertDescription>
          As respostas deste assistente são geradas automaticamente a partir dos dados financeiros da tua organização — confirma sempre a informação antes de a usares para decisões.
        </AlertDescription>
      </Alert>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        ) : messages.length === 0 ? (
          <Typography variant="muted">Escreve uma pergunta para começar.</Typography>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[80%] rounded-md p-3 ${
                message.role === 'USER'
                  ? 'self-end bg-primary text-primary-foreground'
                  : 'self-start bg-muted text-foreground'
              }`}
            >
              <Typography
                variant="small"
                className={`whitespace-pre-wrap ${message.role === 'USER' ? 'text-primary-foreground' : ''}`}
              >
                {message.content}
              </Typography>
            </div>
          ))
        )}
      </div>

      {sendError ? (
        <Alert variant="destructive">
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreve a tua pergunta… (Enter para enviar, Shift+Enter para nova linha)"
          disabled={sending}
          className="flex-1"
          aria-label="Mensagem para o assistente"
        />
        <Button type="button" onClick={onSend} disabled={!canSend}>
          {sending ? <Spinner className="h-4 w-4" /> : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
