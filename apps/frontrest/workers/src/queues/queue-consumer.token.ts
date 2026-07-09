/**
 * Token de injeção NestJS para `QueueConsumer` — mesmo padrão de
 * `OBJECT_STORAGE` em `apps/frontrest/api/src/uploads/object-storage.token.ts`.
 * Só `ocr-processing.module.ts` importa `BullMQQueueConsumer` diretamente;
 * o resto da app só conhece o tipo `QueueConsumer` de `@frontcore/queue`.
 */
export const QUEUE_CONSUMER = Symbol('QUEUE_CONSUMER');
