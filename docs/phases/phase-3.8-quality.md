# Phase 3.8 — Quality

## Objetivo

Dar a `packages/ui` uma base de qualidade validável automaticamente:
testes de componente, cobertura de código, CI estendido, e as
convenções de contribuição documentadas — sem exigir cobertura total
nem introduzir Storybook já nesta fase.

## Estado inicial

`packages/ui` tinha as 8 categorias de `components/` completas (Fases
3.1–3.7), mas nenhuma infraestrutura de testes, nenhum `CONTRIBUTING.md`,
e o CI (`ci.yml`) corria apenas install → `db:build` → typecheck → build.
`docs/quality/quality-gates.md` já previa `pnpm --filter @frontcore/ui
test` como gate real "a partir desta fase".

## Arquitetura implementada

Test runner: **Vitest**, com `@testing-library/react` +
`@testing-library/jest-dom`, ambiente `jsdom` (`packages/ui/vitest.config.ts`,
`src/test/setup.ts`). Cobertura via `@vitest/coverage-v8`, sem threshold
obrigatório — só visibilidade.

Cobertura de testes é **representativa, não total**: um teste por
categoria de `components/` (`Button` — primitives, `Card` —
data-display, `Alert` — feedback, `Dialog` — overlay, `Container` —
layout, `Navigation` — navigation, `AppShell` — shell, `FormField` —
forms), cobrindo renderização, merge de `className`, variantes, e — no
caso do `Dialog` — abrir via trigger e fechar com `Esc` (comportamento
nativo do Radix, verificado, não reimplementado).

`turbo.json` ganha a task `test`; o `package.json` da raiz ganha o script
`test`; `.github/workflows/ci.yml` ganha um passo `Test` entre
`Typecheck` e `Build`.

`packages/ui/CONTRIBUTING.md` documenta as convenções já praticadas
(`forwardRef`, `cn`, `cva`, categorias da ADR-0003, encapsulamento Radix
da ADR-0005) e aponta para `docs/quality/` em vez de as duplicar.

**Storybook:** decisão registada, não instalado. Quando avançar: Storybook
8, builder Vite, framework `react-vite` (nunca `@storybook/nextjs` —
`packages/ui` é framework-agnostic, ADR-0002); stories cobrem exemplos de
composição pública, não uma story por componente trivial.

**Acessibilidade:** revisão ao código existente encontrou duas
inconsistências, uma corrigida nesta fase (`Alert` usava `[&>svg]:left-4`,
propriedade física, em vez de `start-4`, lógica — corrigido) e uma
registada sem correção (`Navigation`/`Breadcrumbs` dependem do focus
outline nativo do browser nos links, em vez do tratamento
`focus-visible:ring-2` customizado usado no resto do design system —
inconsistência visual, não falha de acessibilidade; fica para uma fase
futura de `navigation/`).

`packages/ui/tsconfig.json` continua a ser a configuração usada por
`pnpm typecheck` e pelo IDE (inclui os `*.test.tsx`, para os erros de
tipo nos testes serem apanhados). `packages/ui/tsconfig.build.json`
estende-a só para o script `build`, excluindo `src/**/*.test.{ts,tsx}` e
`src/test/**` — `dist/` deixa de conter ficheiros de teste.

## Ficheiros criados

```
packages/ui/vitest.config.ts
packages/ui/tsconfig.build.json
packages/ui/src/test/setup.ts
packages/ui/CONTRIBUTING.md
packages/ui/src/components/primitives/button.test.tsx
packages/ui/src/components/data-display/card.test.tsx
packages/ui/src/components/feedback/alert.test.tsx
packages/ui/src/components/overlay/dialog.test.tsx
packages/ui/src/components/layout/container.test.tsx
packages/ui/src/components/navigation/navigation.test.tsx
packages/ui/src/components/shell/app-shell.test.tsx
packages/ui/src/components/forms/form-field.test.tsx
```

## Dependências introduzidas

```
vitest, @vitest/coverage-v8, @testing-library/react,
@testing-library/jest-dom, jsdom
```

Todas como `devDependencies` de `packages/ui` — nenhuma dependência de
produção nova, nenhum impacto no bundle publicado.

## Decisões arquiteturais

- Cobertura representativa (8 testes), não total — decisão de âmbito
  explícita, cobertura completa fica como trabalho futuro sem bloquear
  esta fase.
- Storybook analisado e decidido (Vite + `react-vite`), não instalado —
  fica como próximo passo separado.
- `Alert` corrigido para propriedade lógica; `Navigation`/`Breadcrumbs`
  não alterados nesta fase (fora do âmbito aprovado).
- ESLint continua "planeado, não ativo" (`docs/quality/quality-gates.md`)
  — decisão ao nível do repositório inteiro, não desta fase.
- `tsconfig.json` (typecheck/IDE) e `tsconfig.build.json` (build)
  separados — `dist/` não contém ficheiros `*.test.*` nem `src/test/`,
  sem perder cobertura de tipos dos testes em `pnpm typecheck`.

## ADRs respeitadas

- **ADR-0003** — respeitada; um teste por cada uma das 8 categorias,
  nenhuma categoria nova.
- **ADR-0005** — respeitada; o teste de `Dialog` verifica comportamento
  nativo do Radix (abrir/fechar), não o reimplementa.

## Validações efetuadas

- `pnpm --filter @frontcore/ui test` — 8 ficheiros, 17 testes, todos a
  passar.
- `pnpm --filter @frontcore/ui test:coverage` — relatório gerado sem
  erros; componentes testados com cobertura alta (`Button`,
  `Navigation`, `AppShell` a 100%), restantes a 0% (esperado, cobertura
  representativa, não total).
- `pnpm typecheck` — monorepo limpo (17/17).
- `pnpm build` — monorepo limpo (11/11); `apps/frontrest/web` gera as
  mesmas 8 rotas sem alteração.
- `apps/frontrest/web` confirmado sem alterações.

## Resultado final

`packages/ui` tem testes automáticos reais, cobertura reportável, CI a
correr testes a cada push/PR, e `CONTRIBUTING.md` documentado. Storybook
fica como decisão registada para uma fase futura.

## Critérios de conclusão

- [x] Vitest configurado, 8 testes representativos a passar.
- [x] Coverage reporting ativo (sem threshold obrigatório).
- [x] `packages/ui/CONTRIBUTING.md` criado.
- [x] Decisão de Storybook registada, sem instalação.
- [x] Lacuna de acessibilidade do `Alert` corrigida; a de
      `Navigation`/`Breadcrumbs` documentada, não corrigida.
- [x] CI executa install → db:build → typecheck → test → build.
- [x] Typecheck e build do monorepo limpos.
- [x] `apps/frontrest/web` sem alterações.

## Próxima fase

Instalação efetiva do Storybook (Vite + `react-vite`), cobertura de
testes além do conjunto representativo, e — separadamente — decisão
sobre introduzir ESLint no monorepo.
