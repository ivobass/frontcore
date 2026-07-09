# FrontRest IA — Workers

App NestJS **standalone** (sem HTTP — `NestFactory.createApplicationContext`),
consumidora de filas BullMQ sobre Redis via `@frontcore/queue`, e da
mesma base de dados que `apps/frontrest/api` via `PrismaModule`
partilhado (`@frontcore/database`).

Foundation implementada na **Fase 6.1**
(`docs/phases/phase-6.1-ocr-worker-foundation.md`) — regista uma fila,
`ocr-processing`, com um consumidor **mock**: confirma que recebe o job,
sem chamar nenhum motor OCR real. Nenhum provider de OCR, nenhuma
extração de dados, nenhuma escrita em `Invoice` — fora do âmbito desta
fase.

## Arrancar localmente

```bash
pnpm --filter @frontrest/workers dev
```

Precisa de `DATABASE_URL` e `REDIS_URL` no ambiente — mesmas variáveis
já usadas por `apps/frontrest/api` (ver `.env`/`.env.example` na raiz).

## Estrutura

```
src/
  main.ts                          — bootstrap standalone
  app.module.ts                     — módulo raiz
  queues/
    queue-consumer.token.ts          — token de injeção NestJS para QueueConsumer
    ocr-processing.module.ts          — regista o consumidor da fila via @frontcore/queue
    ocr-processing.processor.ts        — consumidor mock (sem OCR real)
```

## Próxima fase

Motor OCR real (leitura do `StorageObject` via `@frontcore/storage`,
extração de dados, criação de fatura em rascunho) — fora do âmbito desta
fase, ver "Trabalho fora do âmbito" em
`docs/phases/phase-6.1-ocr-worker-foundation.md`.
