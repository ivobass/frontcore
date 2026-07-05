# Contributing to `@frontcore/ui`

Convenções para contribuir com o Design System do FrontCore. Este
documento não define standards novos — aponta para os já estabelecidos em
`docs/quality/` e `docs/adr/`, na raiz do repositório.

## Antes de começar

1. Ler `docs/quality/component-guidelines.md` e `docs/quality/accessibility.md`.
2. Confirmar que a categoria certa já existe — ver
   `docs/adr/0003-ui-internal-structure.md` (as 8 categorias de
   `components/`).
3. Confirmar que não existe já um componente semelhante.

## Convenções de código

- Um ficheiro `kebab-case.tsx` por componente, `named export`.
- `forwardRef` sempre que o componente renderiza um elemento DOM.
- `className` sempre mesclado via `cn()`, sempre como último argumento.
- Variantes via `class-variance-authority` (`cva`).
- Radix UI encapsulado conforme `docs/adr/0005-ui-public-api-encapsulation.md`
  — só o componente FrontCore e o tipo `*Props` são exportados.
- Sem `next/*` (ADR-0002), sem `lucide-react` — SVG inline quando
  necessário.
- Propriedades lógicas Tailwind (`ms-`/`me-`/`ps-`/`pe-`/`border-s`/
  `border-e`) preferidas a físicas.
- Barrel exports atualizados em todos os níveis:
  `categoria/index.ts` → `components/index.ts` → `src/index.ts`.

## Testes

Test runner: [Vitest](https://vitest.dev) + Testing Library
(`@testing-library/react`, `@testing-library/jest-dom`), ambiente
`jsdom`.

```bash
pnpm --filter @frontcore/ui test            # correr os testes
pnpm --filter @frontcore/ui test:coverage    # com relatório de cobertura
```

Cada ficheiro de componente pode ter um `*.test.tsx` ao lado. Não é
exigida cobertura de 100% — testar o que tem lógica/estado real
(variantes, abrir/fechar, `renderLink`), não repetir testes triviais de
"renderiza sem crashar" para wrappers puramente visuais sem
comportamento.

## Antes de abrir uma alteração

Percorrer `docs/quality/quality-checklist.md` e, para componentes novos,
`docs/quality/component-definition-of-done.md`. Confirmar:

```bash
pnpm typecheck
pnpm build
pnpm --filter @frontcore/ui test
```

## Documentação relacionada

- `docs/quality/` — guidelines, acessibilidade, checklist, gates, DoD de
  componente.
- `docs/adr/0001` a `0006` — decisões estruturais que este package
  respeita.
- `docs/ai/AI_QUALITY_REVIEW.md` — checklist equivalente para assistentes
  de IA.
