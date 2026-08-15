import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { AiCompletionProvider } from '@frontcore/ai';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@frontcore/database';
import { OBJECT_STORAGE } from '../../src/uploads/object-storage.token';
import { QUEUE_PRODUCER } from '../../src/queue/queue-producer.token';
import { AI_COMPLETION_PROVIDER } from '../../src/ai/ai-completion-provider.token';
import { createMockPrismaService } from './mock-prisma';
import type { MockPrismaService } from './mock-prisma';
import { createMockObjectStorage } from './mock-object-storage';
import type { MockObjectStorage } from './mock-object-storage';
import { createMockQueueProducer } from './mock-queue-producer';
import type { MockQueueProducer } from './mock-queue-producer';

/**
 * Arranca o `AppModule` real (guards globais incluídos) para os testes e2e,
 * com `PrismaService` e `ObjectStorage` substituídos por mocks — nenhuma
 * ligação a base de dados nem a MinIO real. Replica só o que `main.ts`
 * configura e que afeta comportamento observável em testes (prefixo
 * `/api`, `ValidationPipe`); omite `helmet()`/CORS, irrelevantes para
 * pedidos `supertest`.
 *
 * `aiProvider` (hardening pós-revisão Codex, opcional) — substitui
 * `AI_COMPLETION_PROVIDER` (por omissão, `MockAiProvider`, sempre um
 * eco determinístico) por um duplo escolhido pelo teste. Único uso
 * real: simular uma resposta *realmente fabricada pelo provider* (ex.
 * um número de fatura inventado) para provar Strict Grounding
 * end-to-end — nunca alcançável só com o eco do `MockAiProvider`, que
 * nunca inventa dados por desenho.
 */
export async function createTestApp(options: { aiProvider?: AiCompletionProvider } = {}): Promise<{
  app: INestApplication;
  prisma: MockPrismaService;
  storage: MockObjectStorage;
  queueProducer: MockQueueProducer;
}> {
  const prisma = createMockPrismaService();
  const storage = createMockObjectStorage();
  const queueProducer = createMockQueueProducer();

  let moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .overrideProvider(QUEUE_PRODUCER)
    .useValue(queueProducer);

  if (options.aiProvider) {
    moduleBuilder = moduleBuilder.overrideProvider(AI_COMPLETION_PROVIDER).useValue(options.aiProvider);
  }

  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return { app, prisma, storage, queueProducer };
}
