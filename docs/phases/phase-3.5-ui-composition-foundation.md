# Phase 3.5 — UI Composition Foundation

## Objetivo

Transformar os UI Primitives (Fase 3.4) numa base de composição real,
utilizável por qualquer produto FrontCore — wrappers de layout genéricos,
chrome de aplicação autenticada, e peças de formulário/feedback
reutilizáveis. Sem lógica de negócio; sem componentes específicos de
nenhum produto.

## Estado inicial

`packages/ui/src/components/` tinha `primitives/`, `data-display/` e
`feedback/` (Fase 3.4). `forms/`, `layout/` e `shell/` não existiam.

## Arquitetura implementada

Três categorias novas foram criadas — `layout/`, `shell/`, `forms/` — e
`feedback/` recebeu um componente adicional. `AppShell`/`PageHeader` ficam
em `shell/` (chrome de app autenticada), nunca em `layout/` (wrappers de
conteúdo genéricos, válidos em qualquer contexto, incluindo público) —
consistente com a distinção definida na ADR-0003 e com a regra de que
`layout/` nunca depende de `shell/`.

`AppShell` aceita `sidebar`/`topbar`/`children` como slots `ReactNode`
genéricos — não depende de `Sidebar`/`Topbar` concretos, que ainda não
existem. `PageHeader` e `EmptyState` reutilizam `Typography` de
`primitives/`; `FieldLabel` reutiliza `Label` de `primitives/`.

`FormField` funciona como agrupador de layout (substitui a necessidade de
um `FieldGroup` separado), sem Context nem wiring automático de
`id`/`aria-describedby` — o consumidor continua responsável por ligar
`htmlFor`/`id`/`aria-describedby` manualmente, tal como já acontecia entre
`Label` e `Input` desde a Fase 3.4.

## Componentes criados

**`components/layout/`:**
- `Container`, `Page`, `Section`

**`components/shell/`:**
- `AppShell`, `PageHeader`

**`components/forms/`:**
- `FormField`, `FieldLabel`, `FieldHint`, `FieldError`

**`components/feedback/`** (adicionado à categoria existente):
- `EmptyState`

## Categorias criadas

- `packages/ui/src/components/layout/`
- `packages/ui/src/components/shell/`
- `packages/ui/src/components/forms/`

Cada uma com o seu `index.ts` de barrel; `components/index.ts` passa a
agregar `primitives`, `data-display`, `feedback`, `layout`, `shell` e
`forms`.

## Dependências introduzidas

Nenhuma. Todos os componentes desta fase são composições de `primitives/`
já existentes mais elementos HTML simples.

## Decisões arquiteturais

- `AppShell`/`PageHeader` ficam em `shell/`, não em `layout/` — aplicação
  direta da categorização já definida na ADR-0003, não uma decisão nova.
- Não foi criado um `Header` genérico — `PageHeader` reutiliza o nome já
  fixado na ADR-0003 para evitar ambiguidade com `Topbar`.
- Não foi criado `FieldGroup` — `FormField` cumpre esse papel.
- `FormField`/`FieldLabel`/`FieldHint`/`FieldError` não introduzem Context
  nem associação automática de `id`/`aria-describedby` nesta fase; fica em
  aberto se essa automação será introduzida numa fase futura.
- `AppShell` não constrói `Sidebar`/`Topbar` — só os slots que os vão
  receber, quando esses componentes existirem.

## ADRs respeitadas

- **ADR-0001** — respeitada; nenhum componente conhece conceitos de
  domínio.
- **ADR-0002** — respeitada; nenhum import de `next/*`.
- **ADR-0003** — respeitada; categorias e nomenclatura conformes,
  incluindo a distinção `layout/` vs `shell/` e a regra de dependência
  entre categorias (`shell/` pode depender de `primitives/`; `layout/`
  nunca depende de `shell/`).
- **ADR-0005** — não aplicável diretamente (nenhum componente desta fase
  usa Radix), mas nenhuma violação.

## Validações efetuadas

- Typecheck isolado de `packages/ui` sem erros.
- Typecheck completo do monorepo sem erros (`pnpm typecheck`).
- `apps/frontrest` sem alterações.
- Nenhuma dependência nova instalada ou declarada.
- Nenhum componente importa `@radix-ui` ou `lucide-react`.

## Resultado final

A Fase 3.5 está concluída. `packages/ui` passa a ter 3 categorias novas
(`layout/`, `shell/`, `forms/`) e uma adição a `feedback/`, todas
compostas a partir dos UI Primitives da Fase 3.4, conformes com as ADRs
0001–0005, sem nenhuma alteração a `apps/frontrest`.

## Critérios de conclusão

- [x] `Container`, `Page`, `Section` implementados em `layout/`.
- [x] `AppShell`, `PageHeader` implementados em `shell/`.
- [x] `FormField`, `FieldLabel`, `FieldHint`, `FieldError` implementados em
      `forms/`.
- [x] `EmptyState` implementado em `feedback/`.
- [x] `named export`, `cn()`, ficheiro `kebab-case.tsx`, `forwardRef` onde
      aplicável, em todos os componentes.
- [x] `FieldLabel` compõe `Label`; `PageHeader`/`EmptyState` compõem
      `Typography`.
- [x] `AppShell` sem dependência de `Sidebar`/`Topbar` concretos.
- [x] Zero dependência nova instalada.
- [x] Typecheck do monorepo limpo.
- [x] `apps/frontrest` sem alterações.

## Próxima fase

**Fase 3.6** — Overlay (componentes com portal e posicionamento: `Dialog`,
`Sheet`, `DropdownMenu`, `Popover`, `Tooltip`).
