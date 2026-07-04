# Phase 3.6 — UI Application Foundation

## Objetivo

Transformar `apps/frontrest/web` no primeiro consumidor real do Design
System: chrome de aplicação autenticada (`Sidebar`, `Topbar`, guard de
sessão centralizado), navegação genérica orientada a configuração, e
migração das páginas existentes (`/`, `/login`, `/register`, `/dashboard`)
para `@frontcore/ui` e tokens semânticos. A partir desta fase,
`apps/frontrest` deixa de estar protegido contra alterações — passa a ser
o produto de referência que valida o Design System construído nas Fases
3.1–3.5.

## Estado inicial

`packages/ui` tinha `primitives`, `data-display`, `feedback`, `layout`,
`shell` (só `AppShell`/`PageHeader`) e `forms`; `navigation/` não existia.
`apps/frontrest/web` não consumia nenhum componente visual de
`@frontcore/ui` — todas as páginas usavam HTML cru e classes Tailwind
`neutral-*` hardcoded, sem tokens semânticos. Cada página (`login`,
`register`, `dashboard`) reimplementava o seu próprio guard de sessão via
`useEffect` + `localStorage`, sem layout partilhado nem route groups.

## Arquitetura implementada

**`packages/ui`** ganha a categoria `navigation/` (`Navigation`,
`Breadcrumbs`) já prevista na ADR-0003, e `shell/` passa a incluir
`Sidebar`, `Topbar`, `UserMenu` e `ThemeToggle`, ao lado de `AppShell` e
`PageHeader`. Não foi criada uma categoria `application/` separada —
`Sidebar`/`Topbar`/`UserMenu` são a mesma categoria de coisa que
`AppShell` (chrome de app autenticada, zero domínio, dados só via
props/slots), sem uma regra de dependência que justifique um nono
diretório; `Breadcrumbs` fica em `navigation/` por ser navegação genérica,
não chrome.

`Navigation`/`Breadcrumbs`/`Sidebar` recebem `items: NavItem[]` e um
`renderLink` opcional (ADR-0002) — sem valor fornecido, caem para `<a
href>`. `UserMenu` mostra identidade/organização atual e um botão de
logout, sem dropdown/portal (`Overlay` ainda não existe; a API pública
não muda quando existir). `ThemeToggle` usa `next-themes` (já dependência
via `ThemeProvider`).

**`apps/frontrest/web`** introduz dois route groups: `(auth)` (layout
público, `Page`/`Container`, sem chrome) para `login`/`register`, e
`(dashboard)` (layout com `AppShell` + `Sidebar` + `Topbar`) para
`dashboard`/`settings`. O guard de sessão deixa de estar duplicado por
página — vive uma única vez em `lib/session-context.tsx`
(`SessionProvider`/`useSession`), específico do FrontRest (conhece
`Session`/`Organization`/`Membership`), nunca em `packages/ui`.
`components/link.tsx` (`AppLink`) é a única implementação de `renderLink`
do produto, envolvendo `next/link`. `lib/nav-config.ts` define os itens de
navegação do FrontRest. `/`, `/login`, `/register`, `/dashboard` foram
migradas para `@frontcore/ui` (`Typography`, `Button`, `Input`,
`FormField`/`FieldLabel`/`FieldError`, `Card`, `buttonVariants`) e tokens
semânticos (`bg-success`/`bg-destructive`/`bg-warning`,
`text-muted-foreground`, `border-border`, `bg-card`) em vez de
`neutral-*`/`green-500`/`red-500` hardcoded. `/settings` é uma rota nova,
stub (`PageHeader` + `EmptyState`), sem funcionalidade de configuração
real.

## Componentes criados

**`components/navigation/`:**
- `Navigation`, `Breadcrumbs`

**`components/shell/`** (adicionados aos já existentes `AppShell`,
`PageHeader`):
- `Sidebar`, `Topbar`, `UserMenu`, `ThemeToggle`

**`types/`:**
- `NavItem`, `RenderLink`

## Categorias criadas

- `packages/ui/src/components/navigation/`

## Dependências introduzidas

Nenhuma nova dependência de package. `ThemeToggle` usa `next-themes`
(já dependência de `packages/ui` desde a Fase 3.2).

## Decisões arquiteturais

- Não foi criada `components/application/` — `Sidebar`/`Topbar`/`UserMenu`
  ficam em `shell/`, aplicação direta da ADR-0003, não uma decisão nova.
- `Breadcrumbs` fica em `navigation/`, não em `shell/` — é navegação
  genérica, sem assumir contexto de app autenticada.
- `UserMenu` não usa dropdown/portal nesta fase — decisão deliberada até
  `Overlay` (`DropdownMenu`) existir.
- `SessionProvider` fica em `apps/frontrest/web`, não em `packages/ui` —
  carrega estado real de sessão/organização (não é zero-domínio como
  `Sidebar`/`Topbar`); promovê-lo para um package partilhado fica adiado
  até um segundo produto precisar (YAGNI deliberado, não esquecimento).
  Nenhum `QueryProvider`/`FeatureProvider` foi criado, pelo mesmo
  princípio — ficam para quando React Query/Feature Flags existirem
  (Fases 4/5 da plataforma).
- `ThemeProvider` mantém-se em `theme/` — não foi criado `providers/` só
  para o mover sem ganho funcional.
- ADR-0004 (distribuição do Theme Engine via `styles/theme.css` +
  `tailwind-preset.ts`) continua por implementar — não fechada nesta
  fase; `apps/frontrest/web` continua com a cópia manual das CSS
  variables introduzida na Fase 3.2.
- Guard de sessão continua client-side (`localStorage` + `useEffect`),
  agora centralizado num único lugar em vez de duplicado por página —
  reduz a duplicação, não resolve a proteção ao nível de edge (risco já
  registado no Roadmap, não endereçado aqui).

## ADRs respeitadas

- **ADR-0001** — respeitada; `Sidebar`/`Topbar`/`Navigation`/`Breadcrumbs`
  recebem tudo via props/slots, sem conhecer conceitos de restaurante.
- **ADR-0002** — respeitada; nenhum componente de `packages/ui` importa
  `next/link`/`useRouter`; `AppLink` (em `apps/frontrest/web`) é a única
  implementação de `renderLink`.
- **ADR-0003** — respeitada; `navigation/` implementada tal como já
  prevista; regra de dependência entre categorias mantida (`shell/`
  depende de `navigation/` e `primitives/`; `layout/` continua sem
  depender de `shell/`).
- **ADR-0005** — não aplicável (nenhum componente desta fase usa Radix).

## Validações efetuadas

- Typecheck isolado de `packages/ui` sem erros.
- Typecheck completo do monorepo sem erros (`pnpm typecheck`, executado
  duas vezes).
- Build completo do monorepo sem erros (`pnpm build`), incluindo
  `next build` de `apps/frontrest/web` com as 8 rotas geradas
  (`/`, `/login`, `/register`, `/dashboard`, `/settings`, `/health`,
  `/_not-found`).
- Servidor de desenvolvimento arrancado numa porta alternativa (a stack
  Docker já ocupava a 3000) e todas as rotas verificadas via pedido HTTP
  direto: `200` em `/`, `/login`, `/register`, `/dashboard`, `/settings`,
  sem erros no log do servidor.
- Um aviso de "unique key" no `Navigation` (detetado na validação manual
  em browser) foi corrigido — o `.map()` sobre `items` passou a envolver
  o resultado de `renderLink` num `Fragment` com `key={item.href}`,
  mesmo padrão já usado em `Breadcrumbs`.
- Fluxo completo validado manualmente num browser: homepage abre com
  API/DB operacionais, login funciona, dashboard e settings abrem via
  `Sidebar`, logout visível no `UserMenu`, sem avisos de "key" na consola.

## Resultado final

`apps/frontrest/web` consome `@frontcore/ui` como o seu design system —
chrome de aplicação, navegação, formulários e feedback vêm todos do
package partilhado. `packages/ui` ganha `navigation/` e completa `shell/`
com os componentes de chrome de app autenticada. Nenhuma nova categoria
fora das 8 já congeladas na ADR-0003 foi introduzida.

## Critérios de conclusão

- [x] `navigation/` criada com `Navigation`, `Breadcrumbs`.
- [x] `shell/` completa com `Sidebar`, `Topbar`, `UserMenu`, `ThemeToggle`.
- [x] `apps/frontrest/web` usa route groups `(auth)`/`(dashboard)`.
- [x] Guard de sessão centralizado uma vez (`SessionProvider`), não
      duplicado por página.
- [x] `/`, `/login`, `/register`, `/dashboard` migradas para
      `@frontcore/ui` e tokens semânticos.
- [x] `/settings` existe como stub.
- [x] Typecheck e build do monorepo limpos.
- [x] Fases 1 e 2 (health-checks, auth/API) sem alteração de código.
- [x] Fluxo completo testado manualmente num browser (login → dashboard →
      settings → logout), sem avisos de "key" na consola.

## Próxima fase

**Fase 3.7 — Overlay** (`Dialog`, `Sheet`, `DropdownMenu`, `Popover`,
`Tooltip`) — desbloqueia, entre outros, um `UserMenu` com dropdown real.
`Tabs` (âmbito original da antiga "Navigation") continua por agendar, sem
necessidade real identificada ainda.
