import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { parseCsvEnv } from '@frontcore/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Necessário para o NestJS invocar onModuleDestroy() (ex. fechar a
  // ligação do QueueProducer, Fase 6.4) num SIGTERM/SIGINT real, não só
  // em app.close() explícito.
  app.enableShutdownHooks();

  // Reverse proxy / Cloudflare: confia em N saltos para resolver
  // X-Forwarded-For (req.ip) e X-Forwarded-Proto (req.protocol).
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  app.set('trust proxy', trustProxyHops);

  // Cabeçalhos de segurança.
  app.use(helmet());

  // Todos os endpoints sob /api
  app.setGlobalPrefix('api');

  // Validação global de DTOs (consumida a sério a partir da Fase 2).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS controlado por env.
  const corsOrigins = parseCsvEnv(process.env.CORS_ORIGINS);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`FrontRest API pronta em http://0.0.0.0:${port}/api`);
}

void bootstrap();
