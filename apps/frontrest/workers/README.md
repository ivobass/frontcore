# FrontRest IA — Workers

App NestJS **standalone** (sem HTTP — `NestFactory.createApplicationContext`),
consumidora de filas BullMQ sobre Redis via `@frontcore/queue`, e da
mesma base de dados que `apps/frontrest/api` via `PrismaModule`
partilhado (`@frontcore/database`).

## Estado atual (Fase 6.4)

`OcrProcessingProcessor` consome a fila `ocr-processing`
(`apps/frontrest/api` publica um job automaticamente sempre que um
`InvoiceDraft` é criado). Para cada job:

1. Confirma que existe um `InvoiceDraft` que corresponde
   simultaneamente ao `id`, `organizationId` e `storageObjectId` do
   payload — nunca confia apenas no `id` fornecido.
2. Confirma que o `StorageObject` associado existe, pertence à mesma
   organização e tem `key` válida.
3. Obtém o ficheiro (`ObjectStorage.get()`) e executa
   `OCRService.extract()` (`@frontcore/ocr`, provider real — Tesseract
   por omissão), com `language`/`timeoutMs` lidos de
   `OCR_LANGUAGE`/`OCR_TIMEOUT_MS`.
4. **Persiste `ocrText` e `ocrConfidence` no `InvoiceDraft`** —
   revalidando a mesma correspondência (id + organização +
   storageObjectId) no momento da escrita, para cobrir a corrida em que
   o draft foi eliminado ou promovido enquanto o OCR corria.

O Worker **não** faz parsing fiscal, **não** extrai campos estruturados
(fornecedor, datas, totais), **não** promove drafts, **não** cria nem
altera `Invoice`/`InvoiceAttachment`. Se o `InvoiceDraft` ou o
`StorageObject` referenciados já não existirem (eliminados ou o draft
já promovido antes do processamento), o job é ignorado de forma segura
— log de aviso, sem erro, sem retry. Falhas técnicas reais (storage,
OCR, Prisma) continuam a propagar para acionar o retry normal da fila.

`OcrProcessingModule` fecha a ligação Redis do `QueueConsumer` em
`onModuleDestroy()` — `main.ts` chama `app.enableShutdownHooks()`, o que
faz o NestJS invocar esse hook num `SIGTERM`/`SIGINT` real (mesmo padrão
usado pelo `QueueModule` em `apps/frontrest/api` para o produtor).

Ver `docs/phases/phase-6.4-ocr-draft-integration-foundation.md` para o
fluxo completo, decisões arquiteturais e limitações conhecidas.
Fundação anterior: `docs/phases/phase-6.1-ocr-worker-foundation.md`
(app standalone, fila, consumidor mock) e
`docs/phases/phase-6.2-ocr-pipeline-foundation.md` (`@frontcore/ocr`,
provider Tesseract real, resultado só registado em log, sem
persistência).

## Arrancar localmente

```bash
pnpm --filter @frontrest/workers dev
```

Precisa de `DATABASE_URL`, `REDIS_URL`, `S3_*`, `OCR_PROVIDER`,
`OCR_LANGUAGE` e `OCR_TIMEOUT_MS` no ambiente (as duas últimas com
valores por omissão — `eng` e `30000` — se omitidas) — mesmas variáveis
já usadas por `apps/frontrest/api` (ver `.env`/`.env.example` na raiz).

## Estrutura

```
src/
  main.ts                          — bootstrap standalone
  app.module.ts                     — módulo raiz
  queues/
    queue-consumer.token.ts          — token de injeção NestJS para QueueConsumer
    ocr-processing.module.ts          — regista o consumidor da fila via @frontcore/queue
    ocr-processing.processor.ts        — fluxo real: valida InvoiceDraft+StorageObject, extrai e persiste OCR
  storage/
    object-storage.token.ts           — token de injeção NestJS para ObjectStorage
```

## Próxima fase

Endpoint de reagendamento de OCR para drafts cuja publicação do job
falhou; parsing fiscal e extração estruturada de campos a partir de
`ocrText`; UI de rascunhos — ver "Trabalho futuro" em
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.
