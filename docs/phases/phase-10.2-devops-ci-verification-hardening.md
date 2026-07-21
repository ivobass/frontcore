# Fase 10.2 — DevOps CI Verification & Hardening

## Objetivo

Verificar e reforçar o pipeline de CI criado na Fase 10.1 antes de
avançar para a Fase 8.9: integrar os testes e2e reais da API,
adicionar execução manual e `concurrency`/`timeout`, e substituir o
lint no-op por lint real e mínimo, com integração explícita e estável
com o ESLint do Next.js (sem depender de nenhum plugin só disponível
por hoisting transitivo). Auditoria obrigatória antes de qualquer
implementação; implementação só começou depois de aprovação explícita
das 7 decisões abaixo.

## Decisões aprovadas

1. Integrar os testes e2e reais da API no GitHub Actions.
2. Adicionar execução manual com `workflow_dispatch`.
3. Adicionar `concurrency`, cancelando execuções antigas da mesma
   branch ou pull request.
4. Adicionar um `timeout-minutes` razoável ao job.
5. Substituir o falso sinal verde de lint por lint real e mínimo.
6. Atualizar a documentação oficial.
7. Não alterar a Fase 8.9.

## Estado inicial

`.github/workflows/ci.yml` (Fase 10.1) tinha `on: push`/`pull_request`
para `main`, sem `workflow_dispatch`, sem `concurrency`, sem
`timeout-minutes`, job chamado `build`. 9 passos: checkout, setup
pnpm/Node 20, install, Documentation Validation, Lint, `db:build`,
typecheck, test, build, Docker Compose Validation/Build.
`permissions: contents: read` já existia (hardening de uma fase
anterior).

## Problemas confirmados na auditoria

- **Falso verde do lint**: `pnpm lint` passava sempre com sucesso, mas
  não validava nada de facto. Nenhum dos 14 `package.json`
  (`apps/frontrest/{api,web,workers}` + 11 `packages/*`) definia a
  tarefa `lint`; nenhum ficheiro `.eslintrc*`/`eslint.config.*` existia
  em todo o repositório — `turbo run lint` reportava "0 tasks" e saía
  com código 0, dando uma falsa sensação de cobertura.
- **Ausência dos testes e2e no CI**: `apps/frontrest/api/test/*.e2e-spec.ts`
  (executados via `pnpm --filter @frontrest/api test:e2e`, config
  separada `test/jest-e2e.json`) nunca corriam no GitHub Actions, só
  localmente. Confirmado por leitura direta do código (não assumido)
  que usam `PrismaService`/`ObjectStorage`/`QueueProducer` mockados
  (via `test/utils/bootstrap-app.ts`) — totalmente determinísticos,
  sem depender de Postgres/Redis/MinIO reais. Por isso a integração no
  CI não exigiu nenhum serviço adicional.

## Arquitetura implementada

### Pipeline GitHub Actions

`.github/workflows/ci.yml` — triggers, permissões e os 9 passos
existentes preservados; adicionado:

- **Execução manual**: `workflow_dispatch:` em `on` — permite correr o
  workflow manualmente a partir do separador Actions do GitHub, sem
  depender de um push/PR.
- **Concurrency**: `concurrency: { group:
  '${{ github.workflow }}-${{ github.ref }}', cancel-in-progress: true }`
  ao nível do workflow — uma nova execução na mesma branch/PR cancela
  a anterior ainda em curso, evita runners desperdiçados em pushes
  sucessivos.
- **Timeout**: `timeout-minutes: 30` no job — limite razoável para o
  conjunto atual de passos (lint + typecheck + test + e2e + build +
  Docker build), evita um job pendurado indefinidamente.
- Job renomeado de `build` para `quality`, com
  `name: Quality, Tests and Build` (reflete que o job já fazia mais do
  que só "build" antes desta fase).
- Novo passo **"API E2E Tests"** (`pnpm --filter @frontrest/api
  test:e2e`), inserido depois de "Test" (unitários) e antes de
  "Build" — mesma posição lógica que localmente (`db:build` →
  typecheck → test → e2e → build).

Nenhum outro passo, trigger ou permissão alterado. Sem matriz, sem
segundo workflow — um único job, como pedido.

### Lint real e mínimo — investigação do aviso "plugin was not detected"

Depois da primeira implementação, `pnpm build` (via `next build` em
`apps/frontrest/web`) imprimia:

```text
⚠ The Next.js plugin was not detected in your ESLint configuration.
```

**Investigação da causa raiz** (código-fonte de `next`, não assumido):
`next build` corre a sua própria verificação de lint interna
(`next/dist/lib/eslint/runLintCheck.js`). Para detetar se o plugin
`@next/next` está ativo, procura por `findup` um ficheiro de
configuração ESLint a partir de `apps/frontrest/web` (encontra o
`eslint.config.mjs` da raiz do monorepo, por estar acima na árvore de
diretórios) e chama
`eslint.calculateConfigForFile(<caminho do eslint.config.mjs>)` — ou
seja, calcula a configuração *flat* que se aplicaria a um ficheiro
nesse caminho específico (o próprio ficheiro de configuração, usado só
como um "carimbo" de caminho, nunca lintado a sério). Na primeira
versão desta fase, o plugin `@next/next` só estava registado (bloco
`plugins`) dentro de um bloco com `files:
['apps/frontrest/web/**/*.{ts,tsx}']` — e o caminho do próprio
`eslint.config.mjs` (um `.mjs` na raiz) não corresponde a esse padrão.
Por isso `calculateConfigForFile` devolvia uma configuração sem o
plugin `@next/next`, e o `next build` concluía (incorretamente) que o
plugin não estava ativo — apesar de as regras serem aplicadas
corretamente a ficheiros `.tsx`/`.ts` reais dentro de
`apps/frontrest/web` (confirmado empiricamente antes desta correção:
`pnpm --filter @frontrest/web lint` já reportava `@next/next/*` e
`react-hooks/*` corretamente).

**Conclusão**: não é uma limitação inevitável desta versão do Next.js
com flat config — era um efeito colateral da forma como os plugins
estavam registados (`plugins` dentro do mesmo bloco `files`-restrito
que as `rules`), corrigível sem introduzir `FlatCompat` nem
`eslint-config-next`.

**Correção aplicada**: `eslint.config.mjs` reestruturado — o registo
dos plugins (`plugins: { '@next/next': ..., 'react-hooks': ... }`)
passou para um bloco **sem** `files` (aplica-se, por definição do flat
config, a qualquer caminho, incluindo o do próprio ficheiro de
configuração); as **regras** desses plugins continuam num bloco
separado, `files: ['apps/frontrest/web/**/*.{ts,tsx}']` — só ativas
para o código real do `web`. Um plugin registado sem regras ativas
correspondentes não produz nenhum diagnóstico nos ficheiros fora desse
`files` (`apps/frontrest/{api,workers}`, `packages/*`), logo o
comportamento de lint real não muda — só a deteção do `next build`
passou a encontrar o plugin. Confirmado depois da correção: o aviso
**deixou de aparecer** em `pnpm --filter @frontrest/web build` e em
`pnpm build` (verificado com `grep -i "plugin was not detected"`,
sem ocorrências).

### Dependência ESLint do Next.js — decisão explícita e estável

Duas opções possíveis, ambas consideradas:

- `eslint-config-next` diretamente (via `FlatCompat`) — **rejeitada**,
  por um bug conhecido de "circular structure" da ponte `FlatCompat`
  com versões recentes do Next.js, e por trazer consigo várias
  dependências não necessárias para o âmbito mínimo desta fase
  (`eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
  `eslint-import-resolver-typescript`, etc.).
- **`@next/eslint-plugin-next` diretamente — escolhida.** Import
  direto, sem `FlatCompat`, com `configs.recommended.rules` e
  `configs['core-web-vitals'].rules` espalhados manualmente.

**Correção de higiene de dependências** (pedida explicitamente nesta
sessão): na primeira implementação, `eslint-config-next` tinha sido
adicionado a `package.json` (usado só para confirmar
`peerDependencies` durante a investigação inicial) mas **nunca
importado nem usado** em `eslint.config.mjs` — removido
(`pnpm remove -w eslint-config-next`). Além disso,
`@next/eslint-plugin-next` (importado diretamente no config) resolvia
com sucesso mesmo sem ser uma dependência direta — por ser uma
dependência transitiva de `eslint-config-next`, hoisted para a raiz
pelo `public-hoist-pattern` por omissão do pnpm (que inclui padrões
`*eslint*`). Isto seria uma dependência acidental e frágil (deixaria de
resolver se o hoisting ou o `eslint-config-next` fossem removidos).
Corrigido: `@next/eslint-plugin-next@15.1.3` adicionado como
`devDependency` direta na raiz, **fixado à versão exata do Next.js
instalado** (`15.1.3`, sem `peerDependencies` próprias — plugin
standalone, confirmado via `npm view`). `eslint-plugin-react-hooks`
mantido — usado diretamente e de facto necessário (o código do `web`
já continha um comentário `eslint-disable-next-line
react-hooks/exhaustive-deps` que só faz sentido com este plugin
registado).

### Configuração ESLint final

`eslint.config.mjs` (raiz, flat config, ESLint 9):

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      'packages/database/src/generated/**',
      '**/.turbo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plugins registados sem `files` — o `next build` deteta o plugin via
    // calculateConfigForFile(eslint.config.mjs); regras continuam scoped
    // a apps/frontrest/web abaixo.
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['apps/frontrest/web/**/*.{ts,tsx}'],
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
```

### Workspaces abrangidos

`"lint": "eslint ."` adicionado a `apps/frontrest/api`,
`apps/frontrest/web`, `apps/frontrest/workers`, e às 11 `packages/*`
(`ai`, `auth`, `config`, `database`, `monitoring`, `notifications`,
`ocr`, `queue`, `shared`, `storage`, `ui`) — as 14 packages com código
real em `src/`, sem exceção. `turbo.json` já tinha `"lint": {}`;
mantido sem alteração.

### Regras bloqueantes (erro — falham `pnpm lint`)

- Todas as regras de `@eslint/js` `recommended` e de
  `typescript-eslint` `recommended` (sintático, não type-aware) que
  por omissão são `"error"` — incluindo `@typescript-eslint/no-unused-vars`
  (com `argsIgnorePattern`/`varsIgnorePattern: '^_'`),
  `no-useless-escape`, `@typescript-eslint/ban-ts-comment`, entre
  outras da lista `recommended` oficial.
- `react-hooks/rules-of-hooks` (erro, `apps/frontrest/web` apenas).
- `@next/next/*` marcadas `"error"` em `core-web-vitals`
  (`no-html-link-for-pages`, `no-sync-scripts`), `apps/frontrest/web`
  apenas.

### Warnings não bloqueantes (não falham `pnpm lint`)

- `@typescript-eslint/no-explicit-any` — reduzida a `warn` globalmente
  (ver secção dedicada abaixo).
- `react-hooks/exhaustive-deps` — `warn` por omissão no
  `configs.recommended` do próprio `eslint-plugin-react-hooks`
  (`apps/frontrest/web` apenas).
- Regras `@next/next/*` marcadas `"warn"` em `recommended`
  (ex. `no-img-element`, `no-page-custom-font`), `apps/frontrest/web`
  apenas.

## `@typescript-eslint/no-explicit-any` — warnings restantes (dívida documentada)

Mantida como `warn` nesta fase — a correção dos 5 casos reais **não é
trivial nem segura o suficiente** para ser feita sem uma campanha de
tipagem: os dois usos em `apps/frontrest/web/lib/{api,auth}.ts`
(`parseJsonOrThrow`, `fetchMe`) são consumidos por **dezenas de call
sites** em `apps/frontrest/web/lib/*.ts`, cada um esperando implicitamente
um tipo de retorno próprio (`Invoice[]`, etc.); corrigir com generics
exigiria anotar explicitamente o tipo em cada um desses call sites —
fora do âmbito de uma fase de verificação de CI. **Não foi feita
nenhuma campanha de tipagem ampla.**

**5 warnings conhecidos, em 3 ficheiros:**

| Ficheiro | Linha | Contexto |
|---|---|---|
| `apps/frontrest/web/lib/api.ts` | 26 | `parseJsonOrThrow(response: Response): Promise<any>` |
| `apps/frontrest/web/lib/auth.ts` | 68 | `fetchMe(accessToken: string): Promise<any>` |
| `apps/frontrest/api/test/reports.e2e-spec.ts` | 28, 39, 48 | asserções de teste e2e sobre corpos de resposta JSON não tipados |

**Por que não bloqueiam o CI nesta fase**: corrigi-los corretamente
exigiria tipar genericamente o cliente HTTP do `web` (dezenas de call
sites) — um refactor de tipagem, não uma correção de lint pontual;
desproporcional para uma fase de verificação/hardening de CI, e fora
das 7 decisões aprovadas. Documentados aqui como **dívida técnica
futura**, não escondidos.

**Resultado factual do lint** (não "sem problemas"):

```text
14 tarefas reais concluídas, 0 erros, 5 warnings conhecidos
```

## Pequenas correções de lint efetuadas (não-funcionais, uma a uma)

Depois de correr `pnpm lint` de facto contra as 14 packages:

- **Import não utilizado** (`@typescript-eslint/no-unused-vars`) em
  `apps/frontrest/workers/src/queues/ocr-processing.processor.spec.ts`
  — `QueueConsumer` importado mas nunca usado; removido.
- **Variável não utilizada** em
  `apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.spec.ts:557`
  — `getFinancialSummary` desestruturado mas não usado nesse teste
  específico (outros testes no mesmo ficheiro usam-no legitimamente,
  confirmado antes de remover); removido só da desestruturação desse
  bloco.
- **`no-useless-escape`** em 5 extractors de
  `apps/frontrest/api/src/fiscal-parsing/extractors/` (`currency`,
  `customer`, `supplier`, `totals`, `vat`) — todos com `[:.\-]` numa
  classe de caracteres regex; `-` como último caráter de uma classe é
  sempre literal, com ou sem `\`, logo `\-` e `-` são semanticamente
  idênticos nessa posição. Corrigido para `[:.-]` em todos os 5
  (nenhuma outra alteração à regex).
- **Duas diretivas `eslint-disable` obsoletas** — `auth.service.ts`
  (`no-constant-condition` sobre um `while (true)`) e `main.ts`
  (`no-console`) — nenhuma das duas regras está ativa na configuração
  mínima desta fase, por isso o ESLint reportava "Unused eslint-disable
  directive". Ambos os comentários removidos (limpeza, sem alteração
  de comportamento).

Confirmado que o lint falha de facto perante uma violação real:
introduzida uma variável não utilizada de propósito em `main.ts`,
`pnpm --filter @frontrest/api lint` terminou com `exit code 1` e o
erro esperado (`@typescript-eslint/no-unused-vars`); a linha de teste
foi imediatamente revertida a seguir, sem deixar rasto.

## Resultado dos testes de regressão fiscal

Depois de corrigir os 5 `no-useless-escape` nos extractors (ver
acima), corridos os testes de `fiscal-parsing` para confirmar ausência
de regressão: **268 testes, 18 suites, todos a passar**
(`pnpm --filter @frontrest/api test -- fiscal-parsing`). Confirma que
a remoção do `\` antes de `-` (posição final de classe de caracteres,
já literal com ou sem escape) não alterou o comportamento de nenhum
extractor fiscal.

## Badge de CI

Adicionado um único badge a `README.md`, logo a seguir ao título,
apontando ao workflow `ci.yml` na branch `main`:
`https://github.com/ivobass/frontcore/actions/workflows/ci.yml/badge.svg?branch=main`
(link para a página de execuções do workflow). Nenhuma outra alteração
ao `README.md`.

## Configuração final do workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    name: Quality, Tests and Build
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Documentation Validation
        run: pnpm docs:validate
      - name: Lint
        run: pnpm lint
      - name: Build database package (gera Prisma Client)
        run: pnpm db:build
      - name: Typecheck
        run: pnpm typecheck
      - name: Test
        run: pnpm test
      - name: API E2E Tests
        run: pnpm --filter @frontrest/api test:e2e
      - name: Build
        run: pnpm build
      - name: Prepare .env para Docker Compose
        run: cp .env.example .env
      - name: Docker Compose Validation
        run: docker compose config
      - name: Docker Compose Build
        run: docker compose build
```

## Comandos executados (validação local, nesta sessão)

- `pnpm install --frozen-lockfile` — lockfile atualizado só com as
  dependências de lint desta fase; `exit code 0`.
- `pnpm docs:validate` — 5 validadores a passar; `exit code 0`.
- `pnpm lint` — 14/14 packages com sucesso (`exit code 0`); ver
  "warnings não bloqueantes" acima.
- `pnpm db:build` — Prisma Client gerado; `exit code 0`.
- `pnpm typecheck` — 24 tasks, workspace completo, limpo.
- `pnpm test` — 18 tasks, workspace completo, todos a passar.
- `pnpm --filter @frontrest/api test:e2e` — 9 suites, todos a passar.
- `pnpm --filter @frontrest/web build` — limpo, sem o aviso "plugin
  was not detected" (confirmado ausente por `grep`).
- `pnpm build` — 14 tasks, workspace completo, limpo (inclui `next
  build`, 15 rotas geradas, sem o aviso do plugin).
- `cp .env.example .env` + `docker compose config` — resolve
  `docker-compose.yml` com sucesso, sem arrancar nenhum container;
  `.env` local original restaurado imediatamente a seguir (backup
  feito antes, fora do repositório), sem afetar os containers já em
  execução no ambiente de desenvolvimento.
- `docker compose build` — as 3 imagens (`frontcore-api`,
  `frontcore-workers`, `frontcore-web`) constroem com sucesso; mesmo
  procedimento de backup/restauro do `.env`; containers em execução
  nunca parados/recriados.

## Testes unitários (total agregado)

**1190 testes**, todos a passar, workspace completo — `@frontcore/ui`
26, `@frontcore/ocr` 82, `@frontcore/ai` 114, `@frontcore/storage` 23,
`@frontcore/queue` 15, `@frontrest/web` 62, `@frontrest/api` 841,
`@frontrest/workers` 27. (`@frontcore/auth`, `@frontcore/config`,
`@frontcore/database`, `@frontcore/monitoring`,
`@frontcore/notifications`, `@frontcore/shared` não têm script `test`
— sem código a testar nesse sentido, inalterado por esta fase.)

## Testes e2e (total agregado)

**150 testes em 9 suites**, todos a passar
(`pnpm --filter @frontrest/api test:e2e`) — totalmente mockados
(`PrismaService`/`ObjectStorage`/`QueueProducer`), sem depender de
Postgres/Redis/MinIO reais.

## Typecheck

Limpo em todas as 24 tasks do workspace.

## Build

Limpo em todas as 14 tasks do workspace, incluindo `next build` de
`apps/frontrest/web` (15 rotas geradas), sem o aviso "plugin was not
detected" (corrigido nesta fase, ver secção dedicada acima).

## Docker Compose

`docker compose config` e `docker compose build` bem-sucedidos, sem
tocar nos containers já em execução no ambiente de desenvolvimento
(confirmado `docker compose ps` antes e depois — mesmo estado
`running (healthy)`).

## Permissões

`permissions: contents: read` mantida ao nível do workflow (herdada da
Fase 10.1) — suficiente para checkout, install, lint, testes e build;
nenhum passo escreve no repositório ou precisa de permissões
adicionais.

## Dependência de `.env.example`

O passo "Prepare .env para Docker Compose" (`cp .env.example .env`)
depende só de `.env.example` estar commitado e completo — confirmado
que contém apenas valores de desenvolvimento seguros
(`AI_PROVIDER=mock`, `OPENROUTER_API_KEY=` vazio, etc.), nenhum
segredo real necessário para `docker compose config`/`build`. O `.env`
privado do developer nunca é lido nem necessário pelo CI.

## Limitações conhecidas

- **`@typescript-eslint/no-explicit-any` como `warn`, não `error`** —
  5 warnings conhecidos, ver secção dedicada acima. Candidato a uma
  fase futura de tipagem do cliente HTTP do web.
- **Regras não type-aware** — a configuração usa
  `typescript-eslint.configs.recommended` (sintático, sem
  `parserOptions.project`), não as variantes
  `recommended-type-checked`. Regras como
  `no-misused-promises`/`no-floating-promises` (que exigem informação
  de tipos) não estão ativas. Ativá-las exigiria um `tsconfig` linkado
  por package no `eslint.config.mjs` (mais complexidade e tempo de
  execução), decisão deliberada de manter o lint desta fase mínimo e
  rápido — candidato a hardening futuro se necessário.
- **Sem cache de camadas Docker entre execuções do CI** — já
  documentado na Fase 10.1, inalterado (fora do âmbito desta fase).
- **Execução real no GitHub Actions não confirmada nesta sessão** —
  sem `git push`/PR reais feitos (ver "Restrições Git"); validado só
  localmente, passo a passo, com os mesmos comandos que o workflow
  usa.

## Recomendações de proteção de branch (documentação apenas, não aplicadas)

**Não foi possível confirmar nem aplicar automaticamente** — sem
acesso autenticado à API/CLI do GitHub nesta sessão (sem `gh`
instalado, sem `GITHUB_TOKEN`; o repositório `ivobass/frontcore` é
privado, confirmado por um `404` num pedido não autenticado à API do
GitHub). Recomendado ao responsável pelo repositório, a aplicar
manualmente em GitHub → Settings → Branches → Branch protection rules
para `main`:

- Exigir pull request antes de merge (sem push direto para `main`).
- Exigir que o check `quality` (este workflow) passe antes do merge.
- Bloquear merge com CI vermelho.
- Desativar force push para `main`.
- Desativar a eliminação da branch `main`.

## Operação diária (para o developer)

Fluxo diário a partir desta fase: **alterar código → commit → push →
GitHub Actions valida automaticamente → consultar o resultado verde ou
vermelho** no separador "Actions" do GitHub (ou o badge no `README.md`).
Um resultado vermelho identifica exatamente qual dos passos falhou
(Lint, Typecheck, Test, API E2E Tests, Build ou Docker Compose);
`workflow_dispatch` permite ainda correr o mesmo pipeline manualmente,
sem precisar de um push, quando útil para confirmar o estado atual da
branch.

## Fora do âmbito (confirmado, não implementado)

Deploy automático, staging, produção, VPS, Kubernetes, Terraform,
Docker registry, publicação de imagens, semantic release, tags
automáticas, Dependabot, CodeQL, dependency review, coverage gates,
observabilidade, backups, CI matrix, qualquer alteração funcional de
IA, qualquer alteração à Fase 8.9, refactors gerais, campanha de
tipagem para eliminar os warnings de `no-explicit-any`.

## Critérios de conclusão

- [x] `workflow_dispatch`, `concurrency` e `timeout-minutes`
      adicionados sem alterar triggers/permissões/passos existentes.
- [x] Job renomeado para `quality` (`name: Quality, Tests and Build`).
- [x] Passo "API E2E Tests" integrado, na posição pedida.
- [x] `pnpm lint` deixou de ser um no-op — corre ESLint real em 14
      packages, `exit code 0`, 0 erros, 5 warnings conhecidos e
      documentados.
- [x] Confirmado que o lint falha perante uma violação real
      (verificado e revertido nesta sessão).
- [x] Integração ESLint com Next.js explícita e estável —
      `@next/eslint-plugin-next` como dependência direta, sem
      depender de hoisting transitivo; aviso "plugin was not detected"
      investigado, causa raiz identificada e corrigida (não escondida,
      não contornada desativando o lint interno do Next).
- [x] `eslint-config-next` (dependência adicionada mas nunca usada)
      removida.
- [x] Badge de CI único adicionado ao `README.md`.
- [x] Documentação da fase criada;
      `docs/PHASES.md`/`docs/INDEX.md`/`docs/ARCHITECTURE.md`
      atualizados; Fase 8.9 não tocada.
- [x] `.env` local preservado e restaurado; containers em execução
      nunca parados/recriados.
- [x] Recomendações de proteção de branch documentadas (não
      aplicadas — sem acesso à API/CLI do GitHub).
- [ ] Execução real confirmada no GitHub Actions — pendente do
      primeiro `push`/`pull request` real depois desta fase (fora do
      alcance de uma sessão que não pode fazer `git push`).
