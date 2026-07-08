# Phase 5.1 — Upload & Storage Foundation

## Objetivo

Concretizar `@frontcore/storage` sobre MinIO/S3 — a foundation técnica
reutilizável de storage de objetos para qualquer produto FrontCore, sem
lógica de domínio, sem OCR, sem UI de upload e sem integração com
`Invoice`.

## Estado inicial

`packages/storage` existia desde a Fase 1 só como contrato
(`ObjectStorage`, `StoredObject`, `PutObjectInput`, `StorageConfig`), sem
nenhuma dependência real, sem implementação, sem testes — `docs/ARCHITECTURE.md`
já o registava como "contrato" desde então. A infraestrutura Docker
(MinIO + bucket `frontcore`, acesso anónimo desligado) já estava pronta e
validada desde a Fase 1; nenhum código em `apps/*` ou noutro `packages/*`
referenciava storage/upload/MinIO/S3 — confirmado por pesquisa no
repositório antes de implementar.

## Arquitetura implementada

`packages/storage/src` reorganizado em subpastas por responsabilidade
(decisão explícita, não só o `index.ts` plano que existia antes):

```
src/
  contracts/   — ObjectStorage, StoredObject, PutObjectInput, StorageConfig
  config/      — loadStorageConfig() (lê o ambiente)
  providers/
    s3/        — S3ObjectStorage (implementação concreta) + buildS3ClientConfig
  errors/      — StorageError
  utils/       — assertValidKey (genérico, sem conhecimento de nenhum provider)
  index.ts     — barrel público
```

**Contrato alterado**: `getSignedUrl()` foi substituído por
`getDownloadUrl()` — nome explícito, porque o contrato original era
ambíguo entre gerar um URL de leitura (GET) ou de escrita (PUT). A
arquitetura fica preparada para `getUploadUrl()` (URL assinado para
upload direto do browser, sem passar pelo servidor) como a extensão
natural quando existir um consumidor real — não implementado nesta fase,
documentado como comentário no próprio contrato
(`src/contracts/object-storage.ts`).

**`S3ObjectStorage`** — implementação sobre `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`, compatível com MinIO via
`forcePathStyle`. `put`/`delete` usam `S3Client.send()`; `getDownloadUrl`
usa `getSignedUrl()` do presigner sobre um `GetObjectCommand`. Todos os
métodos validam a `key` (`assertValidKey`) antes de qualquer chamada ao
SDK, e mapeiam falhas do SDK para `StorageError` — os consumidores nunca
dependem de tipos de erro do AWS SDK diretamente.

`assertValidKey` cobre nesta fase só a forma mínima (não vazia, sem
barra inicial) — **deliberadamente não** valida path traversal (`..`),
comprimento máximo, ou caracteres inválidos/não imprimíveis. Essas
validações ficam para quando existir um consumidor real a receber `key`s
de origem não confiável (ex. nome de ficheiro vindo do browser, Fase
5.2+); nesta fase não há nenhum caminho de entrada não controlado que as
justifique.

**`loadStorageConfig()`** espelha `loadTokenConfig()` de
`@frontcore/auth`: lê `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/
`S3_SECRET_KEY`/`S3_FORCE_PATH_STYLE` via `@frontcore/config`
(`requireEnv`/`optionalEnv`) — as mesmas variáveis já injetadas no
serviço `api` por `docker-compose.yml` desde a Fase 1, sem alterações à
infraestrutura.

**Sem integração NestJS** — decisão explícita do Product Owner: sem
consumidor real ainda (nenhum endpoint de upload existe), um wrapper
`StorageModule` ficaria como código morto. Fica para quando a Fase 5.2
(ou seguinte) precisar de facto de injetar `ObjectStorage` num serviço
NestJS.

**Testes**: Vitest (não Jest) — `packages/storage` é um `packages/*`
como `packages/ui`, que já estabeleceu Vitest como convenção para esta
categoria na Fase 3.8; Jest fica reservado a `apps/frontrest/api`
(NestJS). `tsconfig.json`/`tsconfig.build.json` seguem exatamente o
padrão de `packages/ui` (typecheck cobre os testes, build exclui-os).

## Ficheiros criados

```
packages/storage/src/contracts/object-storage.ts
packages/storage/src/contracts/index.ts
packages/storage/src/config/storage-config.ts
packages/storage/src/config/index.ts
packages/storage/src/config/storage-config.test.ts
packages/storage/src/errors/storage-error.ts
packages/storage/src/errors/index.ts
packages/storage/src/utils/assert-valid-key.ts
packages/storage/src/utils/index.ts
packages/storage/src/utils/assert-valid-key.test.ts
packages/storage/src/providers/s3/build-s3-client-config.ts
packages/storage/src/providers/s3/s3-object-storage.ts
packages/storage/src/providers/s3/s3-object-storage.test.ts
packages/storage/src/providers/s3/index.ts
packages/storage/src/providers/index.ts
packages/storage/vitest.config.ts
packages/storage/tsconfig.build.json
```

## Ficheiros alterados

```
packages/storage/src/index.ts   — de contrato plano a barrel público das subpastas
packages/storage/package.json   — dependencies (AWS SDK, @frontcore/config), scripts test/test:coverage, build aponta a tsconfig.build.json
pnpm-lock.yaml                   — novas dependências
```

`docs/ARCHITECTURE.md` **não foi alterado** — decisão explícita do
Product Owner: o estado "contrato" só passa a "ativo" quando existir um
consumidor real (Fase 5.2+).

## Dependências introduzidas

```
@aws-sdk/client-s3, @aws-sdk/s3-request-presigner   (dependencies — usadas em runtime)
vitest, @vitest/coverage-v8                          (devDependencies — mesma versão já usada em packages/ui)
@frontcore/config                                     (workspace — já existia no monorepo)
```

## Decisões arquiteturais

- `getSignedUrl()` → `getDownloadUrl()`, com `getUploadUrl()` documentado
  como extensão futura, não implementada.
- Reorganização em `contracts/`/`config/`/`providers/s3/`/`errors/`/`utils/`
  — decisão explícita do Product Owner, aplicada mesmo sem múltiplos
  providers ainda, para preparar a extensão (`providers/` já é plural).
- Sem wrapper NestJS nesta fase — evita código sem consumidor.
- Vitest em vez de Jest — consistente com `packages/ui` (packages/\*),
  não com `apps/frontrest/api` (app NestJS).
- Convenção de `key` (ex. `org-<id>/...` para isolamento multi-tenant)
  deliberadamente fora do contrato — fica ao critério do futuro
  consumidor, tal como já identificado na análise aprovada desta fase.
- Nenhuma alteração a `apps/*`, `packages/database` (schema) ou
  `docker-compose.yml` — infraestrutura já suficiente desde a Fase 1.

## Validações efetuadas

- `pnpm --filter @frontcore/storage typecheck` — limpo.
- `pnpm --filter @frontcore/storage test` — 3 suites, 15 testes, todos a
  passar (mock do SDK S3, sem MinIO real).
- `pnpm --filter @frontcore/storage build` — limpo; `dist/` espelha a
  nova estrutura de pastas, zero ficheiros de teste no output.
- `tsc --noUnusedLocals --noUnusedParameters` — limpo.
- `pnpm typecheck` (raiz) — 17/17 limpo.
- `pnpm build` (raiz) — 11/11 limpo.
- `pnpm test` (raiz) — 9/9 limpo; `@frontcore/storage:test` agora
  incluído automaticamente (sem alterar `turbo.json`).

## Resultado final

`@frontcore/storage` deixou de ser um contrato vazio: tem uma
implementação real sobre MinIO/S3 (`S3ObjectStorage`), configuração
lida do ambiente, erros normalizados, 15 testes automatizados, e uma
estrutura de pastas pronta para crescer (mais providers, `getUploadUrl`)
sem exigir mais reorganizações. Continua com zero dependência de
`apps/*` e zero lógica de domínio.

## Critérios de conclusão

- [x] `ObjectStorage` implementado sobre MinIO/S3.
- [x] `getDownloadUrl()` substitui `getSignedUrl()`; `getUploadUrl()`
      documentado como extensão futura.
- [x] Package organizado em `contracts/`/`config/`/`providers/s3/`/`errors/`/`utils/`.
- [x] Limitação da validação de `key` documentada (path traversal,
      comprimento máximo, caracteres inválidos — não implementados,
      ficam para quando houver origem não confiável de `key`s).
- [x] Sem integração NestJS.
- [x] `docs/ARCHITECTURE.md` não alterado.
- [x] Testes unitários a passar, sem MinIO real.
- [x] `pnpm typecheck`/`build`/`test` (raiz) limpos.
- [x] Zero dependência de `apps/*`.
- [x] Documentação da fase criada; `docs/PHASES.md`/`docs/INDEX.md`
      atualizados.

## Próxima fase

Primeiro consumidor real de `@frontcore/storage` — provavelmente um
endpoint de upload em `apps/frontrest/api` (Fase 5.2), momento em que
`docs/ARCHITECTURE.md` passa a marcar o package como "ativo" e em que um
wrapper NestJS (se necessário) e `getUploadUrl()` fazem sentido.
