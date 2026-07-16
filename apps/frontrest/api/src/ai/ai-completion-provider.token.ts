/**
 * Token de injeção NestJS para `AiCompletionProvider` — o resto da API
 * nunca conhece `OllamaAiProvider`/`MockAiProvider` diretamente, só este
 * token e o tipo (mesmo padrão de `OBJECT_STORAGE`/`QUEUE_PRODUCER`).
 */
export const AI_COMPLETION_PROVIDER = Symbol('AI_COMPLETION_PROVIDER');
