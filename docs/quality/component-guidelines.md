# Component Guidelines

Version: 1.0

## Objetivo

Convenções de API pública para qualquer componente novo em
`packages/ui`. Documenta o que já é prática consistente desde a Fase 3.4
— não introduz regras novas.

## Convenções

- Um ficheiro `kebab-case.tsx` por componente, `named export` (nunca
  `default export`).
- `forwardRef` sempre que o componente renderiza um elemento DOM.
- `className` sempre mesclado via `cn()` (de `lib/cn.ts`), sempre como
  último argumento, para que o consumidor possa sobrepor estilos.
- Variantes via `class-variance-authority` (`cva`), nunca `if`/`switch`
  manual sobre classes.
- Categoria conforme `docs/adr/0003-ui-internal-structure.md` — antes de
  criar uma categoria nova, confirmar que nenhuma das 8 já existentes
  serve.
- Radix UI (quando aplicável) encapsulado conforme
  `docs/adr/0005-ui-public-api-encapsulation.md` — só o componente
  FrontCore e o tipo `*Props` são exportados, nunca o módulo `@radix-ui/*`.
- Sem `next/link`, `next/image`, `next/navigation` (ADR-0002) — usar o
  padrão `renderLink`.
- Sem `lucide-react` nem qualquer biblioteca de ícones — SVG inline
  desenhado à mão, quando necessário.
- Propriedades lógicas Tailwind (`ms-`/`me-`/`ps-`/`pe-`/`border-s`/
  `border-e`) preferidas a físicas (`ml-`/`mr-`/`pl-`/`pr-`) quando a
  distinção esquerda/direita importa.

## Consistência da API pública

- Nomes de props consistentes entre componentes semelhantes (ex.: todos
  os overlays usam `Content`, `Trigger`, não uma mistura de nomes).
- Barrel exports atualizados em todos os níveis:
  `categoria/index.ts` → `components/index.ts` → `src/index.ts`.
- Nenhuma mudança de API pública sem justificação explícita — extensão é
  preferível a substituição.
