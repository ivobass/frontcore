# Arquitetura — FrontCore & FrontRest IA

## Visão

**FrontCore** é a base tecnológica reutilizável da FrontWeb para construir
múltiplos produtos SaaS. É **independente do domínio de negócio**.

**FrontRest IA** é o primeiro produto construído sobre o FrontCore (gestão
financeira e operacional de restaurantes). Produtos futuros (FrontClinic,
FrontHotel, FrontGym, FrontOffice, FrontRetail) reutilizam o FrontCore **sem
alterações**.

## Regra de ouro

- `packages/*` = FrontCore. **Zero lógica de domínio.**
- `apps/frontrest/*` = produto. **Toda** a lógica de restaurantes vive aqui.
- Nenhum package importa nada de `apps/`. Os apps importam packages.

## Packages (FrontCore)

| Package                  | Responsabilidade (genérica)                          | Estado Fase 1 |
|--------------------------|------------------------------------------------------|---------------|
| `@frontcore/config`      | Env helpers, tsconfig base                            | ativo         |
| `@frontcore/shared`      | Tipos/utils genéricos (Result, paginação, health)    | ativo         |
| `@frontcore/database`    | Prisma client + schema core (Org/User/Membership)    | ativo         |
| `@frontcore/auth`        | Contratos de auth (JWT/refresh)                      | contrato      |
| `@frontcore/storage`     | Storage de objetos S3-compatível (MinIO/S3)          | ativo         |
| `@frontcore/queue`       | Filas assíncronas sobre BullMQ/Redis                 | ativo         |
| `@frontcore/ai`          | Contrato de provider de IA                           | contrato      |
| `@frontcore/notifications` | Contrato de notificações                           | contrato      |
| `@frontcore/monitoring`  | Helpers de health/observabilidade                    | ativo         |
| `@frontcore/ui`          | Design system base (tokens + cn)                     | ativo         |

> "contrato" = na Fase 1 expõe apenas tipos/interfaces de fronteira. A
> implementação concreta entra na fase indicada, sem quebrar consumidores.

## Storage de objetos

`@frontcore/storage` passou de contrato vazio (Fase 1) a implementação
real sobre MinIO/S3 (`S3ObjectStorage`, Fase 5.1) e ganhou o primeiro
consumidor real em `apps/frontrest/api` (Fase 5.2):

```
UploadsController → UploadsService → ObjectStorage → S3ObjectStorage
```

Só `apps/frontrest/api/src/uploads/uploads.module.ts` importa
`S3ObjectStorage`/`@frontcore/storage` diretamente — regista-o sob um
token de injeção NestJS (`OBJECT_STORAGE`). `UploadsController` e
`UploadsService` só conhecem o tipo `ObjectStorage`, nunca a
implementação concreta, o que permite substituir o provider (testes, ou
uma implementação alternativa futura) sem tocar em mais nenhum ficheiro.
Ver `docs/phases/phase-5.1-upload-storage-foundation.md` e
`docs/phases/phase-5.2-upload-api-foundation.md`.

## Filas assíncronas

`@frontcore/queue` (Fase 6.1) segue exatamente a mesma forma de
`@frontcore/storage`: contrato genérico (`QueueProducer`/`QueueConsumer`),
configuração (`loadQueueConfig()`), erros normalizados (`QueueError`) e
um provider concreto sobre BullMQ/Redis. Sem lógica de domínio — o nome
da fila e o payload são sempre decisão do consumidor.

```
apps/frontrest/api      → QueueProducer (token) → BullMQQueueProducer
apps/frontrest/workers  → QueueConsumer (token) → BullMQQueueConsumer
```

Só `apps/frontrest/api/src/queue/queue.module.ts` importa
`BullMQQueueProducer` diretamente (token `QUEUE_PRODUCER`), e só
`apps/frontrest/workers/src/queues/ocr-processing.module.ts` importa
`BullMQQueueConsumer` diretamente (token `QUEUE_CONSUMER`) — mesmo
padrão do `OBJECT_STORAGE` em `uploads.module.ts`. Ver
`docs/phases/phase-6.1-ocr-worker-foundation.md`.

**Exceção documentada** (Fase 6.4): o contrato da única fila real hoje
(`OcrProcessingJob`/`OCR_PROCESSING_QUEUE`, em
`packages/queue/src/jobs/`) inclui `invoiceDraftId`, um conceito de
domínio FrontRest — normalmente proibido dentro de `packages/*`. Vive
ali porque é o único ponto que `apps/frontrest/api` (produtor) e
`apps/frontrest/workers` (consumidor) já partilham sem duplicar a
interface nem criar uma dependência direta entre as duas apps.
Justificação completa em
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.

## Base de dados partilhada entre apps NestJS

`PrismaModule`/`PrismaService` vivem em `@frontcore/database`
(`src/nestjs/`), não em cada app individualmente — mesmo padrão já usado
por `@frontcore/auth` (`src/nestjs/`, guards e decorators). Qualquer app
NestJS do monorepo (`apps/frontrest/api`, `apps/frontrest/workers`, e
futuras) importa `PrismaModule` de `@frontcore/database`, nunca duplica
o ficheiro. `@nestjs/common`/`@nestjs/core` são `peerDependencies` de
`@frontcore/database` — o package continua utilizável sem NestJS (o
singleton `prisma` exportado do barrel raiz, reservado a scripts fora de
qualquer container Nest, ex. seeds).

## Staging de documentos vs. domínio financeiro

`InvoiceDraft` (Fase 6.3) é uma entidade separada de `Invoice`, não um
estado (`status = DRAFT`) do mesmo modelo. `Invoice` continua a
representar sempre um documento financeiro válido e completo
(`supplierId`/`issueDate`/`totalAmount` obrigatórios, sem alteração);
`InvoiceDraft` referencia `StorageObject`/`Supplier`/`ExpenseCategory`
de forma unidirecional, com todos os campos de domínio opcionais,
mesmo padrão já usado por `InvoiceAttachment` (Fase 5.3) — uma entidade
nova referencia as existentes, nunca o contrário. Promoção explícita
(`InvoiceDraftsService.promote()`, transação Prisma única) cria a
`Invoice` + `InvoiceAttachment` reais e só depois elimina o draft. Ver
`docs/phases/phase-6.3-invoice-draft-foundation.md` para a comparação
arquitetural completa entre as duas abordagens.

Desde a Fase 6.4, a criação de um `InvoiceDraft` publica automaticamente
um job na fila `ocr-processing`; o Worker OCR lê o `StorageObject`
associado e persiste texto bruto (`ocrText`) e confiança
(`ocrConfidence`) de volta no mesmo `InvoiceDraft` — sem parsing fiscal,
sem extração de campos estruturados (fornecedor, datas, totais
continuam a ser preenchidos manualmente). Ver
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.

## Apps (FrontRest)

| App                    | Stack       | Porta | Estado Fase 1            |
|------------------------|-------------|-------|--------------------------|
| `@frontrest/api`       | NestJS      | 3001  | health + prisma          |
| `@frontrest/web`       | Next.js 15  | 3000  | página de estado         |
| `@frontrest/workers`   | NestJS std. | —     | foundation (Fase 6.1)    |

## Multi-tenancy

Row-level por `organizationId` (shared schema). Os modelos core
(`Organization`, `User`, `Membership`) vivem no FrontCore. Modelos de domínio
do produto referenciam `organizationId`. O isolamento por guard/middleware
central entra na Fase 2.

## Fluxo de dados (Fase 1)

```
web (Next.js) ──HTTP /api──> api (NestJS) ──Prisma──> PostgreSQL
                                  │
                                  └── (Redis / MinIO disponíveis, uso real Fases 5/6)
```
