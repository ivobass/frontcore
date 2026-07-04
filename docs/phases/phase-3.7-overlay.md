# Phase 3.7 — Overlay

## Objetivo

Completar a 8ª e última categoria de `components/` prevista na ADR-0003:
`overlay/` — componentes de sobreposição com portal, posicionamento e
focus-trap, encapsulando Radix (ADR-0005), sem alterar a API pública já
existente nem `apps/frontrest/web`.

## Estado inicial

`packages/ui/src/components/` tinha 7 das 8 categorias da ADR-0003
(`primitives`, `data-display`, `feedback`, `layout`, `navigation`,
`shell`, `forms`); `overlay/` não existia. `tokens/z-index.ts` existia
desde a Fase 3.3, sem nenhum consumidor real.

## Arquitetura implementada

`components/overlay/` ganha `Dialog`, `Sheet`, `DropdownMenu`, `Popover`
e `Tooltip`, cada um num ficheiro próprio, encapsulando o Radix
correspondente. `Dialog` e `Sheet` partilham o mesmo primitivo
(`@radix-ui/react-dialog`) mas ficam em ficheiros separados, sem um
reexportar o outro — a apresentação (modal centrado vs. painel lateral)
é a única diferença, cada API pública evolui independentemente.

O z-index de cada `Content`/`Overlay` vem de `tokens/z-index.ts`
(`overlay`, `modal`, `dropdown`, `popover`, `tooltip`) aplicado via
`style` inline, não via classe Tailwind — uma classe `z-[...]` construída
a partir de uma constante não é detetável pelo scanner estático do
Tailwind, e `tailwind-preset.ts` (ADR-0004) continua por implementar.
Nenhum destes componentes reimplementa foco/teclado/`Esc`/clique-fora —
esse comportamento é nativo do Radix e fica intocado.

`TooltipProvider` é exportado tal como existe no Radix (precisa de
envolver a app uma única vez, tal como o `ThemeProvider`) — a composição
em `apps/frontrest/web` fica para quando o produto usar `Tooltip` pela
primeira vez, fora do âmbito desta fase.

`Dialog`, `Sheet`, `DropdownMenu`, `Popover` e `Tooltip` usam os estados
`data-state="open"|"closed"` nativos do Radix para animar
opacidade/escala (fade + zoom) via `transition`, sem depender de nenhum
plugin de animação Tailwind (`tailwindcss-animate` não está instalado —
fora do âmbito aprovado). `Sheet` usa o mesmo padrão para a translação de
entrada/saída lateral. Limitação aceite: com `transition` puro (sem
`@keyframes`), o Radix garante a animação de fecho de forma fiável
(mantém o elemento montado até `transitionend`), mas a entrada pode
parecer instantânea em alguns browsers — resolver isso por completo
implicaria `tailwindcss-animate` (nova dependência) ou um preset Tailwind
partilhado com `@keyframes` (ADR-0004), nenhum dos dois aprovado nesta
fase.

## Componentes criados

**`components/overlay/`:**
- `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`,
  `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`
- `Sheet`, `SheetTrigger`, `SheetContent` (`side`: `right`/`left`/`top`/
  `bottom`), `SheetHeader`, `SheetFooter`, `SheetTitle`,
  `SheetDescription`, `SheetClose`
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
  `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`
- `Popover`, `PopoverTrigger`, `PopoverContent`
- `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`

## Categorias criadas

- `packages/ui/src/components/overlay/` — completa as 8 categorias da
  ADR-0003.

## Dependências introduzidas

```
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-popover
@radix-ui/react-tooltip
```

## Decisões arquiteturais

- `Sheet` não reexporta de `dialog.tsx` — ficheiro próprio, mesmo
  primitivo Radix, para não acoplar duas APIs públicas distintas.
- z-index aplicado via `style` inline a partir de `tokens/z-index.ts`,
  não via classe Tailwind — decisão deliberada enquanto a ADR-0004
  (preset Tailwind partilhado) não estiver implementada.
- `TooltipProvider` fica só definido em `packages/ui` nesta fase; a
  composição em `apps/frontrest/web/app/layout.tsx` não foi feita —
  fora do âmbito aprovado para esta fase.
- Nenhuma alteração à API pública de componentes já existentes
  (`UserMenu` continua com o layout inline definido na Fase 3.6).
- Nenhuma alteração a `apps/frontrest/web`.

## ADRs respeitadas

- **ADR-0001** — respeitada; nenhum componente conhece conceitos de
  domínio.
- **ADR-0002** — respeitada; nenhum import de `next/*`.
- **ADR-0003** — respeitada; `overlay/` implementada tal como já
  prevista, completando as 8 categorias congeladas.
- **ADR-0005** — respeitada; cada componente encapsula o seu primitivo
  Radix — a API pública é só o componente FrontCore + tipo `*Props`;
  nenhum módulo `@radix-ui/*` é reexportado.

## Validações efetuadas

- Typecheck isolado de `packages/ui` sem erros.
- Typecheck completo do monorepo sem erros (`pnpm typecheck`).
- Build completo do monorepo sem erros (`pnpm build`), incluindo
  `next build` de `apps/frontrest/web` com as mesmas 8 rotas da Fase 3.6.
- `apps/frontrest/web` confirmado sem alterações
  (`git status --porcelain -- apps/frontrest/web` vazio).
- Revisão pré-commit encontrou dois pontos corrigidos antes do fecho:
  `TooltipContent` não estava dentro de `TooltipPrimitive.Portal`
  (inconsistente com `Dialog`/`DropdownMenu`/`Popover`, que já usavam
  Portal); e `Dialog`/`DropdownMenu`/`Popover`/`Tooltip` não tinham
  nenhuma animação `data-state`-driven (só o `Sheet` tinha, para o slide)
  — ambos corrigidos, typecheck e build reexecutados com sucesso.

## Resultado final

`packages/ui` completa as 8 categorias de `components/` congeladas na
ADR-0003. `tokens/z-index.ts` passa a ter consumidores reais. Nenhuma
mudança de comportamento em `apps/frontrest/web`.

## Critérios de conclusão

- [x] `overlay/` criada com `Dialog`, `Sheet`, `DropdownMenu`, `Popover`,
      `Tooltip`.
- [x] Cada um encapsula o Radix correspondente (ADR-0005).
- [x] Fecham com `Esc`/clique fora (nativo do Radix).
- [x] z-index vem de `tokens/z-index.ts`, sem valores mágicos.
- [x] Nenhuma dependência de `lucide-react` (ícone de fecho em SVG
      inline).
- [x] API pública existente inalterada.
- [x] `apps/frontrest/web` sem alterações.
- [x] Typecheck e build do monorepo limpos.

## Próxima fase

**Fase 3.8 — Quality**: Storybook, testes de componente básicos, revisão
de acessibilidade, `CONTRIBUTING.md` de `packages/ui`.
