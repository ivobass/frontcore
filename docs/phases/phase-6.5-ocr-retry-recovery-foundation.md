# Fase 6.5 — OCR Retry & Recovery Foundation

## Objetivo

Tornar o pipeline OCR (Fase 6.4) resiliente a falhas transitórias — sem
intervenção humana e sem reimplementar nenhuma lógica de retry/atraso já
disponibilizada pelo broker. Baseline: tag `v0.6.4-audit-hardening`.

## Âmbito

Só o ciclo de vida de execução do job OCR e o estado do `InvoiceDraft`
associado. Fora do âmbito, explicitamente: Dead Letter Queue completa,
dashboard/UI de monitorização, endpoint manual de retry, novos providers
OCR, novas funcionalidades de upload, alterações ao domínio financeiro
(`Invoice`), parsing fiscal/extração estruturada (Fase 6.6+).

## Estado anterior

Desde a Fase 6.4, `InvoiceDraftsService.create()` publicava o job OCR com
`attempts: 3` e nenhuma política de backoff — uma falha técnica
(storage/OCR/Prisma) propagada pelo `OcrProcessingProcessor` fazia o
BullMQ repetir a tentativa **imediatamente**, sem qualquer atraso. Não
existia nenhum campo no `InvoiceDraft` que distinguisse "ainda não
processado" de "falhou depois de esgotar as tentativas" — em ambos os
casos `ocrText`/`ocrConfidence` ficavam `null`, indistinguíveis.

## Decisões arquiteturais

### 1. Backoff exponencial nativo do BullMQ, não reimplementado

`EnqueueOptions` (`packages/queue/src/contracts/queue.ts`) ganhou um
campo opcional `backoff?: { type: 'fixed' | 'exponential'; delayMs:
number }`, mapeado 1:1 para o `backoff: { type, delay }` nativo do
BullMQ em `BullMQQueueProducer.add()`. Nenhum `setTimeout`/loop de
espera existe em código FrontCore — é sempre o broker que agenda o
próximo `active` do job. `InvoiceDraftsService.create()` configura
`{ type: 'exponential', delayMs: 5000 }` com `attempts: 3` (inalterado
desde a Fase 6.4) — com apenas 3 tentativas há só 2 atrasos possíveis:
5s antes da tentativa 2, 10s antes da tentativa 3 (delayMs × 2^n; não
existe tentativa 4, logo nunca há um 3º atraso de 20s). Confirmado
experimentalmente na validação Docker desta fase: tentativa 2 a +5s,
tentativa 3 a +~10-11s — suficiente para uma falha transitória de
Redis/Storage/provider se resolver sozinha sem martelar o broker em
loop imediato.

### 2. Contagem de tentativas exposta pela abstração, nunca duplicada

O `JobHandler<T>` (mesmo ficheiro) passou a receber um terceiro
argumento, `JobAttemptInfo { attemptNumber; maxAttempts }`. Em
`BullMQQueueConsumer.consume()`, estes valores vêm diretamente de
`job.attemptsStarted` (contador nativo do BullMQ, incrementado no
script `moveToActive` antes de cada execução — 1 na primeira tentativa,
2 na primeira retry, etc.) e `job.opts.attempts`. Nenhuma contagem
paralela é mantida por `OcrProcessingProcessor` — se o BullMQ decidir
não repetir, o processor nunca vê uma "tentativa 4". Esta é a única
alteração ao contrato genérico de filas; `QueueProducer`/`EnqueuedJob`
ficam inalterados.

### 3. `OcrStatus` — só 4 estados, "falha temporária" não é um estado em repouso

Novo enum `OcrStatus { PENDING, PROCESSING, COMPLETED, FAILED }` em
`InvoiceDraft` (`packages/database/prisma/schema.prisma`), com
`@default(PENDING)`. Deliberadamente **não** existe um 5º estado para
"falha temporária": entre tentativas, o job está fisicamente parado no
atraso de backoff do BullMQ — nenhum código FrontCore está a correr —
por isso o estado persistido reverte para `PENDING` ("ainda por
processar com sucesso", que continua a ser verdade). `PROCESSING` só
existe enquanto uma tentativa está mesmo a decorrer; `FAILED` só é
escrito quando o `JobAttemptInfo` recebido confirma que aquela era a
última tentativa permitida. Este desenho evita um estado que nunca
seria observável em repouso (só entre um `throw` e o próximo `active`,
uma janela de milissegundos) e mantém a distinção que a fase pedia:
pendente, em processamento, concluído, falha permanente.

Campo adicional `ocrError String?` — mensagem **sanitizada** da última
falha permanente, nunca `error.message` bruta. Motivo: `ocrError` é
devolvido por `GET /invoices/drafts`/`GET /invoices/drafts/:id` a
qualquer membro autenticado da organização (mesmo alcance already
existente de `ocrText`/`ocrConfidence`) — expor detalhes internos de
Redis/Storage/provider nesse campo repetiria o problema já corrigido na
Fase 6.4 para a mensagem de erro de publicação do job. Uma função pura
(`sanitizeOcrError()`, `ocr-processing.processor.ts`) classifica o erro
por `instanceof` contra a taxonomia **já existente** em `@frontcore/ocr`
(`OCRTimeoutError`, `OCRUnsupportedFormatError`, `OCRProviderError`,
`OCRExtractionError`) — nenhuma classe de erro nova foi criada. Erros
sem classe conhecida (storage, Prisma, Redis) caem num texto genérico
("Falha técnica durante o processamento OCR."). Detalhe técnico
completo (mensagem + stack) continua só nos logs do Worker.

### 4. Transições de estado — onde cada escrita acontece

```
InvoiceDraftsService.create()  →  ocrStatus: PENDING (default do schema)
        ↓ publica job (attempts: 3, backoff exponencial: 5s antes da tentativa 2, 10s antes da tentativa 3)
OcrProcessingProcessor.process() — cada tentativa:
  1. valida InvoiceDraft (id+organização+storageObjectId) — se não bate, ignora, sem retry (inalterado da Fase 6.4)
  2. valida StorageObject (organização + key) — se não bate, ignora, sem retry (inalterado)
  3. updateMany → ocrStatus: PROCESSING (claim atómico; count===0 → já obsoleto, ignora, sem retry)
  4. storage.get() + ocrService.extract()
       sucesso → updateMany → ocrText, ocrConfidence, ocrStatus: COMPLETED, ocrError: null
                 (count===0 → draft ficou obsoleto a meio do OCR, resultado descartado, sem retry — inalterado)
       falha   → não é a última tentativa → updateMany → ocrStatus: PENDING; throw (BullMQ agenda o retry)
                 é a última tentativa      → updateMany → ocrStatus: FAILED, ocrError: <sanitizado>; throw
```

Todas as escritas usam o mesmo `where` triplo (id + organizationId +
storageObjectId) já estabelecido na Fase 6.4 — nenhuma nova superfície
de corrida foi introduzida ao adicionar mais pontos de escrita.

### 5. Uma falha ao marcar estado nunca mascara o erro técnico original

Se a própria escrita de `PENDING`/`FAILED` no `catch` falhar (ex.
Prisma também em baixo no mesmo instante), essa segunda falha é
apanhada por um `try/catch` interno, registada em log, e **não**
substitui o erro lançado ao BullMQ — a exceção original é sempre a que
é propagada, para que a contagem de tentativas e o log de causa
reflitam a falha real, não uma falha secundária de escrita de estado.

### 6. Sem retry manual, sem loop, sem endpoint

`OcrProcessingProcessor` nunca chama a si próprio, nunca faz
`setTimeout`, nunca reinvoca `ocrService.extract()` dentro da mesma
execução — cada chamada ao handler tenta exatamente uma vez e devolve o
controlo (via `return` ou `throw`) ao BullMQ. Isto está coberto
explicitamente por um teste ("não reimplementa nenhuma lógica de
atraso/loop — falha e devolve o controlo ao BullMQ numa só chamada a
extract()"). Não existe endpoint de retry manual nesta fase — mas o
facto de `ocrStatus: FAILED` (+ `ocrError`) já existir no
`InvoiceDraft`, e de `InvoiceDraftsService.create()` já ter toda a
lógica de publicação de job isolada (`queueProducer.add(...)`), significa
que uma fase futura de recovery manual só precisa de: (a) encontrar
drafts com `ocrStatus IN (PENDING, FAILED)`, (b) reutilizar a mesma
chamada de publicação com um novo `jobId`. Nenhuma peça de
infraestrutura adicional é necessária só para isso.

### 7. Idempotência é dos efeitos persistidos, não da execução do OCR

O que é garantido: reprocessar o mesmo `InvoiceDraft` nunca cria um
`InvoiceDraft`, `Invoice` ou `InvoiceAttachment` novo — o handler só
sabe fazer `updateMany` sobre a linha existente, nunca `create`; os
efeitos persistidos são idempotentes (repetir a escrita produz sempre o
mesmo resultado final, testado explicitamente).

O que **não** é garantido: que a chamada ao provider OCR subjacente
corra exatamente uma vez. Em timeout, `withTimeout()`
(`packages/ocr/src/utils/with-timeout.ts`, desde a Fase 6.2) rejeita a
`Promise` exposta ao chamador mas **não cancela o trabalho
subjacente** — o provider continua a correr em segundo plano. Se o
BullMQ iniciar a tentativa seguinte antes de essa execução abandonada
terminar, há uma janela em que duas extrações OCR do mesmo ficheiro
correm em simultâneo. Isto não compromete a consistência do estado
persistido: só a invocação que está ativamente a aguardar
`ocrService.extract()` chega ao `updateMany` de escrita — a
continuação da execução abandonada, quando eventualmente resolve, não
tem nenhum caminho de código de volta à base de dados (a `Promise` já
assentou por rejeição do timeout; a resolução tardia é descartada).
Por isso o estado persistido do `InvoiceDraft` continua sempre
consistente, mesmo que a execução OCR em si não seja estritamente
exactly-once. Nenhum cancelamento (`AbortController` ou equivalente) é
implementado nesta fase — fica registado como possível otimização
futura, não como bug.

## Contrato de filas atualizado

`packages/queue/src/contracts/queue.ts`:

```ts
export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  delayMs: number;
}
export interface EnqueueOptions {
  jobId?: string;
  delayMs?: number;
  attempts?: number;
  backoff?: BackoffOptions;      // novo
}
export interface JobAttemptInfo {  // novo
  attemptNumber: number;
  maxAttempts: number;
}
export type JobHandler<T> = (payload: T, jobId: string, attempt: JobAttemptInfo) => Promise<void>; // 3º argumento novo
```

Mudança aditiva do lado produtor (`EnqueueOptions.backoff` é opcional);
mudança de assinatura do lado consumidor (`JobHandler`) — único
consumidor real hoje é `OcrProcessingProcessor`, atualizado em
conjunto.

## Isolamento multi-tenant

Inalterado desde a Fase 6.4 — todas as queries (`findFirst`,
`updateMany`) continuam filtradas por `organizationId`, incluindo as
três novas escritas de estado (`PROCESSING`, `PENDING` de retry,
`FAILED`).

## Ficheiros criados

```
docs/phases/phase-6.5-ocr-retry-recovery-foundation.md
```

## Ficheiros alterados

```
packages/queue/src/contracts/queue.ts                              — BackoffOptions, JobAttemptInfo, JobHandler com 3º argumento
packages/queue/src/providers/bullmq/bullmq-queue-producer.ts        — mapeia backoff para o formato nativo do BullMQ
packages/queue/src/providers/bullmq/bullmq-queue-consumer.ts        — deriva JobAttemptInfo de job.attemptsStarted/job.opts.attempts
packages/queue/src/providers/bullmq/bullmq-queue-producer.test.ts   — testes de backoff
packages/queue/src/providers/bullmq/bullmq-queue-consumer.test.ts   — testes de JobAttemptInfo
packages/database/prisma/schema.prisma                              — enum OcrStatus, InvoiceDraft.ocrStatus/ocrError
packages/database/prisma/migrations/20260711081621_add_ocr_status_to_invoice_draft/migration.sql — nova (aditiva)
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.ts    — OCR_JOB_BACKOFF configurado na publicação do job
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.spec.ts — teste de backoff
apps/frontrest/api/test/invoice-drafts.e2e-spec.ts                  — assert de backoff no job publicado
apps/frontrest/workers/src/queues/ocr-processing.processor.ts       — transições de estado, classificação/sanitização de erro, attempt-aware retry
apps/frontrest/workers/src/queues/ocr-processing.processor.spec.ts  — reescrito (22 testes)
apps/frontrest/workers/README.md                                    — ciclo de vida OcrStatus, backoff
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md                 — registo da Fase 6.5
```

Nenhum ficheiro de domínio financeiro (`Invoice`, `InvoiceItem`,
`InvoicesService`), de upload, ou de frontend foi tocado.

## Testes adicionados

Worker (`ocr-processing.processor.spec.ts`, 22 testes no total, 8 novos
na secção "13. Retry & Recovery"):

- Retry automático: falha técnica na tentativa 1/3 marca `PENDING` e
  propaga a exceção.
- Backoff: coberto do lado produtor (`bullmq-queue-producer.test.ts`) —
  o processor não implementa backoff, só reage ao `JobAttemptInfo`
  recebido.
- Limite de tentativas: falha na tentativa 3/3 marca `FAILED`.
- Falha permanente: mensagem sanitizada em `ocrError` (nunca a bruta,
  testado com um erro contendo host/porta/password simulados), log de
  nível `error` com "falha permanente após 3 tentativa(s)".
- Classificação de erro: `OCRTimeoutError`→timeout, `OCRProviderError`→
  falha do motor.
- Idempotência dos efeitos persistidos: reprocessar o mesmo job duas
  vezes só atualiza os mesmos campos; nenhum `create` disponível no
  mock, logo impossível duplicar entidades. Não testa (nem podia, a
  este nível) execução concorrente real do provider OCR — ver secção
  "7. Idempotência é dos efeitos persistidos, não da execução do OCR".
- "Não reimplementa retry": uma só chamada a `extract()` por invocação
  do handler — prova ausência de loop interno, não ausência de
  sobreposição entre invocações separadas (ver secção 7).
- Robustez: falha adicional a marcar estado (Prisma indisponível) não
  mascara o erro original propagado.

Queue (`bullmq-queue-consumer.test.ts`, `bullmq-queue-producer.test.ts`):
tradução de `backoff` para o formato nativo; derivação de
`attemptNumber`/`maxAttempts` a partir de `attemptsStarted`/`opts.attempts`
do `Job`; omissão de `attempts` assume `maxAttempts: 1`.

API (`invoice-drafts.service.spec.ts`): job publicado com
`backoff: { type: 'exponential', delayMs: 5000 }`.

## Validação (comandos)

- `pnpm typecheck` — 23/23
- `pnpm test` — 15/15 tasks (queue 15 testes, API 81, workers 22)
- `pnpm build` — 14/14
- `pnpm --filter @frontrest/api test:e2e` — 64/64

`pnpm lint` não corrido — sem linter real configurado em nenhuma parte
do monorepo (`docs/quality/quality-gates.md`, decisão já documentada,
não é gate ativo).

## Validação real (Docker)

Ver secção correspondente no relatório final da fase (registada
separadamente na entrega ao utilizador) — cobre: fluxo golden path com
persistência de `ocrStatus`/`ocrError` reais; falha técnica simulada
(MinIO parado) provocando `PENDING` seguido de retry automático com
atraso observável (backoff exponencial real medido nos logs);
esgotamento das 3 tentativas provocando `ocrStatus: FAILED` com
`ocrError` sanitizado; confirmação de que `ocrError` nunca contém
detalhe de Redis/Storage.

## Limitações conhecidas

- `OCRUnsupportedFormatError` (formato de ficheiro não suportado) é um
  erro **determinístico** — repetir a tentativa nunca o resolve — mas
  esta fase não distingue "erro determinístico" de "erro transitório"
  no cálculo de retry: ainda esgota as 3 tentativas antes de marcar
  `FAILED`. Como o allowlist de MIME types no upload (Fase 5.2) já
  restringe os ficheiros aceites aos suportados pelo provider Tesseract,
  este caminho não deve ocorrer em operação normal; fica registado como
  otimização possível de uma fase futura (classificar por tipo de erro
  e usar `attempts: 1` ou equivalente para os determinísticos), não
  implementada agora para não introduzir complexidade não pedida.
- Em timeout, o provider OCR abandonado continua a correr em segundo
  plano (`withTimeout()` não cancela) — se o retry seguinte começar
  antes de essa execução terminar, há uma janela real de processamento
  OCR sobreposto para o mesmo ficheiro. O estado persistido do
  `InvoiceDraft` mantém-se sempre consistente (só a invocação ativa
  escreve na base de dados — ver secção 7 de "Decisões arquiteturais"),
  mas a execução em si não é exactly-once; nenhum cancelamento
  (`AbortController` ou equivalente) foi implementado, por não ter sido
  pedido nesta fase e por consumir mais tempo de CPU do provider do que
  causar qualquer inconsistência de dados.
- Sem endpoint de retry manual, sem Dead Letter Queue, sem UI/dashboard
  de observabilidade — todos deliberadamente fora do âmbito.
- Backoff configurado só para a fila `ocr-processing` (única fila real
  hoje) — `OCR_JOB_BACKOFF` vive em `InvoiceDraftsService`, não em
  `@frontcore/queue`, porque é uma decisão de produto/job específica, não
  do package genérico.

## Trabalho futuro

- Endpoint de recovery manual ("Retry OCR") sobre drafts com
  `ocrStatus IN (PENDING, FAILED)` — a infraestrutura de publicação já
  está isolada e pronta para ser reutilizada.
- Dead Letter Queue completa para jobs que esgotam tentativas.
- Observabilidade/dashboard sobre `ocrStatus` agregado.
- Classificação de erro determinístico vs. transitório para evitar
  retries inúteis em `OCRUnsupportedFormatError`.
- Parsing fiscal e extração estruturada de campos (Fase 6.6+).

## Critérios de conclusão

- [x] Retry automático via `attempts`/`backoff` nativos do BullMQ.
- [x] Backoff exponencial configurado (5s antes da tentativa 2, 10s antes da tentativa 3 — só 2 atrasos possíveis com `attempts: 3`).
- [x] Limite máximo de tentativas (3, inalterado da Fase 6.4).
- [x] Estados consistentes (`OcrStatus`: PENDING/PROCESSING/COMPLETED/FAILED).
- [x] Falhas permanentes identificadas (`FAILED` + `ocrError` sanitizado).
- [x] Arquitetura preparada para reprocessamento futuro sem novo upload.
- [x] Logging consistente (início, tentativa atual, retry agendado, conclusão, falha permanente).
- [x] Idempotência dos efeitos persistidos preservada e testada
      explicitamente (execução do provider OCR não é garantida
      exactly-once — ver secção 7 de "Decisões arquiteturais").
- [x] Migration aditiva aplicada e validada.
- [x] Testes completos (retry, backoff, limite, falha permanente, idempotência, cenários negativos).
- [x] Documentação atualizada.
- [x] Validação real em Docker.
- [x] Nenhuma alteração ao domínio financeiro, upload ou frontend.

## Próxima fase

Fase 6.6 (ou seguinte, por decidir) — parsing fiscal e extração
estruturada de campos a partir de `ocrText`, ou recovery manual — ver
"Trabalho futuro".
