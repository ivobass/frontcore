/**
 * Token de injeção NestJS para a coleção de `FiscalExtractor<unknown>` —
 * mesmo padrão de `QUEUE_CONSUMER`/`OBJECT_STORAGE` (ver
 * `apps/frontrest/workers/src/queues/queue-consumer.token.ts`), mas por
 * um motivo diferente: naqueles, o token existe para esconder uma
 * implementação de infraestrutura substituível. Aqui existe para
 * agregar N providers do mesmo contrato numa lista injetável — evita
 * `FiscalParsingService` ter um parâmetro de construtor por extractor
 * (viável com 9, não escalaria para 20-30). Registado em
 * `fiscal-parsing.module.ts` via `useFactory`/`inject`.
 */
export const FISCAL_EXTRACTORS = Symbol('FISCAL_EXTRACTORS');
