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
| [0005](./0005-ui-public-api-encapsulation.md) | `@frontcore/ui` como única API pública — encapsulamento do Radix UI | Aceite |
| [0006](./0006-documentation-architecture.md) | Arquitetura da documentação do FrontCore — `docs/ai/`, `docs/quality/`, critério para novas subpastas | Aceite |
| [0007](./0007-document-extraction-foundation.md) | Motor genérico de extração de documentos (`document-extraction/`) — separado de `fiscal-parsing/`, contrato assíncrono, sem novo package | Aceite |
