import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@frontcore/database';

/**
 * Única fonte de acesso ao Prisma dentro da API (via DI do NestJS).
 * Não importar o singleton `prisma` de @frontcore/database aqui — ver convenção.
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
