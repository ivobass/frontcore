# ADR-0004: Distribuição do Theme Engine entre produtos

- **Estado:** Aceite
- **Data:** 2026-07-03
- **Fase:** 3 (Design System), antes da Fase 3.3

## Contexto

Na Fase 3.2, o Theme Engine foi implementado com CSS variables em formato
HSL-triplo, definidas em `apps/frontrest/web/app/globals.css` (`:root` e
`.dark`), e mapeadas no Tailwind através de `apps/frontrest/web/tailwind.
config.ts` (`darkMode: 'class'` + `theme.extend.colors` apontando para
`hsl(var(--x) / <alpha-value>)`). Nessa altura, isto foi assumido
explicitamente como cópia manual, com a nota de que teria de ser mantido em
sincronia à mão até existir um passo de geração automática — uma decisão
aceitável com **um único produto** consumidor.

Com o objetivo de reutilização por 6+ produtos (FrontRest, FrontClinic,
FrontHotel, FrontGym, FrontERP, futuros), esta cópia manual deixa de ser um
detalhe menor: cada novo produto teria de copiar o mesmo bloco de CSS
variables e o mesmo mapeamento Tailwind, com risco real de divergência
silenciosa entre produtos ao longo do tempo.

## Decisão

`packages/ui` passa a distribuir o Theme Engine como artefactos consumíveis,
em vez de documentação para copiar à mão:

- **`packages/ui/src/styles/theme.css`** — fonte canónica única das CSS
  variables (`:root` e `.dark`), gerada a partir de `tokens/palette.ts` e
  `tokens/semantic.ts`. Cada app importa este ficheiro no seu próprio
  `globals.css` (`@import '@frontcore/ui/styles/theme.css';`) em vez de
  copiar os valores.
- **`packages/ui/src/styles/tailwind-preset.ts`** — preset Tailwind
  partilhado (`darkMode: 'class'`, o mapeamento `theme.extend.colors`, e o
  `content` glob para `packages/ui/src/**`). Cada `tailwind.config.ts` de
  produto usa `presets: [frontCorePreset]` e só acrescenta o que é seu
  (paths locais da app, extensões específicas do produto).

Esta decisão **não reabre nem altera** os valores ou a arquitetura de
tokens/CSS variables definidos na Fase 3.2 — apenas move a sua distribuição
de "cópia manual documentada" para "artefacto único importado", como
subfase adicional (Fase 3.4), não como correção retroativa à 3.2.

## Alternativas consideradas

- **Manter a cópia manual e apenas documentar bem o processo de
  sincronização.** Rejeitada: documentação não impede divergência; com 6
  produtos, a probabilidade de um deles ficar dessincronizado é alta e o
  erro resultante (cores erradas em dark mode) é subtil e fácil de não
  detetar em revisão de código.
- **Gerar `theme.css` a partir dos tokens TypeScript em build-time (passo de
  codegen).** Adiada: resolve o mesmo problema com uma camada adicional de
  tooling (build step, potencial de falhar silenciosamente); o ficheiro
  `theme.css` escrito à mão mas **centralizado num único sítio** já elimina
  o risco principal (divergência entre produtos). Codegen fica como
  evolução futura, não bloqueante.

## Consequências

**Positivas**
- Um único ponto de verdade para as CSS variables e mapeamento Tailwind,
  reutilizado por todos os produtos sem cópia manual.
- Adicionar um novo produto (ex.: FrontClinic) passa a ser `@import` +
  `presets: [...]`, não copiar e colar dezenas de linhas.

**Negativas / trade-offs aceites**
- `theme.css` continua escrito à mão a partir dos valores em
  `tokens/palette.ts`/`tokens/semantic.ts` — a sincronia entre os dois
  ainda depende de disciplina humana, só que agora **num único ficheiro**
  em vez de um por produto.
