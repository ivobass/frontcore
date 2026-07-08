import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OBJECT_STORAGE } from '../../src/uploads/object-storage.token';
import { createMockPrismaService } from './mock-prisma';
import type { MockPrismaService } from './mock-prisma';
import { createMockObjectStorage } from './mock-object-storage';
import type { MockObjectStorage } from './mock-object-storage';

/**
 * Arranca o `AppModule` real (guards globais incluídos) para os testes e2e,
 * com `PrismaService` e `ObjectStorage` substituídos por mocks — nenhuma
 * ligação a base de dados nem a MinIO real. Replica só o que `main.ts`
 * configura e que afeta comportamento observável em testes (prefixo
 * `/api`, `ValidationPipe`); omite `helmet()`/CORS, irrelevantes para
 * pedidos `supertest`.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: MockPrismaService;
  storage: MockObjectStorage;
}> {
  const prisma = createMockPrismaService();
  const storage = createMockObjectStorage();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();

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

  return { app, prisma, storage };
}
