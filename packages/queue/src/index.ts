/**
 * @frontcore/queue
 * Filas assíncronas sobre BullMQ/Redis, reutilizável por qualquer produto
 * FrontCore. Sem lógica de domínio — o nome da fila e o payload são
 * decisão exclusiva do consumidor.
 */
export * from './contracts';
export * from './config';
export * from './providers';
export * from './errors';
export * from './jobs';
