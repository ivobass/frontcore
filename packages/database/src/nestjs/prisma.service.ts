import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

/**
 * Única fonte de acesso ao Prisma dentro de uma app NestJS (via DI) —
 * inclui `apps/frontrest/api` e qualquer worker standalone criado com
 * `NestFactory.createApplicationContext` (continua a ser um contexto de
 * DI real, mesmo sem HTTP). Não importar o singleton `prisma` de
 * `@frontcore/database` nesse tipo de app — evita um segundo pool de
 * conexões a competir. Esse singleton fica reservado a scripts puros,
 * fora de qualquer container Nest (ex. seeds).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
