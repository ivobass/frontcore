import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createMockPrismaService } from './mock-prisma';
import type { MockPrismaService } from './mock-prisma';

/**
 * Arranca o `AppModule` real (guards globais incluídos) para os testes e2e,
 * com `PrismaService` substituído pelo mock — nenhuma ligação a base de
 * dados real. Replica só o que `main.ts` configura e que afeta
 * comportamento observável em testes (prefixo `/api`, `ValidationPipe`);
 * omite `helmet()`/CORS, irrelevantes para pedidos `supertest`.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: MockPrismaService;
}> {
  const prisma = createMockPrismaService();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
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

  return { app, prisma };
}
