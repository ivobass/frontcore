# Phase 5.3 — Invoice Attachments

## Objetivo

Primeiro consumidor de domínio da Upload API (Fase 5.2): anexar,
listar, descarregar e remover documentos numa fatura, reutilizando
`UploadsService` integralmente — `@frontcore/storage` e o módulo
`uploads/` continuam completamente genéricos, sem qualquer conhecimento
de `Invoice`.

## Estado inicial

A Fase 5.2 tinha a Upload API implementada mas validada só com Prisma e
`ObjectStorage` mockados — a migration de `StorageObject` nunca tinha
sido aplicada. Antes de construir Invoice Attachments sobre essa base,
esta fase fechou primeiro essa dívida: migration `add_storage_object`
criada e aplicada, e o fluxo completo (`POST`/`GET`/`DELETE /uploads`)
validado ponta a ponta contra PostgreSQL e MinIO reais — upload de PDF
real, objeto confirmado no MinIO, linha confirmada no Postgres, download
do URL assinado com conteúdo íntegro, isolamento por organização
confirmado (404 sem efeitos colaterais). Ver nota de encerramento em
`docs/phases/phase-5.2-upload-api-foundation.md`. Só depois disso
começou a implementação de Invoice Attachments em si, com a sua própria
migration — as duas migrations desta fase ficam deliberadamente
separadas (decisão explícita do Product Owner: uma migration por fase).

## Decisões arquiteturais

- **`StorageObject` continua sem qualquer campo de domínio.** A relação
  vive num modelo novo, `InvoiceAttachment`, do lado do Invoice — nunca
  um `invoiceId` em `StorageObject`. Reforça a decisão já tomada na Fase
  5.2: módulos consumidores referenciam `StorageObject.id`, nunca o
  contrário.
- **`InvoiceAttachment.storageObjectId` é `@unique`** — um objeto só
  pode estar anexado a uma fatura de cada vez.
- **`onDelete: Restrict` na FK para `StorageObject`** — impede que
  `DELETE /uploads/:id` (endpoint genérico) apague silenciosamente um
  objeto ainda anexado a uma fatura. Validado manualmente: a tentativa
  devolve 409, e o objeto permanece intacto no MinIO e no Postgres (ver
  "Validações").
- **`UploadsService.remove()` corrigido durante a implementação**: a
  ordem original apagava o objeto em storage antes de tentar apagar a
  linha na BD — se a BD rejeitasse por FK Restrict, o ficheiro já tinha
  desaparecido do MinIO, deixando uma linha órfã. Corrigido para apagar
  a linha na BD primeiro (falha aqui, antes de tocar em storage) e só
  depois eliminar o objeto — nenhum caminho deixa MinIO e Postgres
  inconsistentes entre si.
- **`UploadsModule` passa a exportar `UploadsService`** — antes só
  injetável dentro do próprio módulo; alteração mínima e necessária para
  `InvoicesModule` o poder reutilizar via DI, sem tocar em
  `UploadsController`. Revisão arquitetural confirmada e aprovada antes
  do fecho da fase:
  - `UploadsService` é a API pública interna para consumidores de
    domínio — a única forma suportada de aceder a upload/download/remoção
    de ficheiros a partir de outro módulo.
  - `OBJECT_STORAGE` (o token de injeção) e `S3ObjectStorage` continuam
    encapsulados dentro de `uploads/`: `UploadsModule.exports` só lista
    `UploadsService`, nunca `OBJECT_STORAGE`, pelo que nenhum módulo
    externo consegue injetar o storage diretamente, mesmo que importe
    `UploadsModule`.
  - Futuros consumidores (Reports, Avatars, Contracts, ...) devem
    depender de `UploadsService` via `imports: [UploadsModule]` no seu
    próprio módulo — nunca de `S3ObjectStorage` nem de `OBJECT_STORAGE`
    diretamente.
  - Confirmado por inspeção do código que não existe import de
    `invoices/` dentro de `uploads/` — a dependência é estritamente
    unidirecional (`invoices/ → uploads/`), sem ciclo. O NestJS resolve
    `UploadsModule` como singleton independentemente de quantos módulos o
    importam (`AppModule` e `InvoicesModule`, neste caso), sem instâncias
    duplicadas nem acoplamento adicional.
- **`InvoiceAttachmentsService` reutiliza dois serviços existentes por
  composição**, sem duplicar lógica:
  - `InvoicesService.findOne()` — confirma que a fatura pertence à
    organização (evita reimplementar o mesmo `assertInvoiceBelongsToOrg`
    que já existe implicitamente ali).
  - `UploadsService.create()`/`findOne()`/`remove()` — todo o trabalho
    de storage (put, URL assinado, delete) fica exatamente onde já
    estava.
- **Novo controller/serviço vivem em `invoices/attachments/`** (subpasta
  de `invoices/`), não como métodos adicionados a `InvoicesController`/
  `InvoicesService` — esses dois ficheiros ficam completamente
  intocados.
- **Resposta de `GET .../attachments/:id` usa o `id` do anexo, não do
  `StorageObject`** — `uploadsService.findOne()` devolve o objeto com
  `id` = id do storage; a resposta final sobrescreve `id` para o do
  `InvoiceAttachment` e expõe `storageObjectId` à parte, para o corpo da
  resposta corresponder ao parâmetro `:id` do URL.
- **Listagem (`GET .../attachments`) não gera `downloadUrl`** — só
  metadados (via `include` do Prisma), para não gerar N URLs assinados
  desnecessários numa listagem. `downloadUrl` só é gerado no `GET`
  singular, que reutiliza `uploadsService.findOne()` por inteiro.

## Estrutura criada

```
apps/frontrest/api/src/invoices/attachments/
  invoice-attachments.controller.ts   — POST/GET/GET :id/DELETE :id
  invoice-attachments.service.ts      — orquestra InvoicesService + UploadsService
  invoice-attachments.service.spec.ts — testes unitários
```

## Fluxo completo

```
POST /invoices/:invoiceId/attachments (multipart, campo "file")
  ↓ invoicesService.findOne(organizationId, invoiceId)   — 404 se não pertencer à org
  ↓ uploadsService.create(organizationId, ficheiro)       — upload real (Fase 5.2, inalterado)
  ↓ prisma.invoiceAttachment.create({ invoiceId, storageObjectId })
  ↓ 201, devolve o InvoiceAttachment com o StorageObject aninhado

DELETE /invoices/:invoiceId/attachments/:id
  ↓ confirma que o anexo pertence à fatura/organização
  ↓ prisma.invoiceAttachment.delete()                     — remove a ligação primeiro
  ↓ uploadsService.remove(organizationId, storageObjectId) — só depois remove o objeto
```

## Estratégia multi-tenant

Idêntica ao resto da API: `organizationId` do JWT em toda a operação.
`create`/`findAll` verificam a fatura via `InvoicesService.findOne()`
(que já filtra por organização); `findOne`/`remove` filtram o
`InvoiceAttachment` diretamente por `{ id, invoiceId, organizationId }`.
Validado manualmente com uma segunda organização real: `GET`/`POST` na
fatura de outra organização devolvem 404.

## Endpoints implementados

| Endpoint | Role | Reutilização |
|---|---|---|
| `POST /invoices/:invoiceId/attachments` | `MANAGER+` | `uploadsService.create()` |
| `GET /invoices/:invoiceId/attachments` | qualquer autenticado | query direta, sem `downloadUrl` |
| `GET /invoices/:invoiceId/attachments/:id` | qualquer autenticado | `uploadsService.findOne()` |
| `DELETE /invoices/:invoiceId/attachments/:id` | `MANAGER+` | `uploadsService.remove()` |

Sem listagem geral fora do contexto de uma fatura, sem pesquisa, sem
preview, sem `getUploadUrl()` — fora do âmbito desta fase.

## Ficheiros criados

```
apps/frontrest/api/src/invoices/attachments/invoice-attachments.controller.ts
apps/frontrest/api/src/invoices/attachments/invoice-attachments.service.ts
apps/frontrest/api/src/invoices/attachments/invoice-attachments.service.spec.ts
apps/frontrest/api/test/invoice-attachments.e2e-spec.ts
packages/database/prisma/migrations/20260708211230_add_storage_object/          — dívida da Fase 5.2, fechada nesta fase
packages/database/prisma/migrations/20260708214307_add_invoice_attachment/      — só InvoiceAttachment
docs/phases/phase-5.3-invoice-attachments.md
```

## Ficheiros alterados

```
packages/database/prisma/schema.prisma       — model InvoiceAttachment; relações inversas em Organization/Invoice/StorageObject
apps/frontrest/api/src/invoices/invoices.module.ts — regista InvoiceAttachmentsController/Service, importa UploadsModule
apps/frontrest/api/src/uploads/uploads.module.ts   — + exports: [UploadsService]
apps/frontrest/api/src/uploads/uploads.service.ts  — remove(): ordem corrigida (BD antes de storage) + mapeia P2003 para ConflictException
apps/frontrest/api/src/uploads/uploads.service.spec.ts — teste novo para o mapeamento P2003
apps/frontrest/api/test/utils/mock-prisma.ts  — + invoiceAttachment (aditivo)
docs/PHASES.md, docs/INDEX.md
```

`UploadsController`, `invoices.controller.ts` e `invoices.service.ts`
**inalterados**.

## Validações e testes

**Automatizados** — Jest, Prisma e `ObjectStorage` mockados:
- Unitários (`invoice-attachments.service.spec.ts`, 6 testes): reutilização
  de `InvoicesService`/`UploadsService`, 404 sem efeitos colaterais, `id`
  da resposta de `findOne` é o do anexo (não do storage object), ordem
  `delete` BD → `remove` storage em `remove()`.
- Novo teste em `uploads.service.spec.ts`: mapeamento P2003 → 409, sem
  tocar em storage.
- E2E (`invoice-attachments.e2e-spec.ts`, guards reais, 11 testes):
  401/403/400/404 em todos os endpoints, criação real através do fluxo
  de upload, isolamento por organização, eliminação com reutilização de
  `uploadsService.remove()`.
- `pnpm --filter @frontrest/api test`/`test:e2e`, `pnpm typecheck`/
  `build`/`test` (raiz) — todos limpos.

**Manual, ponta a ponta, contra PostgreSQL e MinIO reais** (login real,
Supplier e Invoice reais criados via API, PDF real):
- `POST /invoices/:id/attachments` → 201; linha em `InvoiceAttachment` e
  `StorageObject` confirmadas no Postgres; objeto confirmado no MinIO
  com a key exata.
- `GET .../attachments` → lista com metadados.
- `GET .../attachments/:id` → 200, `downloadUrl` assinado válido, `id`
  da resposta é o do anexo.
- `DELETE /uploads/:id` diretamente no objeto anexado → **409**, objeto
  intacto no MinIO e no Postgres depois da tentativa (confirma o
  `onDelete: Restrict` + a correção de ordem em `UploadsService.remove()`).
- `DELETE /invoices/:id/attachments/:id` (caminho correto) → 200; linha
  de `InvoiceAttachment` e `StorageObject` desaparecem do Postgres,
  objeto desaparece do MinIO.
- Segunda organização real (registada via `/auth/register`): `GET`/`POST`
  na fatura da primeira organização → 404 nos dois casos.
- Dados de teste (Supplier/Invoice usados na validação) eliminados no
  final; organizações de teste de isolamento (Fase 5.2 e 5.3) ficaram na
  BD — dados inofensivos, sem relação com dados reais.

## Limitações conhecidas

- Herdada da Fase 5.2: `downloadUrl` usa o hostname interno `minio:9000`,
  não resolúvel fora da rede Docker — sem impacto nesta fase (validação
  feita de dentro da rede), relevante quando existir um consumidor
  externo real (frontend).
- `DELETE /invoices/:id` (cascade da fatura) remove os registos
  `InvoiceAttachment`, mas não os `StorageObject`/objetos MinIO
  associados — ficam órfãos, sem limpeza automática. Fora do âmbito
  desta fase (seria gestão documental).
- **Objetos órfãos em Postgres/MinIO são um risco aceite nesta fase.**
  Analisado explicitamente para `InvoiceAttachmentsService.remove()`
  (que apaga `InvoiceAttachment` → `StorageObject` na BD → objeto no
  MinIO, nesta ordem, forçada pela FK `onDelete: Restrict`): uma falha
  entre estes passos (crash do processo, indisponibilidade do MinIO)
  pode deixar um `StorageObject`/objeto MinIO sem `InvoiceAttachment` a
  referenciá-lo, ou um objeto MinIO sem linha na BD. Em nenhum caso isto
  produz corrupção, referência partida ou resposta inconsistente para o
  cliente — o pior resultado é um recurso órfão, íntegro e recuperável.
  Decisão explícita, tomada em revisão arquitetural dedicada: não
  introduzir `$transaction` nem lógica de compensação/saga para fechar
  esta janela nesta fase — o custo (nova superfície de API em
  `UploadsService`, ou duplicação de lógica que violaria a reutilização
  integral já aprovada) não se justifica face ao risco, que é de baixa
  probabilidade e sem impacto de corrupção. Fica para limpeza/reconciliação
  futura (job de garbage collection sobre `StorageObject`s sem
  `InvoiceAttachment` associado), não para esta fase.

## Trabalho fora do âmbito (fases futuras)

`getUploadUrl()`, upload direto do browser, OCR, workers, thumbnails,
preview, pesquisa de documentos, versionamento, frontend, wrapper NestJS
em `packages/storage`.

## Resultado final

`Invoice` suporta anexos genéricos reutilizando a Upload API por inteiro
— zero duplicação de lógica de storage, zero lógica de domínio em
`@frontcore/storage`/`uploads/`. Migration de `StorageObject` (dívida da
Fase 5.2) e migration de `InvoiceAttachment` (desta fase) aplicadas
separadamente, ambas validadas ponta a ponta contra infraestrutura real.

## Critérios de conclusão

- [x] `Invoice` suporta anexos.
- [x] Relação com `StorageObject` implementada (via `InvoiceAttachment`).
- [x] Upload reutiliza a infraestrutura existente (`UploadsService`).
- [x] Download funcional (validado contra MinIO real).
- [x] Remoção funcional (validado contra MinIO/Postgres reais).
- [x] Isolamento multi-tenant mantido (validado com segunda organização real).
- [x] Permissões mantidas (`MANAGER+` para escrita).
- [x] Sem duplicação de lógica.
- [x] Sem alterações arquiteturais a `@frontcore/storage`.
- [x] Testes unitários e e2e atualizados (45+47 no total da API).
- [x] `pnpm typecheck`/`build`/`test` limpos.
- [x] Documentação criada; `docs/PHASES.md`/`docs/INDEX.md` atualizados.

## Próxima fase

Fora do âmbito, a considerar separadamente: limpeza de `StorageObject`
órfãos quando uma fatura é apagada; `getUploadUrl()`; frontend de
anexos; endpoint público para `downloadUrl` funcionar fora da rede
Docker.
