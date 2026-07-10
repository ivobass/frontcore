# Phase 6.4 — OCR Draft Integration Foundation

## Objetivo

Ligar os componentes já existentes das Fases 6.1–6.3 numa fundação de
integração real e testada: `API → Queue → Worker → InvoiceDraft`. Ao
criar um `InvoiceDraft`, a API publica automaticamente um job OCR; o
Worker consome-o, valida o draft e o `StorageObject` de forma
independente do que o job afirma, executa `OCRService.extract()` e
persiste `ocrText`/`ocrConfidence` no `InvoiceDraft`.

## Âmbito

Só liga componentes já existentes. Sem parsing fiscal, sem
reconhecimento automático de fornecedores/NIF/datas/totais/IVA, sem
extração de linhas de fatura, sem `InvoiceItem` automático, sem IA
generativa, sem frontend, sem estados complexos de OCR, sem
transactional outbox, sem `DocumentDraft` genérico, sem reversão de
promoção, sem alteração ao contrato ou nullability de `Invoice`.

## Estado anterior

- `InvoiceDraft` existia como entidade separada de `Invoice`
  (`docs/phases/phase-6.3-invoice-draft-foundation.md`), com `ocrText`/
  `ocrConfidence` já no schema mas nunca escritos.
- A API criava/atualizava/eliminava/promovia drafts, sem nunca publicar
  um job de processamento.
- O Worker (`OcrProcessingProcessor`) recebia `{ storageObjectId,
  organizationId }`, lia o ficheiro, corria `OCRService.extract()`, e só
  registava o resultado via `Logger` — sem persistência, sem
  conhecimento de `InvoiceDraft`.
- O contrato `OcrProcessingJob`/`OCR_PROCESSING_QUEUE` estava definido
  dentro de `apps/frontrest/workers/src/queues/ocr-processing.processor.ts`
  — só o Worker o via; a API não tinha como reutilizá-lo sem duplicar a
  interface.
- `apps/frontrest/api` não tinha `@frontcore/queue` como dependência,
  nem nenhum `QueueProducer` configurado.

## Decisões arquiteturais

### Contrato do job partilhado em `@frontcore/queue`, não num novo package

`OcrProcessingJob`/`OCR_PROCESSING_QUEUE` passam a viver em
`packages/queue/src/jobs/ocr-processing.job.ts`, exportados pelo barrel
público do package. **Exceção arquitetural deliberada e registada**:
`invoiceDraftId` é um conceito de domínio FrontRest — o exemplo
"errado" citado em `docs/CODING_STANDARDS.md` para lógica que não
pertence a `packages/*` é exatamente deste tipo (`restaurantInvoice`).
Ainda assim, esta é a opção que menos viola a arquitetura das
disponíveis:

- Duplicar a interface entre API e Worker foi explicitamente rejeitado
  pelo pedido desta fase ("Não duplicar interfaces").
- Um app não pode importar de outro app (nenhuma app importa outra no
  FrontCore) — pôr o contrato em `apps/frontrest/workers` e a API
  importá-lo criaria exatamente a dependência entre aplicações que o
  pedido desta fase pede para evitar.
- Não existe hoje nenhum package de "contratos partilhados do produto"
  entre `apps/frontrest/*` — criar um novo package só para esta
  interface seria uma abstração nova, desproporcional a um único
  contrato (contraria Execution Mode: não introduzir estrutura nova sem
  necessidade imediata de 2-3 fases).
- `packages/database` já tem um precedente parecido — a secção
  FRONTREST do `schema.prisma` vive lá por ser o único ponto onde o
  Prisma Client é gerado, não porque o package deixou de ser genérico.
  O mesmo raciocínio aplica-se aqui: `@frontcore/queue` já é o único
  ponto que API e Worker partilham para filas.

Não generalizar mais: se surgir um segundo contrato de job com a mesma
necessidade, revisitar esta decisão (candidato natural: um package de
contratos partilhados do produto, não do FrontCore).

### `QueueProducer` na API segue exatamente o padrão de `ObjectStorage`

Novo `apps/frontrest/api/src/queue/` (`queue-producer.token.ts` +
`queue.module.ts`), mesmo padrão de `uploads/object-storage.token.ts` +
`uploads/uploads.module.ts`: só `queue.module.ts` importa
`BullMQQueueProducer` diretamente; `InvoiceDraftsService` só conhece o
tipo `QueueProducer`, injetado via `QUEUE_PRODUCER`. `QueueModule` é
importado por `InvoicesModule` (não é global), mesma decisão de
`UploadsModule` — âmbito de utilização confinado a quem precisa.

`loadQueueConfig()` reutilizado sem alteração — lê `REDIS_URL`, já
provisionado no serviço `api` do `docker-compose.yml` (adicionado antes
desta fase, nunca usado até agora).

### Shutdown do `QueueProducer`

`QueueModule` implementa `OnModuleDestroy` e chama `producer.close()`.
`apps/frontrest/api/src/main.ts` passou a chamar
`app.enableShutdownHooks()` — sem isto, o NestJS só invoca
`onModuleDestroy()` num `app.close()` explícito (como os testes e2e já
fazem), nunca num `SIGTERM`/`SIGINT` real em produção/Docker. Alteração
mínima e diretamente exigida por este requisito, não um refactor
oportunista.

### Publicação do job depois da criação do draft, nunca antes

`InvoiceDraftsService.create()` só chama `queueProducer.add()` depois de
`prisma.invoiceDraft.create()` ter sucesso — usa o `draft.id` devolvido
pela própria criação para construir o payload e o `jobId`, o que torna
estruturalmente impossível publicar um job para um draft que não chegou
a existir.

### Consistência PostgreSQL/Redis — sem transaction distribuída, sem outbox

Não existe transação distribuída entre Prisma/PostgreSQL e Redis, e esta
fase **não implementa transactional outbox** (fora do âmbito,
explicitamente). Comportamento adotado, explícito:

1. Validar referências (`StorageObject`, `Supplier`, `ExpenseCategory`).
2. Criar o `InvoiceDraft`.
3. Tentar publicar o job.
4. Se a publicação falhar: registar o erro via `Logger.error` (com
   stack trace, só nos logs do servidor); propagar
   `ServiceUnavailableException` (503) ao cliente, com mensagem genérica
   ("não foi possível agendar o processamento OCR") — nunca a mensagem
   original do `QueueError`/Redis; **o `InvoiceDraft` criado não é
   apagado**.

Não apagar o draft nesta falha é uma decisão deliberada: uma
"compensação" automática (apagar o draft porque o job falhou) seria
enganadora — o draft em si é um recurso válido e persistido; só falta o
processamento OCR. Apagar avisaria mal o utilizador (o registo que ele
via na resposta desaparecia silenciosamente) e destruiria trabalho já
válido por uma falha de infraestrutura que pode ser transitória. O risco
aceite explicitamente: **pode existir um `InvoiceDraft` sem job
publicado** — sem retry automático de publicação nesta fase (ver
"Limitações conhecidas").

**Nuance descoberta na validação real (importante): nem toda falha de
Redis produz o 503 acima.** O 503 documentado só é devolvido quando
`queueProducer.add()` rejeita de forma **síncrona e imediata** (ex.:
`Custom Id cannot contain :`, ou o Redis responder ativamente com um
erro). Quando o Redis está genuinamente **inalcançável** (host down,
DNS não resolve — `ENOTFOUND`/`ECONNREFUSED`), o comportamento é
diferente: a ligação usa `maxRetriesPerRequest: null`
(`buildRedisConnection`, `packages/queue`) — necessário para os
comandos bloqueantes do `Worker` (Fase 6.1) — e esse mesmo ajuste
também se aplica à ligação do `Queue` do lado do produtor, porque
`buildRedisConnection()` é partilhada. Nesse cenário, o `ioredis`
**tenta reconectar indefinidamente** em vez de desistir — o pedido
`POST /invoices/drafts` fica pendente (não devolve 503 nem nenhuma
resposta) até o Redis voltar a ficar acessível, altura em que o job
publica com sucesso e o pedido HTTP original completa normalmente
(`201`), mesmo que o cliente já tenha desistido por timeout próprio.
Confirmado experimentalmente: `docker compose stop redis`, `POST
/invoices/drafts` fica sem resposta (o `curl` expira por timeout do
próprio cliente, não por um erro devolvido pela API); `docker compose
start redis` — minutos depois, o job publica e o Worker processa-o
normalmente, sem intervenção manual. Nenhuma perda de dados, nenhuma
duplicação — mas a garantia de "erro controlado (503)" desta secção só
se aplica a falhas que o Redis reporta ativamente, não a uma
indisponibilidade total da ligação. Registado como limitação real (ver
"Limitações conhecidas"), não corrigido nesta fase — mudar
`maxRetriesPerRequest` só do lado do produtor exigiria uma configuração
de ligação Redis distinta da do consumidor, uma decisão arquitetural
própria, fora do âmbito de "apenas ligar componentes existentes".

### `jobId` determinístico e idempotente

`invoice-draft-ocr-${draft.id}` — nunca baseado em timestamp. Separador
`-`, nunca `:`: a primeira versão usava `:` e falhava sempre em
runtime real (`Error: Custom Id cannot contain :`) — o BullMQ rejeita
`:` num custom id porque o usa como separador interno de namespace nas
chaves Redis (`bull:<queue>:<jobId>`). Só detetado na validação real
com Docker desta fase (ver "Validação real"), porque a suite
automatizada mocka `QueueProducer.add()` por inteiro e nunca exercita a
validação real do BullMQ — lição registada em "Limitações conhecidas".

Como `draft.id` só existe depois de `prisma.invoiceDraft.create()` ter
sucesso, e cada chamada a `create()` gera um `cuid()` novo, não há forma
de duas chamadas legítimas a `create()` colidirem no mesmo `jobId`. A
determinização protege contra o cenário defensivo pedido nesta fase (um
mesmo draft nunca gera dois jobs BullMQ), não contra um cenário que já
não seria possível de outra forma.

### Worker: dupla validação, nunca confiar só no `id` do job

Antes de qualquer OCR, `OcrProcessingProcessor` confirma que existe um
`InvoiceDraft` que corresponde **simultaneamente** a `id` +
`organizationId` + `storageObjectId` do payload (uma única query
`findFirst`, as três condições no mesmo `where`) — cobre em simultâneo
"draft inexistente", "draft de outra organização" e "`invoiceDraftId`
não corresponde ao `storageObjectId`" com o mesmo comportamento
observável (log de aviso, job termina sem erro, sem retry). O
`StorageObject` é revalidado da mesma forma (existe, mesma organização,
`key` não nula) — nunca reaproveita a validação já feita pela API no
momento da criação do draft.

### Corrida durante a extração OCR

Entre o início do OCR (que pode demorar segundos) e o fim, o draft pode
ter sido eliminado ou promovido pela API. Por isso, a escrita do
resultado usa `updateMany()` com a mesma condição tripla (`id` +
`organizationId` + `storageObjectId`) em vez de `update()` — se
`updated.count === 0`, o resultado é descartado (log de aviso, sem
retry), nunca recria o draft nem escreve fosse onde fosse.

### Idempotência

Reprocessar o mesmo job (ex. redelivery do BullMQ) é seguro por
construção: o handler só sabe fazer duas coisas — ler e sobrescrever
`ocrText`/`ocrConfidence` de uma linha `InvoiceDraft` já existente
(`updateMany`, nunca `create`). Não existe nenhum caminho de código no
Worker que crie `InvoiceDraft`, `InvoiceAttachment` ou `Invoice`, nem
que promova um draft — essas operações continuam exclusivas de
`InvoiceDraftsService`. Repetir o processamento no máximo substitui o
resultado OCR pelo mesmo (ou mais recente) valor.

### Erros técnicos continuam a propagar para retry

Falhas de `ObjectStorage.get()`, `OCRService.extract()` ou
`prisma.invoiceDraft.updateMany()` **não são capturadas** — propagam
para o BullMQ, que aciona `attempts`/retry, exatamente como já
acontecia na Fase 6.1/6.2 para os erros de infraestrutura. Só os três
casos de "referência já não existe" (draft, storage, corrida no fim do
OCR) terminam o job com sucesso e sem retry — porque reprocessar não
resolveria nada nesses casos.

## Contrato partilhado do job

```ts
// packages/queue/src/jobs/ocr-processing.job.ts
export const OCR_PROCESSING_QUEUE = 'ocr-processing';

export interface OcrProcessingJob {
  invoiceDraftId: string;
  storageObjectId: string;
  organizationId: string;
}
```

Importado exatamente do mesmo sítio (`@frontcore/queue`) por
`apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.ts`
(produtor) e `apps/frontrest/workers/src/queues/ocr-processing.processor.ts`
(consumidor).

## Fluxo `API → Queue → Worker → InvoiceDraft`

```text
POST /invoices/drafts
        │
        ▼
InvoiceDraft criado
        │
        ▼
QueueProducer.add()
        │
        ▼
Redis / BullMQ
        │
        ▼
OcrProcessingProcessor
        │
        ├── valida InvoiceDraft (id + organizationId + storageObjectId)
        ├── valida StorageObject (existe, mesma organização, key)
        ├── ObjectStorage.get()
        ├── OCRService.extract()
        │
        ▼
InvoiceDraft.ocrText
InvoiceDraft.ocrConfidence
```

## Responsabilidade da API

`InvoiceDraftsService.create()` — cria o draft, publica o job com
`jobId` determinístico e `attempts: 3`; se a publicação falhar, propaga
503 sem expor detalhes de Redis, sem apagar o draft. Nenhuma outra
operação do `InvoiceDraftsService` (`update`/`remove`/`promote`) publica
jobs — só a criação.

## Responsabilidade do Worker

`OcrProcessingProcessor` — nunca cria, elimina ou promove um
`InvoiceDraft`; nunca cria ou altera uma `Invoice`/`InvoiceAttachment`;
só lê `InvoiceDraft`/`StorageObject` e escreve exclusivamente
`ocrText`/`ocrConfidence` numa linha `InvoiceDraft` já existente.

## Isolamento multi-tenant

A condição tripla (`id` + `organizationId` + `storageObjectId`) no
Worker impede que um job processado com uma organização incorreta (por
bug num futuro produtor, ou payload corrompido) leia ou escreva dados de
outra organização — mesmo que o `invoiceDraftId` por si só fosse válido
para outra organização, a query só devolve resultado se as três
condições baterem certo. Validado por teste unitário dedicado (payload
com organização errada) e por teste e2e de isolamento herdado da Fase
6.3.

## Ficheiros criados

```
packages/queue/src/jobs/{ocr-processing.job.ts,index.ts}

apps/frontrest/api/src/queue/{queue-producer.token.ts,queue.module.ts}
apps/frontrest/api/test/utils/mock-queue-producer.ts

docs/phases/phase-6.4-ocr-draft-integration-foundation.md
```

## Ficheiros alterados

```
packages/queue/src/index.ts                                          — + export * from './jobs'
packages/database/prisma/schema.prisma                                 — comentário de InvoiceDraft atualizado (Worker lê/escreve desde 6.4)

apps/frontrest/api/package.json                                        — + @frontcore/queue
apps/frontrest/api/src/main.ts                                         — + app.enableShutdownHooks()
apps/frontrest/api/src/invoices/invoices.module.ts                     — + QueueModule
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.ts       — create() publica job OCR
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.spec.ts   — + testes de publicação do job
apps/frontrest/api/test/invoice-drafts.e2e-spec.ts                     — + testes de publicação/falha do job
apps/frontrest/api/test/utils/bootstrap-app.ts                          — + override de QUEUE_PRODUCER

apps/frontrest/workers/src/queues/ocr-processing.processor.ts           — fluxo real: valida InvoiceDraft+StorageObject, persiste resultado
apps/frontrest/workers/src/queues/ocr-processing.processor.spec.ts      — reescrito para o novo fluxo (12 testes)
apps/frontrest/workers/README.md                                        — estado real pós-fase

docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md, README.md
```

`Invoice`/`InvoicesService`/`InvoicesController`/DTOs,
`InvoiceAttachment*`, `apps/frontrest/web`, contrato/nullability de
`Invoice`, relações/constraints/índices/`InvoiceStatus` do schema
**inalterados**. Sem migration nova — só o comentário do modelo mudou.

## Testes adicionados

- **API, unitários** (`invoice-drafts.service.spec.ts`, +14 testes):
  criação publica job; payload correto; fila correta; `jobId`
  determinístico; `attempts: 3`; ordem (job só depois do draft existir);
  falha na criação → job não publicado; falha na publicação → erro
  propagado, draft não apagado, mensagem sem detalhes internos;
  isolamento do payload por organização.
- **API, e2e** (`invoice-drafts.e2e-spec.ts`, +2 testes): criação real
  (via HTTP) publica o job correto através do `QueueProducer` mockado;
  falha na publicação devolve 503 sem expor detalhes de Redis.
- **Worker, unitários** (`ocr-processing.processor.spec.ts`, reescrito,
  12 testes): fluxo completo válido; organização errada; `invoiceDraftId`
  não corresponde a `storageObjectId`; draft inexistente; corrida
  (`updateMany().count === 0`); `StorageObject` inexistente/sem `key`;
  erro de storage/OCR/Prisma propagados; reprocessamento idempotente.

Sem dependência de Redis/MinIO real em nenhum teste automatizado —
mesma disciplina já usada desde a Fase 4.4.

## Validação real

Executada com Docker (`postgres`, `redis`, `minio`, `api`, `workers`
reais), incluindo dois ciclos completos — o primeiro revelou um bug
real (ver abaixo), corrigido, e a validação foi repetida do zero:

1. Upload real de uma imagem com texto → `StorageObject` real.
2. `POST /invoices/drafts` com esse `storageObjectId` → `InvoiceDraft`
   criado, job publicado com sucesso na fila `ocr-processing`
   (BullMQ/Redis reais) — `201`.
3. `frontcore-workers` processa o job — confirmado por log
   (`OcrProcessingProcessor`, texto e confiança reais do Tesseract).
4. `GET /invoices/drafts/:id` — `ocrText`/`ocrConfidence` deixaram de
   ser `null` (texto extraído coincide exatamente com o da imagem).
5. Confirmado diretamente em PostgreSQL (`psql`).
6. Repetido com uma segunda organização real — `GET` cruzado devolve
   `404`; job da segunda organização processado corretamente, sem fuga
   de dados.
7. Draft eliminado **antes** do processamento (Worker parado
   deliberadamente para criar a janela, depois reiniciado) — Worker
   ignora o job com `warn`, sem erro, sem retry — confirmado nos logs.
8. Draft promovido **antes** do processamento (mesma técnica) — Worker
   ignora o job da mesma forma; `Invoice` promovida confirmada
   inalterada (`updatedAt` igual a `createdAt`).
9. Redis parado (`docker compose stop redis`) durante a criação de um
   draft — **achado real, corrige a expectativa documentada
   inicialmente**: o pedido não devolve `503`; fica pendente até o
   Redis voltar, porque a ligação usa `maxRetriesPerRequest: null`
   (necessário para o `Worker`) e por isso tenta reconectar
   indefinitamente em vez de desistir. Draft fica criado (confirmado);
   ao reiniciar o Redis, o job publica-se sozinho e o Worker
   processa-o com sucesso, sem intervenção manual. Ver nuance completa
   em "Consistência PostgreSQL/Redis".
10. **Bug real encontrado e corrigido nesta validação**: a primeira
    versão do `jobId` (`invoice-draft-ocr:${draft.id}`, com `:`) fazia
    `queueProducer.add()` falhar sempre em runtime real
    (`Error: Custom Id cannot contain :`, validação interna do BullMQ)
    — nunca detetado pela suite automatizada porque esta mocka
    `QueueProducer.add()` por inteiro. Corrigido para `-`
    (`invoice-draft-ocr-${draft.id}`); todos os pontos 1–9 acima foram
    validados **depois** da correção, contra uma imagem Docker
    reconstruída.

## Limitações conhecidas

- **Sem retry automático de publicação** — se `queueProducer.add()`
  falhar, o `InvoiceDraft` fica sem job associado; não existe hoje
  nenhum endpoint para "reagendar" OCR para um draft já criado. Fica
  para trabalho futuro (ver abaixo).
- **Indisponibilidade total do Redis não devolve 503 — fica pendente
  até o Redis recuperar.** `maxRetriesPerRequest: null` (necessário
  para o `Worker`) faz o `ioredis` tentar reconectar indefinidamente em
  vez de desistir; um `POST /invoices/drafts` feito enquanto o Redis
  está inalcançável não recebe resposta da API até o Redis voltar
  (confirmado experimentalmente, ver "Validação real"). O `503`
  documentado em "Consistência PostgreSQL/Redis" só cobre falhas que o
  Redis/BullMQ reportam ativamente (ex. rejeição de comando), não uma
  ligação totalmente inalcançável. Corrigir isto exigiria uma
  configuração de ligação Redis distinta para o produtor (ex.
  `maxRetriesPerRequest` limitado, só do lado da API) — decisão
  arquitetural própria, fora do âmbito desta fase.
- **Sem transactional outbox** — decisão deliberada desta fase (ver
  "Consistência PostgreSQL/Redis"); a janela de inconsistência entre
  criar o draft e publicar o job é aceite e documentada, não escondida.
- **`OcrProcessingJob` vive em `@frontcore/queue`, com um campo de
  domínio FrontRest** — exceção arquitetural deliberada e registada
  (ver "Decisões arquiteturais"); não generalizar mais sem um segundo
  caso de uso real.
- **Continua sem parsing fiscal** — `ocrText` é texto bruto;
  `supplierId`/`issueDate`/`totalAmount` continuam a ser preenchidos
  manualmente via `PATCH /invoices/drafts/:id`.
- **Lição registada**: a suite automatizada (unitários + e2e) mocka
  `QueueProducer.add()` por inteiro, por isso nunca teria detetado o
  `jobId` com `:` rejeitado pelo BullMQ real (ver "`jobId` determinístico
  e idempotente") — só a validação real com Docker o revelou. Reforça
  por que a validação real desta fase não é opcional/decorativa; ficou
  um teste unitário de regressão (`jobId` nunca contém `:`), mas ele só
  protege contra reintroduzir o mesmo erro, não substitui testar contra
  o BullMQ real.

## Trabalho futuro

Endpoint para reagendar/republicar o job OCR de um draft existente cuja
publicação falhou; ligação com timeout limitado para o `QueueProducer`
da API (dissociada da ligação do `Worker`, que precisa de
`maxRetriesPerRequest: null`), para que uma indisponibilidade total do
Redis devolva um `503` em segundos em vez de bloquear o pedido até o
Redis recuperar; parsing fiscal e extração estruturada de campos a
partir de `ocrText`; UI de rascunhos; eventual generalização do
contrato de job partilhado, só com um segundo caso de uso real.

## Critérios de conclusão

- [x] Contrato OCR partilhado entre API e Worker (`@frontcore/queue`).
- [x] Nome da fila centralizado (`OCR_PROCESSING_QUEUE`).
- [x] API possui `QueueProducer` (token + módulo, mesmo padrão de `ObjectStorage`).
- [x] Criação de draft publica job OCR.
- [x] Job possui `invoiceDraftId`.
- [x] `jobId` determinístico.
- [x] Worker valida draft, organização e storage (query tripla).
- [x] Worker persiste `ocrText`.
- [x] Worker persiste `ocrConfidence`.
- [x] Corrida com draft eliminado/promovido tratada (`updateMany().count === 0`).
- [x] Draft promovido não é recriado nem alterado.
- [x] Falhas técnicas continuam a provocar retry (não capturadas).
- [x] Processamento idempotente (reprocessar só sobrescreve os mesmos campos).
- [x] Isolamento multi-tenant validado (unitário + e2e + real).
- [x] Nenhum parsing fiscal implementado.
- [x] Nenhuma alteração desnecessária ao Prisma (só comentário).
- [x] Testes unitários completos (API + Worker).
- [x] Testes e2e adequados (publicação do job via produtor mockado).
- [x] Validação real concluída.
- [x] Documentação da fase criada.
- [x] Documentação global atualizada.
- [x] typecheck limpo, testes limpos, build limpo, zero regressões.
- [x] Git limpo — aguarda commit/tag/push pelo utilizador (não
      executado nesta fase, por instrução explícita).

## Próxima fase

Candidatos naturais: endpoint de reagendamento de OCR; parsing fiscal
sobre `ocrText` (extração de `supplierId`/`issueDate`/`totalAmount`
sugeridos); UI de rascunhos.
