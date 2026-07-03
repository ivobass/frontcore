# Architecture Decision Records — FrontCore

Registo das decisões arquiteturais do Design System do FrontCore (Fase 3).
Cada ADR documenta uma decisão, o contexto que a motivou, as alternativas
consideradas e as consequências aceites — para que produtos futuros
(FrontClinic, FrontHotel, FrontGym, FrontERP, ...) percebam *porquê*, não só
*o quê*.

## Convenção

- Ficheiro: `NNNN-titulo-curto.md`, numeração sequencial, nunca reutilizada.
- Estado possível: `Proposta`, `Aceite`, `Substituída por ADR-NNNN`.
- Uma ADR não é editada depois de `Aceite` — se a decisão muda, cria-se uma
  nova ADR que a substitui e referencia a anterior.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](./0001-design-system-location.md) | Localização dos componentes reutilizáveis — `packages/ui` vs `apps/*` | Aceite |
| [0002](./0002-ui-framework-agnostic.md) | `packages/ui` agnóstico de framework — sem dependência direta de Next.js | Aceite |
| [0003](./0003-ui-internal-structure.md) | Estrutura interna de `packages/ui/src` e categorização de componentes | Aceite |
| [0004](./0004-theme-engine-distribution.md) | Distribuição do Theme Engine entre produtos | Aceite |
