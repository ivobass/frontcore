# Fase 10.1 — DevOps CI Foundation

## Objetivo

Primeira infraestrutura DevOps do FrontCore — um pipeline de CI simples
e incremental (GitHub Actions), executado automaticamente em cada
`push`/`pull request` para `main`, e uma primeira versão da validação
automática de documentação. Base para evolução futura, nunca um
pipeline empresarial completo.

## Âmbito

`.github/workflows/ci.yml` (já existia parcialmente, ver "Estado
inicial") estendido para 12 passos: checkout, setup Node 20, setup
pnpm, cache pnpm, install, Documentation Validation, Lint, typecheck,
test, build, Docker Compose Validation, Docker Compose Build. Novo
`scripts/validate-docs.mjs` (agregador) + 5 validadores em
`scripts/validators/`, cada um com uma única responsabilidade, sem
dependências novas (Node puro, `.mjs`). Novo script `docs:validate` em
`package.json` (raiz), sem alterar nenhum script existente. Mantido
fora do âmbito, por decisão explícita: deploy automático, Kubernetes,
Dependabot, security scanning, code coverage, release automation,
Docker Hub, deploy em VPS, backups automáticos, monitorização,
alertas, múltiplos workflows, CI matrix — todos candidatos a fases
futuras, nenhum decidido nem aprovado aqui.

## Estado inicial

`.github/workflows/ci.yml` já existia (fora do que estava documentado
em `docs/PHASES.md`/`docs/INDEX.md` até agora) com 5 passos: checkout,
`pnpm/action-setup`, `actions/setup-node` (com `cache: pnpm`), install,
um passo adicional `pnpm db:build` (gera o Prisma Client — necessário
para `typecheck`/`test`/`build` funcionarem, já que `@frontcore/database`
não é publicado, só compilado localmente), typecheck, test, build.
Faltavam: validação de documentação (não existia nenhuma), lint (script
`lint` já existe na raiz — `turbo run lint` — mas nenhum
package/app define a tarefa `lint`, por isso é hoje um no-op, ver
"Limitações conhecidas"), e qualquer validação/build via Docker Compose.
Nenhum `scripts/` existia na raiz do repositório.

## Arquitetura implementada

### Pipeline GitHub Actions

`.github/workflows/ci.yml` — job único `build`, `ubuntu-latest`,
`on: push`/`pull_request` para `main`. Ordem dos passos, e porquê:

1. `actions/checkout@v4`.
2. `pnpm/action-setup@v4` (versão `9.12.0`, igual a `packageManager` em
   `package.json`) — **antes** do setup do Node, porque o passo
   seguinte depende do `pnpm` já estar no `PATH` para resolver o cache.
3. `actions/setup-node@v4` (`node-version: 20`, `cache: pnpm`) — a
   opção `cache: pnpm` do próprio `actions/setup-node` implementa o
   requisito "Cache pnpm" (chaveado pelo hash de `pnpm-lock.yaml`,
   mecanismo nativo da action, sem precisar de um passo
   `actions/cache` separado — mais simples, sem cache duplicado, mesma
   garantia).
4. `pnpm install --frozen-lockfile`.
5. `pnpm docs:validate` (Documentation Validation, novo).
6. `pnpm lint`.
7. `pnpm db:build` (script já existente na raiz — gera o Prisma Client
   antes de typecheck/test/build; mantido na mesma posição relativa ao
   existente antes desta fase, um passo técnico necessário, não pedido
   explicitamente na lista mas indispensável para os passos seguintes
   funcionarem).
8. `pnpm typecheck`.
9. `pnpm test`.
10. `pnpm build`.
11. `cp .env.example .env` (preparação — o mesmo comando já documentado
    em `docs/DEVELOPER_GUIDE.md`, "Arranque local"; nunca inventado
    nesta fase) seguido de `docker compose config` (Docker Compose
    Validation).
12. `docker compose build` (Docker Compose Build).

Nunca `docker compose up` — explicitamente fora do âmbito desta fase.
Cada passo usa exclusivamente um script já existente em `package.json`
(`docs:validate`, `lint`, `db:build`, `typecheck`, `test`, `build`) ou
um comando Docker Compose literal do pedido — nenhum comando inventado.
Qualquer passo que falhe interrompe o job imediatamente (comportamento
por omissão do GitHub Actions para um `run:` que termina com código
diferente de zero — nenhuma configuração adicional necessária).

### Documentation Validation

`scripts/validate-docs.mjs` (agregador, `.mjs`, sem dependências
novas) importa e corre 5 validadores de `scripts/validators/`, cada um
com uma única responsabilidade, devolvendo sempre `{ name, ok, errors }`:

- `validate-index.mjs` — `docs/INDEX.md` existe e não está vazio.
- `validate-phases.mjs` — `docs/PHASES.md` existe e não está vazio.
- `validate-phase-files.mjs` — todo o documento de fase referenciado
  por `docs/PHASES.md` (padrão `` `docs/phases/*.md` `` entre
  backticks) existe de facto em `docs/phases/`.
- `validate-architecture.mjs` — `docs/ARCHITECTURE.md` e `docs/ai/`
  (com `docs/ai/README.md`) existem.
- `validate-links.mjs` — percorre recursivamente `docs/**/*.md` e
  deteta uma referência local a outro documento que não existe; cobre
  as duas formas usadas nesta documentação — links Markdown
  `[texto](caminho)` e caminhos entre backticks (ex. `docs/PHASES.md`
  citado inline), a forma predominante. Padrões-gabarito com `*` (ex.
  `` `docs/phases/phase-X.Y-*.md` ``, usados em `docs/ai/AI_PHASE_TEMPLATE.md`
  e afins) são sempre ignorados — nunca caminhos reais. Duas exceções
  explícitas e documentadas inline no código (`docs/README.md` —
  `docs/adr/0006-documentation-architecture.md` regista a decisão
  explícita de nunca o criar; `docs/ai/AI_DECISION_RECORDS.md` —
  mencionado só como sugestão para uma fase futura em
  `docs/ai/README.md`, "Observações para fases futuras") — confirmadas
  por leitura direta do contexto antes de serem excluídas, nunca
  adicionadas só para o validador passar.

O agregador nunca ignora um erro — qualquer validador que devolva
`ok: false` marca `process.exitCode = 1` no final, depois de imprimir
todos os erros de todos os validadores (nunca para no primeiro).

### `package.json`

Único script novo: `"docs:validate": "node scripts/validate-docs.mjs"`.
Nenhum script existente alterado.

## Ficheiros criados

- `scripts/validate-docs.mjs`
- `scripts/validators/validate-index.mjs`
- `scripts/validators/validate-links.mjs`
- `scripts/validators/validate-phases.mjs`
- `scripts/validators/validate-phase-files.mjs`
- `scripts/validators/validate-architecture.mjs`
- `docs/phases/phase-10.1-devops-ci-foundation.md`

## Ficheiros alterados

- `.github/workflows/ci.yml` — 3 passos novos (Documentation
  Validation, Lint, Docker Compose Validation) + 1 (preparação `.env`)
  + 1 (Docker Compose Build); ordem dos passos existentes preservada.
- `package.json` (raiz) — só `docs:validate` adicionado.
- `docs/PHASES.md`, `docs/INDEX.md`, `docs/ARCHITECTURE.md` — ver
  secções próprias.

## Funcionamento da pipeline

Em cada `push`/`pull request` para `main`: checkout → setup
pnpm/Node 20 (com cache) → install (`--frozen-lockfile`, nunca
atualiza o lockfile) → validação de documentação → lint → build do
`@frontcore/database` (Prisma Client) → typecheck → test → build →
preparação do `.env` a partir de `.env.example` → `docker compose
config` → `docker compose build`. Qualquer passo com código de saída
diferente de zero interrompe o job imediatamente — nenhum passo
seguinte corre.

## Validações implementadas

1. `docs/INDEX.md` existe e não está vazio.
2. `docs/PHASES.md` existe e não está vazio.
3. `docs/ARCHITECTURE.md` existe.
4. `docs/ai/` (e `docs/ai/README.md`) existe.
5. Todo o documento de fase referenciado por `docs/PHASES.md` existe
   em `docs/phases/`.
6. Nenhuma referência local quebrada em `docs/**/*.md` (links Markdown
   e caminhos entre backticks), com as duas exceções documentadas e
   justificadas acima.

## Testes executados e resultados

Sem framework de testes para estes scripts nesta fase (Node puro,
sem Jest/Vitest configurado para `scripts/`, decisão consistente com
"não criar validações excessivamente complexas") — validação manual
direta, com resultados reais:

- `node scripts/validate-docs.mjs` / `pnpm docs:validate` — os 5
  validadores passam (`✔`) contra o estado real de `docs/` neste
  repositório; `exit code 0`.
- Verificação de deteção de falhas (fixture temporária isolada em
  `/tmp`, nunca tocando o repositório real): `validate-index` devolve
  `ok: false` quando `docs/INDEX.md` não existe;
  `validate-phase-files` devolve `ok: false` quando `docs/PHASES.md`
  referencia um ficheiro de fase inexistente; `validate-architecture`
  devolve `ok: false` quando `docs/ARCHITECTURE.md`/`docs/ai/` não
  existem. Confirma que os validadores não passam sempre por omissão.
- `pnpm lint` — `0 successful, 0 total` (no-op, ver "Limitações
  conhecidas"), `exit code 0`.
- `pnpm db:build` — Prisma Client gerado, `exit code 0`.
- `pnpm typecheck` (24 tasks, workspace completo) — limpo.
- `pnpm test` (18 tasks, workspace completo; `@frontrest/api`: 44
  suites, 766 testes) — todos a passar.
- `pnpm build` (14 tasks, workspace completo) — limpo.
- `cp .env.example .env && docker compose config` — resolve o
  `docker-compose.yml` com sucesso (`exit code 0`), sem nenhum
  container arrancado.
- `docker compose build` — as 3 imagens (`frontcore-api`,
  `frontcore-workers`, `frontcore-web`) constroem com sucesso (`exit
  code 0`), sem nenhum container arrancado; `.env` local restaurado ao
  valor original imediatamente a seguir, sem afetar os containers já
  em execução no ambiente de desenvolvimento.
- A execução real do workflow no GitHub Actions (`push`/`pull request`
  reais) não foi executada nesta sessão — nenhum commit/push foi feito
  (ver "Não executar" no pedido desta fase); validado só localmente,
  passo a passo, com os mesmos comandos que o workflow usa.

## Limitações atuais

- **`pnpm lint` é hoje um no-op.** O script existe na raiz
  (`turbo run lint`) desde antes desta fase, mas nenhum
  package/app do workspace define a tarefa `lint` — `turbo` reporta "0
  tasks executed" e sai com código 0. O passo "Lint" do CI corre com
  sucesso, mas não valida nada de facto até que ESLint (ou equivalente)
  seja configurado nalgum package/app — decisão explicitamente fora do
  âmbito desta fase (introduzir uma ferramenta de lint nova não foi
  pedido, e violaria "não inventar comandos"/YAGNI).
- `validate-links.mjs` é heurístico (regex sobre backticks/links
  Markdown), não um parser de Markdown real — não distingue, por
  desenho, uma referência dentro de um bloco de código de exemplo de
  uma referência real fora de um; as duas exceções conhecidas
  (`docs/README.md`, `docs/ai/AI_DECISION_RECORDS.md`) foram
  confirmadas manualmente, não detetadas automaticamente como "não é
  uma referência real".
- Sem cache de camadas Docker entre execuções do CI (`docker compose
  build` corre sempre do zero no runner) — aceitável para uma primeira
  versão simples; cache de build Docker fica como melhoria candidata a
  fase futura (ver abaixo).
- Sem execução real no GitHub Actions ainda — só validado localmente
  com os mesmos comandos (ver "Testes executados").

## Fora do âmbito (confirmado, não implementado)

Deploy automático; Kubernetes; Dependabot; security scanning; code
coverage; release automation; Docker Hub; deploy em VPS; backups
automáticos; monitorização; alertas; múltiplos workflows; CI matrix.

## Critérios de conclusão

- [x] `.github/workflows/ci.yml` executa automaticamente em
      `push`/`pull request` para `main`.
- [x] 12 passos, na ordem pedida (ajustada só onde uma dependência
      técnica real o exige — pnpm antes do Node, `db:build` antes de
      typecheck/test/build — ambas justificadas acima).
- [x] Documentation Validation implementada com 5 validadores de
      responsabilidade única.
- [x] `docs:validate` adicionado a `package.json`, nenhum script
      existente alterado.
- [x] `docker compose config`/`docker compose build` — nunca `docker
      compose up`.
- [x] Qualquer passo que falhe interrompe o job imediatamente
      (comportamento nativo do GitHub Actions, sem configuração
      adicional).
- [x] Só scripts oficiais já existentes (`docs:validate`, `lint`,
      `db:build`, `typecheck`, `test`, `build`) e comandos Docker
      Compose literais — nenhum comando inventado.
- [x] Documentação da fase criada; `docs/PHASES.md`/`docs/INDEX.md`/
      `docs/ARCHITECTURE.md` atualizados.
- [ ] Execução real confirmada no GitHub Actions — pendente do
      primeiro `push`/`pull request` real depois desta fase (fora do
      alcance de uma sessão que não pode fazer `git push`).

## Sugestões para a próxima fase DevOps

- **Problema encontrado**: `pnpm lint` é um no-op — não existe nenhuma
  configuração de ESLint/Prettier em nenhum package/app.
  **Impacto**: o passo "Lint" do CI não protege hoje contra nada;
  falsa sensação de cobertura.
  **Sugestão**: introduzir ESLint (config partilhada, ex. um package
  `@frontcore/eslint-config` ou config na raiz) quando houver
  necessidade real e aprovação explícita — não decidido nem
  implementado aqui.
  **Prioridade**: Média.
- **Problema encontrado**: sem cache de camadas Docker entre execuções
  do CI — cada `docker compose build` recomeça do zero no runner.
  **Impacto**: tempo de execução do CI mais longo do que precisava de
  ser, à medida que o número de execuções cresce.
  **Sugestão**: `docker/build-push-action` com cache GHA, ou
  `docker buildx bake` com cache remoto, candidato a uma fase DevOps
  futura.
  **Prioridade**: Baixa (aceitável para esta foundation).
- **Problema encontrado**: sem Dependabot/renovate a manter
  `pnpm-lock.yaml` e as imagens base dos Dockerfiles atualizadas.
  **Impacto**: dependências desatualizadas só descobertas
  manualmente.
  **Sugestão**: Dependabot para `github-actions`/`npm`/`docker`,
  explicitamente listado como fora do âmbito desta fase.
  **Prioridade**: Média.
- **Problema encontrado**: sem nenhum passo de segurança (`npm audit`,
  `docker scout`, secret scanning) no pipeline.
  **Impacto**: vulnerabilidades conhecidas em dependências só
  descobertas manualmente.
  **Sugestão**: Security Scanning, explicitamente listado como fora do
  âmbito desta fase — candidato natural a "Fase 10.2".
  **Prioridade**: Média.
