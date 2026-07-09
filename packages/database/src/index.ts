import { PrismaClient } from './generated/prisma';

export * from './generated/prisma';
export * from './nestjs';

/**
 * CONVENÇÃO DE USO DO PRISMA (FrontCore)
 * --------------------------------------
 * - Em qualquer app NestJS (ex.: apps/frontrest/api, apps/frontrest/workers)
 *   usa-se EXCLUSIVAMENTE `PrismaModule`/`PrismaService` (exportados por este
 *   package, em `./nestjs`) via injeção de dependências — inclui workers
 *   standalone criados com `NestFactory.createApplicationContext`, que
 *   continuam a ser um contexto de DI real mesmo sem HTTP. NÃO importar o
 *   singleton abaixo dentro dessas apps — evita um segundo pool de conexões
 *   a competir.
 * - O singleton `prisma` abaixo existe só para SCRIPTS puros, fora de
 *   qualquer container Nest (ex. seeds).
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
