# Phase 5.2 — Upload API Foundation

## Objetivo

Criar a fundação da API de upload em `apps/frontrest/api`, como primeiro
consumidor real de `@frontcore/storage` (Fase 5.1) — genérica,
reutilizável por qualquer módulo futuro (Invoice, Avatar, Report, OCR,
...), sem lógica de domínio, sem `getUploadUrl()`, sem frontend, sem
integração com `Invoice`.

## Estado inicial

`@frontcore/storage` tinha `S3ObjectStorage` implementado e testado
(Fase 5.1), mas zero consumidores — nenhum código em `apps/*`
referenciava storage/upload, confirmado por pesquisa no repositório antes
de implementar. Nenhum modelo `File`/`Document`/`StorageObject` existia
em `packages/database/prisma/schema.prisma`.

## Decisões arquiteturais

- **Modelo genérico, sem campos de domínio**: `StorageObject` representa
  só um objeto armazenado — sem `invoiceId`, `avatarUserId`, `reportId`
  ou qualquer FK de domínio. Módulos futuros referenciam sempre
  `StorageObject.id`, nunca o contrário; essa relação inversa não é
  criada nesta fase.
- **`key` nula até o upload estar completo** (`key String? @unique`, não
  `String @unique`) — decisão tomada depois de comparar duas abordagens:
  - **Opção A** (`key` obrigatória): exigiria um placeholder
    (`crypto.randomUUID()`) só para satisfazer o `@unique` na criação, e
    lógica de compensação (apagar a linha) se o `put()` falhasse.
  - **Opção B** (`key` opcional, escolhida): `create()` sem `key` →
    devolve `id` (cuid) → constrói-se a key → `put()` → `update()` grava
    a key definitiva. `key: null` é um estado honesto ("registo criado,
    objeto ainda não guardado"), não um valor fabricado. Sem placeholder,
    sem UUID intermédio, sem eliminação obrigatória em caso de falha —
    uma linha com `key: null` após uma falha simplesmente fica,
    identificável e limpável mais tarde, sem mentir sobre nada.
  - Decisivo: futuras integrações referenciam sempre `id` (nunca nulo),
    nunca `key` — a nulidade de `key` não se propaga a nenhum consumidor
    fora de `UploadsService`.
- **Leituras públicas filtram `key: { not: null }`** — `findOne`/`remove`
  tratam um `StorageObject` incompleto como inexistente (404), nunca o
  expõem via API.
- **Camada de serviço fixa**: `UploadsController → UploadsService →
  ObjectStorage (interface, token NestJS) → S3ObjectStorage`. Só
  `uploads.module.ts` importa `S3ObjectStorage`/`@frontcore/storage`
  diretamente; `UploadsController`/`UploadsService` só conhecem o tipo
  `ObjectStorage`. Nenhuma classe `StorageService` intermédia — seria um
  passthrough sem lógica própria.
- **Sem wrapper em `packages/storage/src/nestjs/`** — só existe uma API
  NestJS real (`apps/frontrest/api`); extrair um wrapper genérico para
  `packages/storage` fica para quando existir um segundo produto NestJS a
  precisar dele.
- **`put()` via servidor, não `getUploadUrl()`** — o servidor valida
  MIME/tamanho antes de o ficheiro alguma vez chegar a storage;
  `getUploadUrl()` (upload direto do browser) exigiria confiar em
  validação só no cliente ou em política de bucket, infraestrutura não
  justificada ainda. Contrato `ObjectStorage` inalterado desde a Fase 5.1.
- **Sem migration** — o modelo entra no schema (texto) e
  `prisma generate` corre (via `pnpm build`/`db:build`) para os tipos
  TypeScript existirem; nenhum `prisma migrate dev` corre. A tabela
  `StorageObject` **não existe** na base de dados até essa aprovação
  separada.

## Estrutura criada

```
apps/frontrest/api/src/uploads/
  object-storage.token.ts   — token de injeção NestJS para ObjectStorage
  constants.ts               — MIME allowlist, tamanho máximo, TTL do download URL
  uploads.service.ts         — create/findOne/remove; único ponto que lê `key`
  uploads.controller.ts      — POST/GET/DELETE /uploads
  uploads.module.ts          — único ponto que importa S3ObjectStorage
  uploads.service.spec.ts    — testes unitários
```

## Fluxo completo do upload

```
POST /uploads (multipart/form-data, campo "file")
  ↓ FileInterceptor + memoryStorage() — ficheiro fica em memória (Buffer), nunca em disco
  ↓ ParseFilePipe: MaxFileSizeValidator + FileTypeValidator (mimetype, skipMagicNumbersValidation: true)
  ↓ UploadsService.create(organizationId, { buffer, filename, contentType, size })
      1. prisma.storageObject.create({ organizationId, filename, contentType, size })  — sem key
      2. key = `organizations/${organizationId}/uploads/${id}`
      3. objectStorage.put({ key, body: buffer, contentType })
      4. prisma.storageObject.update({ where: { id }, data: { key } })
  ↓ 201, devolve o StorageObject com a key definitiva
```

Se o passo 3 falhar, o erro propaga (500) e a linha fica com `key: null`
— não há eliminação compensatória (ver "Decisões arquiteturais").

## Geração da key

Sempre no backend — o cliente nunca envia nem influencia a key.
Formato: `organizations/{organizationId}/uploads/{storageObjectId}`. Sem
nome de ficheiro na key (evita qualquer necessidade de sanitização de
caracteres); `filename` original fica só como metadado na BD.

## Estratégia multi-tenant

`organizationId` do JWT (`@CurrentUser()`) em toda a escrita/leitura/
eliminação: `create()` grava-o na linha; `findOne`/`remove` filtram
`{ id, organizationId, key: { not: null } }`. A key em si já está
prefixada por `organizationId` — isolamento também ao nível do layout do
bucket, defesa em profundidade além do filtro na BD.

## Endpoints implementados

| Endpoint | Role | Descrição |
|---|---|---|
| `POST /uploads` | `MANAGER+` | Cria o `StorageObject`, guarda o ficheiro em MinIO |
| `GET /uploads/:id` | qualquer autenticado | Metadados + `downloadUrl` gerado on-demand (`getDownloadUrl`, TTL 300s) |
| `DELETE /uploads/:id` | `MANAGER+` | Remove o objeto em storage e a linha na BD |

Sem listagem, pesquisa, paginação, preview ou integração com `Invoice` —
fora do âmbito desta fase.

## Validações e testes

- **Unitários** (`uploads.service.spec.ts`, Jest, Prisma e `ObjectStorage`
  mockados): fluxo `create` (key construída a partir do `id`, `put()`
  antes do `update()`), falha do `put()` não apaga a linha, `findOne`/
  `remove` devolvem 404 quando não encontrados ou incompletos.
- **E2E** (`test/uploads.e2e-spec.ts`, guards reais via `AppModule`
  completo, `PrismaService` e token `OBJECT_STORAGE` sobrepostos):
  401 sem token, 403 por role insuficiente (`POST`/`DELETE` como
  `MEMBER`), 400 por MIME não permitido, 400 sem ficheiro, 201 com key
  correta, 404 de outra organização, 200 com `downloadUrl` em `GET`, 200
  em `DELETE` com eliminação em storage e BD.
- `test/utils/mock-prisma.ts` e `test/utils/bootstrap-app.ts` (Fase 4.4)
  estendidos de forma aditiva — `storageObject` no mock de Prisma,
  `OBJECT_STORAGE` sobreposto no bootstrap; suites existentes
  (Suppliers/Expense Categories/Invoices) inalteradas.

## Ficheiros criados

```
apps/frontrest/api/src/uploads/object-storage.token.ts
apps/frontrest/api/src/uploads/constants.ts
apps/frontrest/api/src/uploads/uploads.service.ts
apps/frontrest/api/src/uploads/uploads.controller.ts
apps/frontrest/api/src/uploads/uploads.module.ts
apps/frontrest/api/src/uploads/uploads.service.spec.ts
apps/frontrest/api/test/uploads.e2e-spec.ts
apps/frontrest/api/test/utils/mock-object-storage.ts
```

## Ficheiros alterados

```
packages/database/prisma/schema.prisma       — model StorageObject (key nullable) + relação inversa em Organization; schema só, sem migration
apps/frontrest/api/src/app.module.ts          — importa UploadsModule
apps/frontrest/api/package.json               — + @frontcore/storage, multer (dependencies); @types/multer (devDependency)
apps/frontrest/api/test/utils/mock-prisma.ts  — + storageObject (aditivo)
apps/frontrest/api/test/utils/bootstrap-app.ts — + override do token OBJECT_STORAGE (aditivo)
docs/ARCHITECTURE.md                          — @frontcore/storage passa a "ativo"; nova secção "Storage de objetos"
docs/PHASES.md                                — Fase 5 atualizada com a Fase 5.2
docs/INDEX.md                                 — nova linha na tabela "Fases"
pnpm-lock.yaml
```

## Dependências introduzidas

```
multer                — dependency direta (era só transitiva de @nestjs/platform-express;
                         apanhado pelo build de produção Docker, que rejeita "phantom
                         dependencies" — ver "Limitações conhecidas")
@types/multer          — devDependency
@frontcore/storage      — workspace, já existia (Fase 5.1)
```

## Limitações conhecidas

- **Sem migration aplicada** — a tabela `StorageObject` não existe na
  base de dados real. Typecheck, build e testes automatizados (Prisma e
  `ObjectStorage` mockados) validam a arquitetura por completo; uma
  chamada real a `POST /uploads` contra o ambiente atual falha em
  runtime ("relation does not exist") até a migration ser aprovada e
  aplicada numa etapa própria.
- **`FileTypeValidator` com `skipMagicNumbersValidation: true`** — valida
  por `mimetype` reportado pelo cliente, não por sniffing do conteúdo
  real do ficheiro. Descoberto durante a implementação: o NestJS oferece
  sniffing real via magic bytes (pacote `file-type`) por omissão, mas
  isso é mais forte do que o combinado nesta fase (mimetype apenas,
  limitação assumida) — a opção `skipMagicNumbersValidation` mantém o
  comportamento simples e já documentado, sem o adotar silenciosamente.
- **`multer` como dependência transitiva não bastava** — funcionava em
  desenvolvimento local (resolução não estrita), mas o build de produção
  Docker (pnpm com isolamento estrito) rejeitou-a como "phantom
  dependency" (`Cannot find module 'multer'`). Corrigido adicionando-a
  como dependência direta; sinalizado aqui para não voltar a surpreender
  numa fase futura com o mesmo padrão (import direto de um pacote só
  transitivamente disponível).

## Trabalho adiado para fases futuras

- Migration do `StorageObject` (aprovação separada).
- `getUploadUrl()` — upload direto do browser.
- Wrapper NestJS reutilizável em `packages/storage/src/nestjs/` (quando
  existir um segundo produto NestJS).
- Integração com `Invoice` (relação `Invoice → StorageObject`).
- Listagem, pesquisa, paginação, preview.
- Frontend de upload.
- `docs/ARCHITECTURE.md`: `Estado Fase 1` de `@frontcore/storage` — a
  coluna da tabela de packages ainda se chama "Estado Fase 1" por
  convenção herdada da Fase 1; não renomeada nesta fase, por não ser o
  âmbito aprovado (evitar refactors oportunistas).

## Resultado final

`apps/frontrest/api` tem o primeiro consumidor real de
`@frontcore/storage`: upload, leitura (com URL de download assinado) e
eliminação de objetos genéricos, isolados por organização, com 15 testes
automatizados novos (6 unitários + 9 e2e), sem qualquer alteração de
comportamento fora do módulo `uploads/`, e sem lógica de domínio no
modelo de dados.

## Critérios de conclusão

- [x] `StorageObject` proposto no schema (sem migration).
- [x] `UploadsController`/`UploadsService`/`UploadsModule` implementados,
      camada de serviço conforme aprovado.
- [x] `POST`/`GET`/`DELETE /uploads` implementados; sem listagem, sem
      `Invoice`, sem `getUploadUrl()`.
- [x] Key gerada sempre pelo backend, nunca pelo cliente.
- [x] Testes unitários e e2e a passar.
- [x] `pnpm typecheck`/`build`/`test` (raiz) limpos.
- [x] Validação Docker (`api`) executada — apanhou e corrigiu a
      dependência em falta (`multer`).
- [x] Documentação da fase criada; `docs/ARCHITECTURE.md`/`docs/PHASES.md`/
      `docs/INDEX.md` atualizados.

## Próxima fase

Aprovação separada da migration do `StorageObject`, seguida de validação
manual end-to-end real (upload/download/eliminação contra MinIO real).
Só depois disso faz sentido considerar Fase 5.3+ (integração com
`Invoice`, `getUploadUrl()`, ou frontend de upload).
