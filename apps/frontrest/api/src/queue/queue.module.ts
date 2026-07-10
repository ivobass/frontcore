import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { BullMQQueueProducer, loadQueueConfig } from '@frontcore/queue';
import type { QueueProducer } from '@frontcore/queue';
import { QUEUE_PRODUCER } from './queue-producer.token';

/**
 * Único ponto de `apps/frontrest/api` que importa `BullMQQueueProducer`
 * diretamente — os serviços de domínio (ex. `InvoiceDraftsService`) só
 * conhecem o tipo `QueueProducer`, injetado via `QUEUE_PRODUCER`. Mesmo
 * padrão de `uploads/uploads.module.ts` para `ObjectStorage`.
 *
 * Fecha a ligação do produtor durante o shutdown do processo — `main.ts`
 * chama `app.enableShutdownHooks()`, que é o que faz o NestJS invocar
 * `onModuleDestroy()` num `SIGTERM`/`SIGINT`, não só em `app.close()`
 * explícito (usado pelos testes e2e).
 */
@Module({
  providers: [
    {
      provide: QUEUE_PRODUCER,
      useFactory: (): QueueProducer => new BullMQQueueProducer(loadQueueConfig()),
    },
  ],
  exports: [QUEUE_PRODUCER],
})
export class QueueModule implements OnModuleDestroy {
  constructor(@Inject(QUEUE_PRODUCER) private readonly producer: QueueProducer) {}

  async onModuleDestroy(): Promise<void> {
    await this.producer.close();
  }
}
