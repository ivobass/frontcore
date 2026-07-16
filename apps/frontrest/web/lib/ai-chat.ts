import { API_URL, authHeaders, authJsonHeaders, buildQuery, parseJsonOrThrow } from './api';
import type { Paginated } from './api';

export type ChatMessageRole = 'USER' | 'ASSISTANT';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

export interface SendChatMessageResult {
  conversationId: string;
  message: ChatMessage;
}

export interface ListConversationsParams {
  page?: number;
  pageSize?: number;
}

export async function listConversations(
  accessToken: string,
  params: ListConversationsParams = {},
): Promise<Paginated<ConversationSummary>> {
  const response = await fetch(`${API_URL}/ai/conversations${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function getConversation(
  accessToken: string,
  id: string,
): Promise<ConversationDetail> {
  const response = await fetch(`${API_URL}/ai/conversations/${id}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function sendChatMessage(
  accessToken: string,
  input: { conversationId?: string; message: string },
): Promise<SendChatMessageResult> {
  const response = await fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}
