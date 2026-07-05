# FrontCore — Documentação de Qualidade

Standards de qualidade do Design System (`packages/ui`) — audiência-
agnóstica (aplica-se a humanos e IAs por igual). A revisão específica de
IA antes de propor/implementar componentes vive em
`docs/ai/AI_QUALITY_REVIEW.md`, não aqui.

## Índice

| Documento | Objetivo |
|---|---|
| [component-guidelines.md](./component-guidelines.md) | Convenções de API pública de componentes |
| [accessibility.md](./accessibility.md) | Semântica HTML, teclado, foco, `aria-*`, responsive |
| [quality-checklist.md](./quality-checklist.md) | Checklist condensado antes de considerar um componente pronto |
| [quality-gates.md](./quality-gates.md) | Processo de validação obrigatório (typecheck/build/test/lint) |
| [component-definition-of-done.md](./component-definition-of-done.md) | Definition of Done por componente individual |

## Relação com outros documentos

- `docs/adr/0003-ui-internal-structure.md` — categorização que
  `component-guidelines.md` aplica.
- `docs/adr/0005-ui-public-api-encapsulation.md` — regra de encapsulamento
  Radix que `component-guidelines.md` aplica.
- `docs/ai/AI_WORKFLOW.md`, secção "Definition of Done (DoD)" — DoD de
  **fase**, distinta da DoD de **componente** definida aqui.
