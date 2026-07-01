import { PrismaClient } from './generated/prisma';

export * from './generated/prisma';

/**
 * CONVENÇÃO DE USO DO PRISMA (FrontCore)
 * --------------------------------------
 * - Em apps NestJS (ex.: apps/frontrest/api) usa-se EXCLUSIVAMENTE um
 *   `PrismaService` via injeção de dependências. NÃO importar este singleton
 *   dentro dessas apps — evita um segundo pool de conexões a competir.
 * - Este singleton existe para WORKERS/SCRIPTS (fases futuras) que correm fora
 *   do contexto de DI e precisam de um cliente partilhado e leve.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
