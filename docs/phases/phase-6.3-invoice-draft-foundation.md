# Phase 6.3 — Invoice Draft Foundation

## Objetivo

Criar a fundação backend/database para faturas em rascunho originadas por
upload/OCR — representar documentos ainda incompletos, guardar texto
bruto e metadados básicos de OCR, permitir completar/corrigir dados
manualmente por API, e promover explicitamente um rascunho a `Invoice`
real. Sem alteração de comportamento ao CRUD atual de `Invoice`, sem
parsing fiscal avançado, sem IA, sem o Worker OCR a criar ou atualizar
rascunhos automaticamente.

## Estado inicial

`Invoice` (Fase 4) exige `supplierId` (FK `onDelete: Restrict`,
verificado contra a organização em `InvoicesService.create()`) e
`issueDate`, ambos `NOT NULL`, sem valor por omissão. Um documento
vindo de upload/OCR (Fase 5/6.1/6.2), sem parsing de campos ainda
implementado, não tem nenhum dos dois no momento em que é carregado.
`InvoiceAttachment` (Fase 5.3) já liga `Invoice` a `StorageObject`, mas
pressupõe uma `Invoice` já existente. O Worker OCR (Fase 6.2) processa
`StorageObject`s e regista o resultado só via `Logger` — sem
persistência durável, sem qualquer conhecimento de `Invoice`.

## Revisão arquitetural prévia

Antes desta implementação, foi feita uma comparação arquitetural
dedicada entre duas opções: `InvoiceDraft` como entidade separada de
`Invoice`, versus reaproveitar `Invoice` com um novo estado
`status = DRAFT`. Decisão aprovada: **entidade separada**. Justificação
completa abaixo, em "Decisão: `InvoiceDraft` separado".

## Decisão: `InvoiceDraft` separado

- **`Invoice` deve continuar a representar sempre um documento
  financeiro válido e completo.** Introduzir `DRAFT` no
  `InvoiceStatus` exigiria tornar `supplierId`/`issueDate`
  opcionais no schema — mudança estrutural a um modelo já em produção,
  testado (45 unitários + 47 e2e antes desta fase) e consumido pelo
  frontend (Fase 4.2). Propagaria `Supplier | null`/`Date | null` para
  todo o tipo `InvoiceWithRelations`, usado hoje sem verificação de
  nulidade em `invoices.service.ts`, nos testes e implicitamente no
  contrato já consumido pelo frontend.
- **Zero alteração ao contrato público de `Invoice`.** `supplierId`,
  `issueDate` e `totalAmount` continuam `NOT NULL`; `InvoiceStatus`
  continua sem `DRAFT`; `InvoicesController`/`InvoicesService`/DTOs
  inalterados; os 45+47 testes anteriores a esta fase continuam válidos
  sem qualquer ajuste.
- **Dashboards e relatórios futuros (Fase 7/9) nunca precisam de excluir
  rascunhos** — `Invoice` nunca contém uma linha incompleta; não existe
  risco de um relatório esquecer um filtro `WHERE status != 'DRAFT'` e
  contaminar totais financeiros com rascunhos.
- **OCR e futuros processos de IA ficam isolados do modelo financeiro
  final** — um produtor futuro (Worker, ou outro) escreve sempre em
  `InvoiceDraft`, nunca em `Invoice`; nenhum processo automático pode,
  por construção, alterar uma fatura já confirmada/paga.
- **Sem `DocumentDraft` genérico nesta fase** — `InvoiceDraft` é
  deliberadamente específico do domínio `Invoice`. Só existe um tipo de
  documento real no FrontRest hoje; generalizar agora seria desenhar
  sobre requisitos hipotéticos de tipos de documento que ainda não
  existem (receipts, credit notes, ...). Ver nota dedicada mais abaixo.
- **Segue o padrão já aprovado com `StorageObject` + `InvoiceAttachment`
  (Fase 5.3)**: uma entidade nova referencia as existentes de forma
  unidirecional, sem alterar nenhuma delas.
- **A promoção é irreversível** (ver "Regras de domínio", ponto 13) —
  consequência direta de `InvoiceDraft`/`Invoice` serem entidades
  separadas com ciclos de vida distintos, não dois estados do mesmo
  registo: promover não é uma transição de estado reversível, é a
  entidade de staging a dar lugar à entidade final.

> **`InvoiceDraft` é deliberadamente específico do domínio `Invoice`.
> Não foi criado um `DocumentDraft` genérico por ainda não existir um
> segundo tipo de documento real no FrontRest. Quando forem introduzidos
> pelo menos dois tipos distintos de documento, esta decisão deverá ser
> reavaliada para determinar se faz sentido generalizar o modelo de
> staging.**

## Fluxo conceptual

```
StorageObject
    ↓
InvoiceDraft   (campos opcionais, completados manualmente por API)
    ↓ promoção explícita, de sentido único (POST /invoices/drafts/:id/promote)
Invoice + InvoiceAttachment   (mesma transação; draft eliminado só depois)
```

A seta de promoção não tem retorno — ver "Regras de domínio", ponto 13.

## Modelo e relações

```prisma
model InvoiceDraft {
  id              String    @id @default(cuid())
  organizationId  String
  storageObjectId String    @unique
  supplierId      String?
  categoryId      String?
  number          String?
  issueDate       DateTime?
  dueDate         DateTime?
  totalAmount     Decimal?  @db.Decimal(12, 2)
  notes           String?
  ocrText         String?
  ocrConfidence   Float?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  organization  Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  storageObject StorageObject    @relation(fields: [storageObjectId], references: [id], onDelete: Restrict)
  supplier      Supplier?        @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  category      ExpenseCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([supplierId])
  @@index([categoryId])
}
```

Relações inversas aditivas em `Organization.invoiceDrafts`,
`StorageObject.draft`, `Supplier.invoiceDrafts`,
`ExpenseCategory.invoiceDrafts`. Sem `InvoiceDraftItem` — extração de
linhas é parsing fiscal avançado, fora do âmbito; a promoção cria a
`Invoice` sem `items` (ver "Regras de domínio", abaixo).

`InvoiceDraft` não tem enum de estado próprio — a existência da linha
já representa o estado de rascunho; a promoção elimina-a.

## Regras de domínio implementadas

1. `organizationId` sempre obrigatório, presente em toda a query.
2. `storageObjectId` obrigatório e `@unique` — um `StorageObject` só
   pode originar um `InvoiceDraft`.
3. Criação rejeitada (`InvoiceDraftsService.assertStorageObjectAvailable`)
   se o `StorageObject`: não existir; pertencer a outra organização;
   não tiver `key` válida (mesmo filtro `key: { not: null }` já usado em
   `UploadsService`) — as três condições resolvidas pela mesma query
   Prisma (`NotFoundException` em qualquer caso); já estiver associado a
   outro `InvoiceDraft` (`ConflictException`); já estiver associado a um
   `InvoiceAttachment` (`ConflictException`).
4. `supplierId`/`categoryId`, quando fornecidos, validados contra a
   organização (`NotFoundException` caso contrário) — mesmo padrão já
   usado em `InvoicesService`.
5. Sem enum de estado — confirmado acima.
6. Promoção sempre explícita — `POST /invoices/drafts/:id/promote`,
   nunca automática.
7. Promoção falha com `BadRequestException` (lista os campos em falta)
   se `supplierId`, `issueDate` ou `totalAmount` estiverem por
   preencher no draft. `totalAmount` tem de estar preenchido no draft —
   sem `InvoiceDraftItem` nesta fase não há como o calcular, e não se
   usa `0` como fallback silencioso.
8. Promoção cria a `Invoice` com `organizationId`, `supplierId`,
   `categoryId`, `number`, `issueDate`, `dueDate`, `totalAmount`,
   `status: 'PENDING'`, `notes`, sem `items`. **Decisão sobre `items`**:
   uma `Invoice` sem `InvoiceItem` é válida ao nível do schema (relação
   para-muitos, sem constraint de mínimo, `onDelete: Cascade` a partir
   de `InvoiceItem`); a obrigatoriedade de `items` em `CreateInvoiceDto`
   é validação do endpoint `POST /invoices`, não usada aqui — a
   promoção cria a `Invoice` diretamente via `prisma.invoice.create()`,
   nunca via `InvoicesService.create()`/o DTO.
9. Promoção cria também um `InvoiceAttachment` para o mesmo
   `storageObjectId` do draft.
10. `InvoiceDraft` só é eliminado depois de `Invoice` e
    `InvoiceAttachment` serem criados com sucesso — garantido pela
    ordem das operações dentro da transação (ver ponto seguinte).
11. Toda a promoção ocorre numa única `prisma.$transaction()` — se
    qualquer passo falhar (ex. `InvoiceAttachment.create()`), a
    transação inteira reverte: a `Invoice` criada não persiste, e o
    `InvoiceDraft` não é eliminado. Validado por teste unitário
    dedicado (nº 20).
12. `ocrText`/`ocrConfidence` só existem em `InvoiceDraft` — nunca
    persistidos em `Invoice`. `InvoiceDraft` é a área de staging.
13. **A promoção de `InvoiceDraft` para `Invoice` é irreversível.**
    Depois de promovido, o `InvoiceDraft` é eliminado e o ciclo de vida
    passa a ser exclusivamente o da `Invoice`. Alterações posteriores
    devem ocorrer através do CRUD normal de `Invoice`
    (`PATCH /invoices/:id`), nunca recriando o `InvoiceDraft` original.

## Decisão de implementação: validação do `StorageObject` direta via Prisma

`InvoiceDraftsService` valida a posse/disponibilidade do `StorageObject`
com uma query Prisma direta
(`prisma.storageObject.findFirst({ id, organizationId, key: { not: null } })`),
**não** através de `UploadsService.findOne()`. Razão: `findOne()` gera
sempre um URL assinado (`storage.getDownloadUrl()`) como efeito
colateral — desnecessário para uma simples validação de existência, e
obrigaria a mockar `ObjectStorage` em todos os testes de
`InvoiceDraftsService` sem relação real com o que está a ser testado.
Este é, de resto, o mesmo padrão já usado por `InvoicesService` para
validar `Supplier`/`ExpenseCategory` — query Prisma direta, sem passar
pelo serviço de domínio correspondente.

## Endpoints implementados

| Endpoint | Role | Descrição |
|---|---|---|
| `POST /invoices/drafts` | `MANAGER+` | cria a partir de um `storageObjectId` existente |
| `GET /invoices/drafts` | autenticado | lista paginada da organização, filtro opcional `supplierId` |
| `GET /invoices/drafts/:id` | autenticado | detalhe |
| `PATCH /invoices/drafts/:id` | `MANAGER+` | completa/corrige campos; `storageObjectId` imutável (ausente do DTO — `forbidNonWhitelisted` devolve 400 se enviado) |
| `DELETE /invoices/drafts/:id` | `MANAGER+` | descarta o rascunho |
| `POST /invoices/drafts/:id/promote` | `MANAGER+` | promoção transacional a `Invoice` + `InvoiceAttachment` |

Sem filtros de data — considerados e descartados por não terem, nesta
fase, um consumidor real a justificá-los (evitar filtros hipotéticos).

### Ordem de registo do controller — colisão de rotas evitada

`InvoiceDraftsController` (`invoices/drafts`) é registado **antes** de
`InvoicesController` (`invoices/:id`) em `invoices.module.ts`. O Express
(usado por baixo do NestJS) resolve rotas sobrepostas pela ordem de
registo, não pela especificidade — sem esta ordem, `GET /invoices/drafts`
seria capturado por `GET /invoices/:id` (com `id = "drafts"`),
resultando num `404` incorreto em vez da listagem de rascunhos.
Confirmado por teste e2e dedicado.

## Segurança multi-tenant

Todas as queries filtram por `{ id, organizationId }` (`findOne`,
`update`, `remove`) ou incluem `organizationId` no `where` (`findAll`).
A promoção revalida `supplierId`/`categoryId` contra a organização no
momento da promoção (podem ter deixado de pertencer à organização entre
a criação do draft e a promoção). `assertStorageObjectAvailable` filtra
o `StorageObject` por `organizationId` antes de o aceitar.

## Ficheiros criados

```
apps/frontrest/api/src/invoices/drafts/
  dto/{create-invoice-draft.dto.ts,update-invoice-draft.dto.ts,list-invoice-drafts.dto.ts}
  invoice-drafts.service.ts
  invoice-drafts.service.spec.ts
  invoice-drafts.controller.ts

apps/frontrest/api/test/invoice-drafts.e2e-spec.ts

packages/database/prisma/migrations/20260710111626_add_invoice_draft/

docs/phases/phase-6.3-invoice-draft-foundation.md
```

## Ficheiros alterados

```
packages/database/prisma/schema.prisma            — + model InvoiceDraft; relações inversas em Organization/StorageObject/Supplier/ExpenseCategory
apps/frontrest/api/src/invoices/invoices.module.ts  — regista InvoiceDraftsController/Service (ordem: draft controller primeiro)
apps/frontrest/api/test/utils/mock-prisma.ts         — + invoiceDraft (aditivo), + $transaction (executa o callback com o próprio mock)
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`Invoice`/`InvoicesService`/`InvoicesController`/DTOs existentes,
`InvoiceAttachment`/`InvoiceAttachmentsService`/`Controller`,
`apps/frontrest/web`, `apps/frontrest/workers`, `@frontcore/ocr`,
`@frontcore/queue` **inalterados**.

## Migration

`20260710111626_add_invoice_draft` — puramente aditiva: uma tabela nova
(`InvoiceDraft`), 4 índices, 4 FKs. Nenhum `ALTER` sobre colunas
existentes, nenhum risco sobre dados atuais.

## Validações e testes

- `pnpm --filter @frontcore/database typecheck`/`build` — limpo, client
  Prisma regenerado com `InvoiceDraft`.
- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm --filter @frontrest/api test` — limpo, **69 testes unitários**
  (45 existentes + 24 novos de `InvoiceDraftsService`): criação válida,
  rejeição de `StorageObject` inexistente/de outra organização/sem
  `key`/já associado a `InvoiceDraft`/já associado a
  `InvoiceAttachment`, validação de `Supplier`/`ExpenseCategory`,
  listagem/`findOne`/`update`/`remove` respeitam `organizationId`,
  promoção rejeita campos em falta, revalida `Supplier`/`Category`, cria
  `Invoice` + `InvoiceAttachment`, elimina o draft, usa uma transação, e
  reverte por completo se `InvoiceAttachment.create()` falhar.
- `pnpm --filter @frontrest/api test:e2e` — limpo, **62 testes e2e** (47
  existentes + 15 novos): autenticação, roles (`MEMBER` só consulta,
  `MANAGER+` escreve/promove), rota estática `/invoices/drafts` não
  colide com `/invoices/:id`, CRUD completo, `storageObjectId` imutável,
  isolamento entre organizações, promoção incompleta → 400, promoção
  bem-sucedida → 201 com a `Invoice` criada e `InvoiceAttachment`
  associado.
- `pnpm typecheck`/`build`/`test` (raiz) — **23/23**, **14/14** e
  **15/15** tarefas, respetivamente, sem regressões em nenhum
  package/app do monorepo (incluindo `@frontrest/workers`, intocado).

## Validação real

Migration aplicada localmente contra PostgreSQL real
(`prisma migrate dev`), client Prisma regenerado. Imagem Docker de
`api` reconstruída (`docker compose build api`) e reiniciada
(`docker compose up -d api`), `GET /api/health` confirmado.

Fluxo real executado através da API em execução (Docker), com uma
organização registada de propósito para esta validação:

1. `POST /auth/register` — organização e utilizador reais.
2. `POST /suppliers` — fornecedor real.
3. `POST /uploads` (multipart) — upload real de um ficheiro, `StorageObject`
   real criado no Postgres.
4. `POST /invoices/drafts` com o `storageObjectId` real → `201`, draft
   criado com todos os campos opcionais a `null`.
5. `POST /invoices/drafts/:id/promote` **antes** de completar os campos
   → `400`, mensagem lista exatamente `supplierId, issueDate,
   totalAmount`.
6. `POST /invoices/drafts` de novo com o **mesmo** `storageObjectId` →
   `409` ("Este objeto já está associado a um rascunho de fatura.") —
   confirma a regra de domínio 3 contra a BD real, não só o mock.
7. `PATCH /invoices/drafts/:id` com `supplierId`/`issueDate`/
   `totalAmount`/`number` → `200`, draft atualizado.
8. `GET /invoices/drafts` → lista com o draft, confirma que a rota
   estática não colide com `GET /invoices/:id` em execução real (não só
   em teste supertest).
9. `POST /invoices/drafts/:id/promote` → **201**, devolve a `Invoice`
   criada (`status: "PENDING"`, `items: []`).
10. `GET /invoices/drafts/:id` → **404** (draft eliminado).
11. `GET /invoices/:id` (a `Invoice` promovida) → `200`, dados coincidem
    com os do draft.
12. `GET /invoices/:id/attachments` → `InvoiceAttachment` real, mesmo
    `invoiceId`/`storageObjectId`.
13. `GET /uploads/:storageObjectId` → `200`, o `StorageObject` original
    manteve-se intacto (não eliminado nem alterado pela promoção).
14. Confirmado diretamente via `psql` contra o Postgres real:
    `SELECT count(*) FROM "InvoiceDraft"` → `0`; a `Invoice` promovida
    existe com `status = PENDING` e `totalAmount = 123.45`; o
    `InvoiceAttachment` liga-a ao `storageObjectId` original.
15. **Isolamento multi-tenant real**: uma segunda organização registada
    (`POST /auth/register`) tentou criar um draft com o
    `storageObjectId` da primeira organização → `404`; tentou ler a
    `Invoice` promovida da primeira organização → `404`; `GET
    /invoices/drafts` da segunda organização → lista vazia.

Todos os resultados coincidiram exatamente com o comportamento validado
pelos testes automatizados (unitários + e2e) — a suite mockada e a
infraestrutura real concordam.

## Limitações conhecidas

- **Worker não cria nem atualiza `InvoiceDraft`** — decisão explícita
  desta fase (ver Objetivo). `ocrText`/`ocrConfidence` existem no
  schema, prontos a receber dados, mas nada os escreve ainda.
- **Sem produtor real** — herdado das Fases 6.1/6.2, continua sem
  resolver: nenhum endpoint da API cria automaticamente um
  `InvoiceDraft` a partir de um upload, nem publica jobs
  `ocr-processing` ligados a um draft.
- **Sem parsing fiscal** — `supplierId`/`issueDate`/`totalAmount` têm de
  ser preenchidos manualmente via `PATCH` nesta fase.
- **`InvoiceDraft` órfão em caso de eliminação de `StorageObject`** — a
  FK usa `onDelete: Restrict`, mesmo padrão de `InvoiceAttachment`: um
  `StorageObject` associado a um `InvoiceDraft` não pode ser eliminado
  diretamente via `DELETE /uploads/:id` (already-established behaviour,
  não uma lacuna nova desta fase).
- **Sem reversão da promoção** — comportamento esperado, não uma
  lacuna: não existe (nem está prevista) uma operação para recriar um
  `InvoiceDraft` a partir de uma `Invoice` já promovida. Ver "Regras de
  domínio", ponto 13.

## Trabalho fora do âmbito (fases futuras)

Produtor real de jobs OCR ligado ao fluxo de upload; ligação
Upload/`InvoiceDraft` → fila `ocr-processing`; persistência automática
do resultado OCR no draft (Worker a escrever `ocrText`/`ocrConfidence`);
parsing fiscal avançado; extração automática de `supplier`/`issueDate`/
`totalAmount`/linhas de item; UI de rascunhos; fluxo de aprovação
humana; eventual `DocumentDraft` genérico — só quando existir um segundo
tipo de documento real (`receipts`, `credit notes`, ...) a justificar a
generalização.

## Resultado final

`InvoiceDraft` existe como área de staging genuína entre `StorageObject`
e `Invoice`, sem qualquer alteração ao contrato, à nullability ou ao
comportamento do modelo `Invoice` existente. A promoção é transacional e
atómica — nunca deixa uma `Invoice` parcial nem um `InvoiceDraft`
"fantasma". Zero regressão nos 45+47 testes anteriores a esta fase.

## Critérios de conclusão

- [x] `InvoiceDraft` criado como entidade separada, não `Invoice.status = DRAFT`.
- [x] Migration aditiva aplicada contra PostgreSQL real.
- [x] CRUD completo (`create`/`findAll`/`findOne`/`update`/`remove`).
- [x] Promoção transacional (`Invoice` + `InvoiceAttachment`, draft eliminado só depois).
- [x] Isolamento multi-tenant validado (unitário + e2e).
- [x] `storageObjectId` imutável depois da criação.
- [x] Sem alteração ao contrato/nullability de `Invoice`.
- [x] Sem `DRAFT` em `InvoiceStatus`.
- [x] Sem `DocumentDraft` genérico.
- [x] Worker OCR não tocado.
- [x] Frontend não tocado.
- [x] `pnpm typecheck`/`build`/`test` limpos (raiz e por package), sem regressões.
- [x] Validação real contra PostgreSQL/API em execução.
- [x] Documentação criada/atualizada.
- [x] Git limpo — aguarda commit/tag/push pelo utilizador (não
      executado nesta fase, por instrução explícita).

## Próxima fase

Candidatos naturais: produtor real de jobs OCR a partir do fluxo de
upload (criação automática de `InvoiceDraft` + publicação na fila
`ocr-processing`); Worker a escrever `ocrText`/`ocrConfidence` no draft;
parsing fiscal para pré-preencher `supplierId`/`issueDate`/
`totalAmount`; UI de rascunhos.
