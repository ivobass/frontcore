/**
 * Token de injeção NestJS para `QueueProducer` — mesmo padrão de
 * `OBJECT_STORAGE` em `apps/frontrest/api/src/uploads/object-storage.token.ts`.
 * Só `queue.module.ts` importa `BullMQQueueProducer` diretamente; o resto
 * da app só conhece o tipo `QueueProducer` de `@frontcore/queue`.
 */
export const QUEUE_PRODUCER = Symbol('QUEUE_PRODUCER');
