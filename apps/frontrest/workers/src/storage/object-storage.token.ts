/**
 * Token de injeção NestJS para `ObjectStorage` — mesmo padrão de
 * `OBJECT_STORAGE` em `apps/frontrest/api/src/uploads/object-storage.token.ts`
 * e de `QUEUE_CONSUMER` em `queues/queue-consumer.token.ts`. Só
 * `queues/ocr-processing.module.ts` importa `S3ObjectStorage`
 * diretamente; o resto da app só conhece o tipo `ObjectStorage`.
 */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
