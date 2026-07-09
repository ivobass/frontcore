import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Standalone — sem HTTP: os workers consomem filas, não servem pedidos.
  const app = await NestFactory.createApplicationContext(AppModule);

  // Garante que OnModuleDestroy (ex. PrismaService.$disconnect) corre em
  // SIGTERM/SIGINT — importante para um processo de longa duração em Docker.
  app.enableShutdownHooks();

  new Logger('Bootstrap').log('FrontRest Workers prontos (standalone, sem HTTP).');
}

void bootstrap();
