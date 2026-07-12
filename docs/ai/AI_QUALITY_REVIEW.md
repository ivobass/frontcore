# FrontCore AI Quality Review

Version: 1.1

## Objetivo

Checklist que qualquer assistente de IA deve percorrer antes de propor ou
implementar alterações em `packages/ui` — complementa
`docs/ai/AI_WORKFLOW.md` (fluxo geral), não o substitui. Aplica-se
especificamente a trabalho no Design System, não a backend/infra/produto
— para esse âmbito, ver a checklist irmã,
`docs/ai/AI_REVIEW_CHECKLIST.md`.

## Antes de propor

- **Consistência da API** — a proposta segue as convenções já em uso
  noutros componentes da mesma categoria (`forwardRef`, `cn` sempre por
  último, `cva` para variantes, `named export`)?
- **Design Tokens** — usa cores/espaçamento semânticos de `tokens/`, não
  valores Tailwind crus (`neutral-500`, `red-600`)?
- **Acessibilidade** — semântica HTML correta, navegação por teclado,
  `aria-*` preservado (nativo do Radix, quando aplicável)?
- **Naming** — nome do componente e da categoria conformes à ADR-0003?
- **Barrel exports** — todos os níveis vão precisar de atualização
  (`categoria/index.ts`, `components/index.ts`, `src/index.ts`)?
- **Duplicação de código** — já existe algo semelhante? Consultar
  `docs/quality/component-guidelines.md` antes de criar de novo.
- **Performance** — impacto no bundle, re-renders óbvios a evitar.
- **Responsive** — funciona em larguras pequenas sem overflow/quebra.
- **Documentação** — que documentos precisam de ser atualizados
  (`docs/quality/component-definition-of-done.md` tem a lista completa).
- **Impacto arquitetural** — a proposta respeita a regra de dependência
  entre categorias (ADR-0003) e o encapsulamento de Radix (ADR-0005)?
- **Conformidade com ADRs** — nenhuma ADR aceite é contrariada sem
  aprovação explícita.

## Antes de implementar

Confirmar que a proposta foi aprovada explicitamente (ver
`docs/ai/AI_WORKFLOW.md`) e que o âmbito ficou claro — nenhum destes
pontos deve ficar por resolver silenciosamente.

## Relação com outros documentos

- `docs/quality/component-definition-of-done.md` — critérios para
  considerar um componente individual "pronto".
- `docs/quality/component-guidelines.md` — convenções de API em detalhe.
- `docs/quality/accessibility.md` — critérios de acessibilidade em
  detalhe.
- `docs/adr/0001` a `0005` — decisões estruturais que esta checklist
  aplica.
- `docs/ai/AI_REVIEW_CHECKLIST.md` — checklist irmã, para revisão
  arquitetural geral fora de `packages/ui`.
