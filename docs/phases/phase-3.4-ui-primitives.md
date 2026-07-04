# Phase 3.4 — UI Primitives

## Objetivo

Implementar a primeira geração de componentes visuais reutilizáveis do
FrontCore — os "UI Primitives" — respeitando a arquitetura congelada na
Fase 3 (ADRs 0001–0005) e a fundação criada na Fase 3.3. Não inclui a
distribuição do Theme Engine (ADR-0004), adiada para uma fase futura.

## Estado inicial

`packages/ui/src/components/` continha apenas barrels vazios
(`export {};`); `components/primitives/` ainda não existia como pasta com
conteúdo. `src/index.ts` não exportava `./components`. Nenhuma dependência
Radix estava instalada. `class-variance-authority` estava disponível
(Fase 3.3) mas sem uso real.

## Arquitetura implementada

Dos 8 categorias previstas na ADR-0003, foram criadas apenas as que têm
conteúdo real nesta fase — `primitives/`, `data-display/`, `feedback/` —
aplicando a regra "anti-caos" de `docs/PROJECT_STRUCTURE.md` ("não criar
estrutura só porque parece elegante"). `forms/`, `overlay/`, `navigation/`,
`layout/` e `shell/` ficam por criar até terem conteúdo real numa fase
futura.

Radix UI é usado apenas nos componentes que precisam de comportamento de
teclado/acessibilidade mais complexo (`Separator`, `Checkbox`,
`RadioGroup`/`RadioGroupItem`, `Switch`), sempre encapsulado conforme
ADR-0005 — o import do módulo Radix fica confinado ao ficheiro do
componente, nunca reexportado; a API pública expõe só o componente do
FrontCore e o seu tipo de props. Os restantes componentes desta fase não
usam Radix.

Todos os componentes e subcomponentes desta fase seguem a mesma convenção:
`forwardRef`, `named export`, `className` fundido via `cn()`, variantes via
`cva` quando aplicável, ficheiro `kebab-case.tsx`.

## Componentes criados

**`components/primitives/`:**
- `Typography` (+ `typographyVariants`)
- `Label`
- `Button` (+ `buttonVariants`)
- `Input`
- `Textarea`
- `Badge` (+ `badgeVariants`)
- `Skeleton`
- `Separator` (encapsula `@radix-ui/react-separator`)
- `Checkbox` (encapsula `@radix-ui/react-checkbox`)
- `RadioGroup`, `RadioGroupItem` (encapsula `@radix-ui/react-radio-group`)
- `Switch` (encapsula `@radix-ui/react-switch`)

**`components/data-display/`:**
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

**`components/feedback/`:**
- `Alert` (+ `alertVariants`), `AlertTitle`, `AlertDescription`
- `Spinner`

## Categorias criadas

- `packages/ui/src/components/primitives/`
- `packages/ui/src/components/data-display/`
- `packages/ui/src/components/feedback/`

Cada uma com o seu `index.ts` de barrel; `components/index.ts` agrega as
três; `src/index.ts` passou a exportar `./components` (gap deixado em
aberto pela Fase 3.3, fechado nesta fase).

## Dependências introduzidas

| Pacote | Versão | Usado por |
|---|---|---|
| `@radix-ui/react-separator` | `^1.1.2` | `Separator` |
| `@radix-ui/react-checkbox` | `^1.1.4` | `Checkbox` |
| `@radix-ui/react-radio-group` | `^1.2.3` | `RadioGroup`/`RadioGroupItem` |
| `@radix-ui/react-switch` | `^1.1.3` | `Switch` |

`class-variance-authority` (já instalada na Fase 3.3) tem aqui o primeiro
uso real, em `Typography`, `Button`, `Badge` e `Alert`.

**Explicitamente não instaladas nesta fase:** `lucide-react` (componentes
mantidos agnósticos de biblioteca de ícones — `Checkbox` e `Spinner` usam
SVG inline desenhado à mão), `@radix-ui/react-slot` (o `Button` fica sem
`asChild` até essa dependência ser aprovada numa fase futura),
`@radix-ui/react-label` (o `Label` é um `<label>` nativo estilizado).

## Decisões arquiteturais

- Distribuição do Theme Engine (ADR-0004) mantida fora do escopo desta
  fase, apesar de a própria ADR-0004 a associar à "Fase 3.4" — fica para
  quando existir necessidade real de distribuição entre múltiplos
  produtos.
- Ícones sempre agnósticos: nenhum componente depende de uma biblioteca de
  ícones específica.
- `Button` sem `asChild`/`@radix-ui/react-slot` — composição como link
  fica para uma fase futura, quando essa dependência for aprovada.
- `Badge` usa `focus-visible:` para o anel de foco, consistente com os
  restantes componentes interativos.
- `Typography` deriva o variant por omissão de uma única constante
  (`DEFAULT_VARIANT`), evitando duas fontes da mesma verdade entre o `cva`
  e o corpo do componente.
- Os tokens de `spacing`, `radius`, `typography`, `shadows`, `z-index` e
  `breakpoints` (Fase 3.1) ainda não estão ligados a um preset Tailwind —
  os componentes desta fase usam a escala nativa do Tailwind para
  espaçamento e raio, não esses tokens. Fica em aberto se e quando essa
  ligação deve ser feita.

## ADRs respeitadas

- **ADR-0001** (componentes reutilizáveis vivem em `packages/ui`) —
  respeitada; nenhum componente conhece conceitos de domínio.
- **ADR-0002** (`packages/ui` sem dependência de Next.js) — respeitada;
  nenhum import de `next/*` em nenhum componente.
- **ADR-0003** (estrutura interna e categorização) — respeitada; categorias
  criadas só quando havia conteúdo real, convenções de nomenclatura e
  ficheiro seguidas em todos os componentes.
- **ADR-0004** (distribuição do Theme Engine) — não aplicável nesta fase,
  adiada.
- **ADR-0005** (`@frontcore/ui` como única API pública, Radix encapsulado)
  — respeitada; confirmado que nenhum ficheiro-fonte nem `package.json` de
  `apps/frontrest` importa ou declara `@radix-ui/*` diretamente.

## Validações efetuadas

- Typecheck isolado de `packages/ui` sem erros.
- Typecheck completo do monorepo sem erros (`pnpm typecheck`).
- `apps/frontrest` sem alterações.
- Nenhuma app do monorepo importa `@radix-ui` diretamente.

## Resultado final

A Fase 3.4 está concluída e congelada. `packages/ui` passa a ter uma
biblioteca real de componentes visuais reutilizáveis, organizados em 3
categorias, conformes com as ADRs 0001–0005, sem nenhuma alteração a
`apps/frontrest`. Esta base serve de fundação para as fases seguintes de
componentes (overlay, navigation, layout, shell).

## Critérios de conclusão

- [x] Componentes implementados em 3 categorias (`primitives/`,
      `data-display/`, `feedback/`).
- [x] `forwardRef`, `named export`, `cn()`, ficheiro `kebab-case.tsx` em
      todos os componentes.
- [x] Radix (`Separator`, `Checkbox`, `RadioGroup`, `Switch`) totalmente
      encapsulado — API pública nunca expõe Radix.
- [x] Zero dependência de biblioteca de ícones.
- [x] `apps/frontrest` sem alterações.
- [x] Typecheck do monorepo limpo.
- [x] Consistência arquitetural verificada, sem abstrações desnecessárias
      introduzidas.

## Próxima fase

**Fase 3.5** — a decidir (componentes de overlay/navegação, conforme o
roadmap da Fase 3).
