/** Mensagem genérica de um pedido de completion — sem forma específica de fornecedor. */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
