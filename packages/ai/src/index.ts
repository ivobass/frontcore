/**
 * @frontcore/ai
 * Contrato genérico de provider de IA para completions — agnóstico de
 * fornecedor (mock, Ollama, e futuros — ex. OpenAI, Anthropic, Azure
 * OpenAI, OpenRouter, numa fase própria). Zero lógica de domínio: nenhum
 * prompt de fatura, nenhum conhecimento de OCR/InvoiceDraft/FiscalField.
 * Ver docs/phases/phase-6.11-ai-provider-foundation.md.
 */
export * from './contracts';
export * from './config';
export * from './providers';
export * from './errors';
