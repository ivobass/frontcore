# Phase 4.4 — Backend Tests & Integration Validation

## Objetivo

Criar validação automatizada para a camada backend da Fase 4 —
`suppliers`, `expense-categories`, `invoices` (`apps/frontrest/api`) —
antes de avançar para a Fase 5, sem alterar o comportamento funcional da
API.

## Estado inicial

`apps/frontrest/api` não tinha nenhuma infraestrutura de testes: sem
script `test`, sem Jest, sem `@nestjs/testing`, sem `supertest`, zero
ficheiros `*.spec.ts`. `pnpm test` (raiz, `turbo run test`) já corria
desde a Fase 3.8, mas só exercitava `packages/ui` (Vitest) — para
`@frontrest/api` era um no-op silencioso.

## Arquitetura implementada

Jest + `@nestjs/testing` + `supertest` — o stack scaffolded por omissão
pelo `nest new` (`nest-cli.json` já existia, nunca tinha sido usado para
gerar testes). Nenhuma escolha exótica.

**Decisão central: nenhum teste liga a uma base de dados real.**
`PrismaService` é substituído por um mock (`test/utils/mock-prisma.ts`)
em todos os testes, unitários e e2e — motivo: o CI não tem serviço
Postgres, e adicionar um exigiria alterar `ci.yml` (fora do âmbito
aprovado). Como `PrismaService.onModuleInit` nunca corre quando é
substituído via `overrideProvider`, não há sequer tentativa de ligação
real.

**Testes unitários** (`src/**/*.service.spec.ts`, colocados junto do
código, `rootDir: src`) — instanciam o serviço diretamente com o mock do
Prisma, sem contentor de DI. Cobrem: scoping por `organizationId` em
todas as queries, paginação (`skip`/`take`/`totalPages`), filtros
(`search`, `status`, `supplierId`), mapeamento de erros Prisma
(`P2002`→`ConflictException`, `P2003`→`ConflictException`), cálculo de
totais de fatura (`totalAmount`, `totalPrice` por linha) — testado
indiretamente via `create()`/`update()`, sem exportar
`computeItemTotals` (decisão explícita, ver "Decisões arquiteturais").

**Testes e2e** (`test/*.e2e-spec.ts`) — arrancam o `AppModule` real via
`Test.createTestingModule`, só com `PrismaService` substituído. Os
Guards globais (`JwtAuthGuard`, `RolesGuard`, ambos registados como
`APP_GUARD` em `app.module.ts`) correm tal como em produção — os JWTs
usados nos testes são assinados com `signAccessToken()`, a mesma função
usada pelo login real. Isto dá cobertura real ao pipeline HTTP completo
(prefixo `/api`, `ValidationPipe`, guards, routing, DTOs), sem depender
de Postgres. Cobrem: 401 sem token/token inválido, 403 por role
insuficiente, bypass de `isSuperAdmin`, 404 por registo de outra
organização, 400 por DTO inválido ou campo não permitido
(`forbidNonWhitelisted`), 409 por conflito, forma da resposta paginada
vs. array simples (Expense Categories não pagina).

`test/setup-env.ts` define `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
diretamente em `process.env`, para os e2e não dependerem de um `.env`
local — importante para correr em CI, que não tem `.env` commitado.

## Ficheiros criados

```
apps/frontrest/api/test/setup-env.ts
apps/frontrest/api/test/jest-e2e.json
apps/frontrest/api/test/utils/mock-prisma.ts
apps/frontrest/api/test/utils/auth.ts
apps/frontrest/api/test/utils/bootstrap-app.ts
apps/frontrest/api/test/suppliers.e2e-spec.ts
apps/frontrest/api/test/expense-categories.e2e-spec.ts
apps/frontrest/api/test/invoices.e2e-spec.ts
apps/frontrest/api/src/suppliers/suppliers.service.spec.ts
apps/frontrest/api/src/expense-categories/expense-categories.service.spec.ts
apps/frontrest/api/src/invoices/invoices.service.spec.ts
```

## Ficheiros alterados

```
apps/frontrest/api/package.json      — scripts test/test:e2e, devDependencies, config "jest"
apps/frontrest/api/tsconfig.json     — inclui test/**/*.ts (typecheck cobre os testes)
apps/frontrest/api/tsconfig.build.json — rootDir repinado a ./src (dist/ de produção sem alteração)
pnpm-lock.yaml                        — novas devDependencies
```

## Dependências introduzidas

```
jest, ts-jest, @types/jest, @nestjs/testing, supertest, @types/supertest
```

Todas como `devDependencies` de `apps/frontrest/api` — nenhuma dependência
de produção nova, nenhum impacto no `dist/` publicado (confirmado
manualmente: `dist/main.js` no sítio certo, zero ficheiros de teste
vazados).

## Decisões arquiteturais

- `computeItemTotals` (função privada em `invoices.service.ts`) **não
  foi exportada** para facilitar testes — decisão explícita do Product
  Owner. O cálculo de totais é validado indiretamente, via
  `service.create()`/`.update()`, confirmando os dados passados ao
  Prisma mockado.
- Isolamento por organização testado ao nível do **contrato do
  serviço/controller** (que argumentos chegam ao Prisma, que resposta
  HTTP resulta), não do comportamento real do Postgres — o isolamento
  real já está coberto pela Fase 4.1 (`organizationId` indexado,
  `findFirst({where:{id, organizationId}})`); esta fase não o
  re-verifica ao nível da base de dados.
- `pnpm test` (raiz) passa a exercitar `@frontrest/api` automaticamente,
  sem alterar `turbo.json` nem `ci.yml` — só os unitários; os e2e
  (`test:e2e`) ficam como script separado, não incluído no `test` por
  omissão.
- Nenhuma alteração à API, Prisma, Docker ou frontend.

## Validações efetuadas

- `pnpm --filter @frontrest/api test` — 3 suites, 31 testes, todos a
  passar.
- `pnpm --filter @frontrest/api test:e2e` — 3 suites, 27 testes, todos a
  passar.
- `pnpm test` (raiz) — `@frontrest/api:test` agora incluído; 8/8 tasks
  OK.
- `pnpm typecheck` — monorepo limpo (17/17), inclui os ficheiros de
  teste novos.
- `pnpm build` — monorepo limpo (11/11); `dist/main.js` confirmado no
  sítio certo, sem ficheiros de teste no output de produção.

## Resultado final

`apps/frontrest/api` tem 58 testes automatizados (31 unitários + 27 e2e)
cobrindo Suppliers, Expense Categories e Invoices — autenticação, roles,
isolamento por organização, paginação, filtros e erros esperados —
integrados em `pnpm test`, sem dependência de base de dados real e sem
qualquer alteração de comportamento da API.

## Critérios de conclusão

- [x] Suites unitárias para as 3 entidades.
- [x] Suites e2e para as 3 entidades, com Guards reais.
- [x] `pnpm --filter @frontrest/api test` e `test:e2e` a passar.
- [x] `pnpm test` (raiz) passa a exercitar `@frontrest/api`.
- [x] `pnpm typecheck` e `pnpm build` limpos, comportamento inalterado.
- [x] Nenhum ficheiro de produção alterado.
- [x] `computeItemTotals` não exportada.
- [x] Documentação da fase criada; `docs/PHASES.md`, `docs/INDEX.md` e a
      nota desatualizada em `docs/ai/AI_WORKFLOW.md` atualizadas.

## Próxima fase

Fase 5 — Upload & MinIO (`docs/PHASES.md`), fora do âmbito desta fase.
