# Component Definition of Done

Version: 1.0

## Objetivo

Definition of Done específica para qualquer componente novo do Design
System. Complementar, não substitui, a Definition of Done de **fase**
definida em `docs/ai/AI_WORKFLOW.md` — esta aplica-se a um componente
individual, aquela ao fecho de uma fase inteira.

## Critérios

Um componente só está pronto quando:

- **API consistente** — segue `docs/quality/component-guidelines.md`
  (forwardRef, `cn`, `cva`, naming, categoria ADR-0003).
- **Design Tokens** — usa cores/espaçamento semânticos, não valores
  Tailwind crus.
- **Encapsulamento Radix** — quando aplicável, conforme
  `docs/adr/0005-ui-public-api-encapsulation.md`.
- **Acessibilidade validada** — semântica HTML, `aria-*` preservado,
  conforme `docs/quality/accessibility.md`.
- **Navegação por teclado** — alcançável e operável por teclado, foco
  visível.
- **Semântica HTML adequada** — elemento nativo correto antes de
  `div`/`span` com `role`.
- **Responsive** — sem overflow/quebra em larguras pequenas.
- **Documentação atualizada** — quando a convenção muda, refletido em
  `docs/quality/component-guidelines.md`.
- **Testes aplicáveis** — pelo menos um, quando há lógica/estado
  relevante.
- **Build e typecheck sem erros** — `pnpm typecheck` e `pnpm build`
  limpos.
- **Ausência de duplicação desnecessária** — confirmado antes de criar,
  não depois.
- **Conformidade com os standards do projeto** — `docs/quality/
  quality-checklist.md` percorrido.

Nenhum componente deve ser considerado pronto se algum destes pontos
estiver em falta.
