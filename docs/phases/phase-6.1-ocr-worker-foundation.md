# Phase 6.1 — OCR Worker Foundation

## Objetivo

Criar a infraestrutura técnica base para os workers OCR do FrontRest —
preparar a arquitetura para que motores de OCR reais possam ser
adicionados em fases seguintes sem refactors estruturais. **Não**
implementa OCR, nenhum provider de extração de dados, nem qualquer
lógica de IA — apenas a foundation: `apps/frontrest/workers` passa a
app NestJS standalone real, com uma fila (`ocr-processing`) e um
consumidor mock, validados ponta a ponta contra Redis real.

## Estado inicial

`apps/frontrest/workers` existia desde a Fase 1 só como reserva
(`README.md` + `.gitkeep`, sem `package.json`, fora do workspace pnpm de
facto). Nenhum código do monorepo usava `bullmq`/`ioredis`; o Redis já
corria em Docker (`frontcore-redis`, saudável) mas sem nenhum consumidor
de aplicação. `PrismaModule`/`PrismaService` existiam só dentro de
`apps/frontrest/api`, sem forma de reutilização por uma segunda app
NestJS. `Invoice.status` não tinha (e continua sem ter) um estado
`DRAFT` — não é necessário nesta fase, o consumidor mock não escreve em
`Invoice`.

## Revisão arquitetural prévia

Antes de qualquer implementação, foi feita uma revisão dedicada
("congelar a arquitetura da Fase 6") sobre quatro pontos, com decisão
explícita em cada um:

1. **`packages/queue` como package independente** — aprovado. Mesma
   justificação que validou `packages/storage` na Fase 5.1 (contrato
   genérico, zero domínio, reutilizável por qualquer produto FrontCore),
   reforçada por já nascer com consumidor real garantido
   (`apps/frontrest/workers`), ao contrário do storage que nasceu sem
   nenhum.
2. **`PrismaModule`/`PrismaService` movidos para `packages/database`** —
   aprovado, replicando um padrão já existente e validado em
   `packages/auth/src/nestjs/` (peer dependencies de `@nestjs/common`/
   `@nestjs/core`, barrel único no `index.ts` raiz do package, sem
   subpath separado). Motivo: evitar duplicar, entre `api` e `workers`,
   um ficheiro idêntico — a mesma duplicação que `packages/auth` já
   tinha resolvido para guards/decorators.
3. **Logger partilhado (`packages/monitoring/logger/`) — adiado**. O
   `Logger` nativo do NestJS já resolve o problema imediato
   ("só existe `console.log`") sem nenhuma dependência nova; não existe
   ainda requisito operacional concreto (plataforma de agregação de
   logs escolhida, necessidade de correlação entre processos) a moldar
   a interface de um logger próprio. Gatilho para reabrir: escolha real
   de plataforma de observabilidade, ou necessidade concreta de
   correlacionar logs entre `api` e `workers`.
4. **Convenção de configuração `load<X>Config()`** — formalizada por
   escrito em `docs/CODING_STANDARDS.md`, sem construir nenhuma
   abstração nova. O padrão já existia, repetido de forma consistente
   (`loadTokenConfig()` em `@frontcore/auth`, `loadStorageConfig()` em
   `@frontcore/storage`) sem nenhuma máquina partilhada a impor isso —
   só faltava registá-lo.

## Decisões arquiteturais

- **`apps/frontrest/workers`, não `apps/ocr-worker`** — o slot já estava
  reservado desde a Fase 1 (`docs/ARCHITECTURE.md`, tabela de apps, e o
  próprio README da pasta), seguindo a convenção `@frontrest/api`/
  `@frontrest/web`. Criar uma app de topo nova teria duplicado uma
  estrutura já decidida.
- **`packages/queue` não conhece OCR nem `Invoice`** — o contrato
  (`QueueProducer`/`QueueConsumer`/`JobHandler<T>`) é genérico: nome da
  fila e forma do payload são sempre decisão do consumidor
  (`apps/frontrest/workers`). Estrutura idêntica a `packages/storage`:
  `contracts/` → `config/` → `providers/bullmq/` → `errors/`.
- **Produtor e consumidor como interfaces separadas** (`QueueProducer`/
  `QueueConsumer`), não uma única interface tipo `ObjectStorage` —
  reflete a própria API do BullMQ, que separa `Queue` (produtor) de
  `Worker` (consumidor) com necessidades de ligação distintas; evita
  forçar um app só-consumidor a depender de métodos de produção que
  nunca usa.
- **`ioredis` fixado exatamente na versão que o `bullmq` já usa
  internamente** (`5.10.1`, não a mais recente `^5.11.1`) — descoberto
  ao typecheckar: duas versões distintas de `ioredis` no grafo de
  dependências produzem dois tipos `Redis` estruturalmente
  incompatíveis (erro TS2322), porque o `bullmq` importa a sua própria
  cópia. Fixar a mesma versão deixa o pnpm deduplicar para uma única
  instância.
- **Erros do `handler` em `BullMQQueueConsumer.consume()` não são
  capturados** — propagam para o BullMQ de propósito, para acionar
  `attempts`/retries e marcar o job como falhado; só erros da própria
  infraestrutura de fila (ex. `add()` não conseguir alcançar o Redis)
  são normalizados em `QueueError`, mesma filosofia de `StorageError`.
- **`PrismaModule`/`PrismaService` em `packages/database/src/nestjs/`**,
  replicando 1:1 o padrão de `packages/auth/src/nestjs/`:
  `@nestjs/common`/`@nestjs/core` como `peerDependencies` (não
  dependencies diretas) — o package continua utilizável sem NestJS; o
  singleton `prisma` já exportado no barrel raiz mantém-se, reservado a
  scripts puros fora de qualquer container Nest (ex. seeds), e o
  comentário no ficheiro foi atualizado para deixar claro que workers
  standalone via `createApplicationContext` **usam** DI real e por
  isso usam `PrismaService`, não o singleton.
- **`apps/frontrest/api` migrado para o `PrismaModule` partilhado** —
  ficheiros locais (`apps/frontrest/api/src/prisma/`) removidos por
  completo; todos os consumidores (`suppliers`, `expense-categories`,
  `invoices`, `invoice-attachments`, `uploads`, `auth`, `health`, mais
  o bootstrap de testes e2e) atualizados para importar `PrismaService`
  de `@frontcore/database`. Validado sem nenhuma regressão (45 testes
  unitários + 47 e2e continuam a passar).
- **`apps/frontrest/workers` nasce já a usar o módulo partilhado** —
  nunca duplicou o ficheiro, ao contrário do que aconteceria se a
  ordem de implementação fosse invertida.
- **Consumidor mock, não um endpoint novo na API** — a fila é validada
  isoladamente (worker arranca, liga a Redis/Postgres reais, um job
  publicado externamente é recebido e logado). `apps/frontrest/api` não
  foi tocado além da migração do `PrismaModule` já aprovada — nenhum
  produtor foi acrescentado lá, para não misturar esta fase com a
  integração real (fases futuras).
- **Sem healthcheck Docker para `workers` nesta fase** — o processo é
  standalone, sem HTTP (por decisão já tomada desde a Fase 1, mantida).
  Só `restart: unless-stopped`. Revisitar quando existir uma razão
  operacional concreta (ex. métricas reais a expor).
- **`docker-compose.yml`: `workers` liga só a `postgres` e `redis`** —
  sem variáveis de storage (S3/MinIO). O consumidor mock não lê nenhum
  `StorageObject`; adicionar essa configuração agora seria antecipar a
  fase seguinte sem um consumidor real a usá-la.

## Estrutura criada

```
packages/queue/
  src/
    contracts/queue.ts          — QueueConfig, QueueProducer, QueueConsumer, JobHandler<T>
    config/queue-config.ts       — loadQueueConfig()
    providers/bullmq/
      build-redis-connection.ts    — ligação ioredis partilhada (maxRetriesPerRequest: null)
      bullmq-queue-producer.ts      — BullMQQueueProducer
      bullmq-queue-consumer.ts       — BullMQQueueConsumer
    errors/queue-error.ts        — QueueError

packages/database/src/nestjs/
  prisma.module.ts               — @Global(), mesmo padrão de packages/auth/src/nestjs/
  prisma.service.ts

apps/frontrest/workers/
  src/
    main.ts                      — NestFactory.createApplicationContext, enableShutdownHooks()
    app.module.ts                 — ConfigModule + PrismaModule + OcrProcessingModule
    queues/
      queue-consumer.token.ts       — token de injeção (mesmo padrão de OBJECT_STORAGE)
      ocr-processing.module.ts       — regista BullMQQueueConsumer sob o token
      ocr-processing.processor.ts     — consumidor mock, sem OCR real

docker/workers.Dockerfile        — mesmo padrão multi-stage de docker/api.Dockerfile
```

## Fluxo de processamento (foundation, sem motor real)

```
(produtor externo — hoje só em teste/validação manual, nenhum endpoint da API produz ainda)
  ↓ QueueProducer.add('ocr-processing', { storageObjectId, organizationId })
  ↓ (BullMQ persiste o job em Redis)
apps/frontrest/workers (processo separado, liga à mesma fila)
  ↓ OcrProcessingProcessor.consume()
  ↓ [mock: regista via Logger que recebeu o job — nenhuma leitura de StorageObject,
     nenhum motor OCR, nenhuma escrita em Invoice]
```

## Ficheiros criados

```
packages/queue/package.json
packages/queue/tsconfig.json
packages/queue/tsconfig.build.json
packages/queue/vitest.config.ts
packages/queue/src/index.ts
packages/queue/src/contracts/{queue.ts,index.ts}
packages/queue/src/config/{queue-config.ts,queue-config.test.ts,index.ts}
packages/queue/src/errors/{queue-error.ts,index.ts}
packages/queue/src/providers/{index.ts}
packages/queue/src/providers/bullmq/{build-redis-connection.ts,bullmq-queue-producer.ts,bullmq-queue-producer.test.ts,bullmq-queue-consumer.ts,bullmq-queue-consumer.test.ts,index.ts}

packages/database/src/nestjs/{prisma.module.ts,prisma.service.ts,index.ts}

apps/frontrest/workers/package.json
apps/frontrest/workers/nest-cli.json
apps/frontrest/workers/tsconfig.json
apps/frontrest/workers/tsconfig.build.json
apps/frontrest/workers/src/main.ts
apps/frontrest/workers/src/app.module.ts
apps/frontrest/workers/src/queues/{queue-consumer.token.ts,ocr-processing.module.ts,ocr-processing.processor.ts,ocr-processing.processor.spec.ts}

docker/workers.Dockerfile
docs/phases/phase-6.1-ocr-worker-foundation.md
```

## Ficheiros alterados

```
packages/database/package.json     — + peerDependencies/devDependencies @nestjs/common,@nestjs/core; + reflect-metadata
packages/database/src/index.ts     — + export * from './nestjs'; comentário da convenção de uso atualizado
docs/ARCHITECTURE.md               — + @frontcore/queue; secção "Filas assíncronas"; secção "Base de dados partilhada"; estado de @frontrest/workers
docs/CODING_STANDARDS.md            — + secção "Configuração" (convenção load<X>Config())
docs/PHASES.md                       — Fase 6 atualizada com a Fase 6.1
docs/INDEX.md                         — nova linha na tabela "Fases"
docker-compose.yml                     — + serviço workers
apps/frontrest/workers/README.md        — reescrito para o estado real pós-fase

apps/frontrest/api/src/app.module.ts                                  — PrismaModule de @frontcore/database
apps/frontrest/api/src/auth/auth.service.ts                            — PrismaService de @frontcore/database
apps/frontrest/api/src/health/health.controller.ts                      — PrismaService de @frontcore/database
apps/frontrest/api/src/suppliers/suppliers.service.ts                    — PrismaService de @frontcore/database
apps/frontrest/api/src/expense-categories/expense-categories.service.ts   — PrismaService de @frontcore/database
apps/frontrest/api/src/invoices/invoices.service.ts                        — PrismaService de @frontcore/database
apps/frontrest/api/src/invoices/attachments/invoice-attachments.service.ts  — PrismaService de @frontcore/database
apps/frontrest/api/src/uploads/uploads.service.ts                            — PrismaService de @frontcore/database
apps/frontrest/api/test/utils/bootstrap-app.ts                                — PrismaService de @frontcore/database
```

## Ficheiros removidos

```
apps/frontrest/api/src/prisma/prisma.module.ts
apps/frontrest/api/src/prisma/prisma.service.ts
```

`apps/frontrest/web` **inalterado**. Nenhuma migration Prisma criada —
o schema não foi tocado (nenhum modelo de job, nenhum estado `DRAFT`
em `Invoice`).

## Validações e testes

**Automatizadas**:
- `pnpm --filter @frontcore/queue typecheck`/`test` — limpo, 10 testes
  (config: fallback/obrigatoriedade de `REDIS_URL`; producer: enfileira
  e devolve id, reutiliza a mesma fila BullMQ entre chamadas, mapeia
  falhas para `QueueError`, fecha filas e liga; consumer: regista
  `Worker` para a fila certa, invoca o handler com payload/jobId
  corretos, propaga erros do handler sem os capturar, fecha workers e
  liga).
- `pnpm --filter @frontcore/database build`/`typecheck` — limpo com o
  novo `nestjs/`.
- `pnpm --filter @frontrest/api typecheck`/`test`/`test:e2e` — limpo;
  **45 testes unitários + 47 e2e continuam a passar**, sem nenhuma
  regressão introduzida pela migração do `PrismaModule`.
- `pnpm --filter @frontrest/workers typecheck`/`build`/`test` — limpo;
  2 testes unitários do `OcrProcessingProcessor` (regista o consumidor
  na fila certa; o handler registado processa um job mock sem lançar),
  mockando `QueueConsumer` diretamente (sem Redis real), mesmo padrão
  de `uploads.service.spec.ts` mockar `ObjectStorage`.

**Manual, real, contra Postgres/Redis já em execução** (fora de
Docker, ligando às portas já publicadas no host):
- `node dist/main.js` do worker arranca, liga a Postgres (`PrismaModule`)
  e a Redis (`OcrProcessingModule`), sem erros — log confirma
  `AppModule`/`PrismaModule`/`OcrProcessingModule` inicializados.
- Um job real publicado via `BullMQQueueProducer.add('ocr-processing', {...})`
  (script isolado, fora do worker) foi **recebido e processado pelo
  worker em execução** — log confirma `Job 1 recebido — StorageObject
  obj-smoke-test (organização org-smoke-test)`. Prova o pipeline de
  filas ponta a ponta contra infraestrutura real, não só mocks.

## Limitações conhecidas

- **Sem produtor real** — nenhum endpoint de `apps/frontrest/api`
  publica jobs na fila `ocr-processing` ainda; a única forma de
  enfileirar hoje é diretamente via `@frontcore/queue`, como feito na
  validação manual. Ligar isto ao fluxo de upload/fatura fica para
  quando existir um motor OCR real.
- **Sem modelo de job em Prisma** — o estado de um job vive só em
  Redis (via BullMQ), sem registo de auditoria em base de dados.
  Decisão deliberada (ver "Revisão arquitetural prévia") — reconsiderar
  se surgir necessidade real de histórico além do que o Redis guarda.
- **Sem healthcheck Docker para `workers`** — decisão deliberada,
  registada acima.
- **`Invoice.status` sem estado `DRAFT`** — não bloqueia esta fase (o
  consumidor mock não escreve em `Invoice`), mas será necessário
  quando existir um motor OCR real a criar faturas automaticamente.

## Trabalho fora do âmbito (fases futuras)

Motor OCR real (Tesseract, PaddleOCR, Google Vision, Azure Vision, AWS
Textract, OpenAI Vision, OCRmyPDF, ou qualquer outro), reconhecimento
de tabelas, classificação documental, parsing avançado de PDF, IA para
documentos, contrato de provider OCR em `@frontcore/ai`, logger
partilhado, modelo de job em Prisma, integração com o fluxo de
upload/fatura da API, estado `DRAFT` em `Invoice`, healthcheck Docker
para `workers`, métricas/observabilidade.

## Resultado final

`apps/frontrest/workers` deixou de ser uma pasta reservada e passou a
ser uma app NestJS standalone real, com uma fila registada e um
consumidor validado contra Redis real. `PrismaModule` deixou de estar
duplicado — `api` e `workers` partilham a mesma implementação via
`@frontcore/database`. `@frontcore/queue` é genérico, zero domínio,
pronto para ser reutilizado por qualquer futuro produtor/consumidor de
filas do FrontCore, não só OCR. Nenhuma linha de código relacionada com
OCR real foi escrita.

## Critérios de conclusão

- [x] `apps/frontrest/workers` é uma app NestJS standalone real (sem HTTP).
- [x] `packages/queue` criado, genérico, sem lógica de domínio/OCR.
- [x] `PrismaModule`/`PrismaService` partilhados via `@frontcore/database`;
      `apps/frontrest/api` migrado sem regressões.
- [x] Fila `ocr-processing` com consumidor mock, validada contra Redis real.
- [x] Nenhum motor OCR, provider ou lógica de IA implementados.
- [x] `docker/workers.Dockerfile` + serviço `workers` em `docker-compose.yml`.
- [x] `pnpm typecheck`/`build`/`test` limpos (raiz e por package).
- [x] Documentação criada/atualizada (`CODING_STANDARDS.md`,
      `ARCHITECTURE.md`, `PHASES.md`, `INDEX.md`, este documento,
      `apps/frontrest/workers/README.md`).
- [x] Git limpo — aguarda commit/tag/push pelo utilizador (não
      executado nesta fase, por instrução explícita).

## Próxima fase

Candidatos naturais: motor OCR real (mock → provider), contrato de
provider em `@frontcore/ai`, estado `DRAFT` em `Invoice` (migration),
produtor real a partir do fluxo de upload/fatura da API.
