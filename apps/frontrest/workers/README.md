# FrontRest IA — Workers

App NestJS **standalone** (sem HTTP — `NestFactory.createApplicationContext`),
consumidora de filas BullMQ sobre Redis via `@frontcore/queue`, e da
mesma base de dados que `apps/frontrest/api` via `PrismaModule`
partilhado (`@frontcore/database`).

## Estado atual (Fase 6.5)

`OcrProcessingProcessor` consome a fila `ocr-processing`
(`apps/frontrest/api` publica um job automaticamente sempre que um
`InvoiceDraft` é criado, com `attempts: 3` e backoff exponencial — 5s
antes da tentativa 2, 10s antes da tentativa 3; só 2 atrasos possíveis
com 3 tentativas). Para cada tentativa:

1. Confirma que existe um `InvoiceDraft` que corresponde
   simultaneamente ao `id`, `organizationId` e `storageObjectId` do
   payload — nunca confia apenas no `id` fornecido.
2. Confirma que o `StorageObject` associado existe, pertence à mesma
   organização e tem `key` válida.
3. Marca `ocrStatus: PROCESSING` (claim atómico — se o draft deixou de
   corresponder às três condições entretanto, ignora sem retry).
4. Obtém o ficheiro (`ObjectStorage.get()`) e executa
   `OCRService.extract()` (`@frontcore/ocr`, provider real — Tesseract
   por omissão), com `language`/`timeoutMs` lidos de
   `OCR_LANGUAGE`/`OCR_TIMEOUT_MS`.
5. **Sucesso**: persiste `ocrText`, `ocrConfidence` e `ocrStatus:
   COMPLETED` — revalidando a mesma correspondência (id + organização +
   storageObjectId) no momento da escrita, para cobrir a corrida em que
   o draft foi eliminado ou promovido enquanto o OCR corria.
6. **Falha técnica** (storage/OCR/Prisma): se ainda houver tentativas
   por esgotar, marca `ocrStatus: PENDING` e propaga a exceção — é o
   BullMQ (via `attempts`/`backoff` configurados na publicação) quem
   decide se e quando volta a chamar o processor, nunca uma lógica de
   retry própria. Na última tentativa permitida, marca `ocrStatus:
   FAILED` com uma mensagem **sanitizada** em `ocrError` (nunca a
   mensagem bruta da exceção — evita expor detalhe interno de
   Redis/Storage/provider através de `GET /invoices/drafts`).

O Worker **não** faz parsing fiscal, **não** extrai campos estruturados
(fornecedor, datas, totais), **não** promove drafts, **não** cria nem
altera `Invoice`/`InvoiceAttachment`. Se o `InvoiceDraft` ou o
`StorageObject` referenciados já não existirem (eliminados ou o draft
já promovido antes do processamento), o job é ignorado de forma segura
— log de aviso, sem erro, sem retry, sem alteração de `ocrStatus`.

`OcrProcessingModule` fecha a ligação Redis do `QueueConsumer` em
`onModuleDestroy()` — `main.ts` chama `app.enableShutdownHooks()`, o que
faz o NestJS invocar esse hook num `SIGTERM`/`SIGINT` real (mesmo padrão
usado pelo `QueueModule` em `apps/frontrest/api` para o produtor).

Ver `docs/phases/phase-6.5-ocr-retry-recovery-foundation.md` para o
desenho completo de retry/backoff/estados. Fundação anterior:
`docs/phases/phase-6.1-ocr-worker-foundation.md` (app standalone, fila,
consumidor mock), `docs/phases/phase-6.2-ocr-pipeline-foundation.md`
(`@frontcore/ocr`, provider Tesseract real) e
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`
(integração automática API → Queue → Worker → InvoiceDraft).

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

Endpoint de recovery manual ("Retry OCR") sobre drafts com `ocrStatus
IN (PENDING, FAILED)`; Dead Letter Queue completa; observabilidade
sobre `ocrStatus` agregado; parsing fiscal e extração estruturada de
campos a partir de `ocrText`; UI de rascunhos — ver "Trabalho futuro" em
`docs/phases/phase-6.5-ocr-retry-recovery-foundation.md`.
