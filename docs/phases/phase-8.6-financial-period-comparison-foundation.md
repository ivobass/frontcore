# Fase 8.6 — Financial Period Comparison Foundation

## Objetivo

Acrescentar ao Chat IA a capacidade de comparar dois períodos financeiros
explicitamente nomeados na mesma mensagem — "compara maio com junho",
"compara janeiro com fevereiro", "este mês versus o mês passado" — a
única dimensão de consulta financeira ainda não coberta pelo retrieval
determinístico (Fase 8.1/8.4), e que já existia do lado dos Relatórios
(Fase 9) sem estar disponível na conversa.

## Âmbito

Comparação de dois períodos explicitamente nomeados na mesma mensagem,
usando exclusivamente a forma sintática "compara X com Y" ou "X
versus/vs Y". Mantido fora do âmbito, por decisão explícita registada
antes da implementação: comparação relativa a um período discutido
antes na conversa (ex. "e comparado com o mês passado?", sem os dois
períodos nomeados na mesma mensagem); tool `compare_periods`;
comparação entre fornecedores ou categorias; mais de dois períodos;
qualquer alteração ao Dashboard, ao schema Prisma, ao frontend, a
providers ou a OCR.

## Estado inicial

Fase 8.5 (`v0.8.5-conversational-filter-continuity-foundation`) — retrieval
determinístico com 7 intenções, período único por mensagem
(`resolveFinancialPeriod()`), filtros combináveis (estado/fornecedor/
categoria) e continuidade conversacional por dimensão independente.
`COMPARISON_PATTERN` em `financial-intent.resolver.ts` excluía
incondicionalmente qualquer mensagem com "compara(r)"/"versus"/"vs",
devolvendo `UNSUPPORTED`. `ReportsService` (Fase 9) já continha, em
métodos privados (`compareAmount()`/`compareCount()`), exatamente a
matemática de comparação entre dois períodos necessária para esta fase.

## Arquitetura implementada

### Matemática de comparação partilhada

`compareAmount()`/`compareCount()` e o tipo `PeriodComparisonValue`,
antes privados a `ReportsService`, foram extraídos para
`apps/frontrest/api/src/dashboard/period-comparison.util.ts` — funções
puras, sem alteração de comportamento. `ReportsService` passou a
importar e reutilizar este util em vez de manter a sua própria cópia;
`reports.service.ts` continua a exportar `PeriodComparisonValue` (via
`export type { ... } from '../dashboard/period-comparison.util'`) para
não quebrar nenhuma referência existente ao tipo. Nenhum teste de
`reports.service.spec.ts` foi alterado — todos continuam a passar sem
modificação, confirmando comportamento idêntico.

### Resolução de dois períodos

`apps/frontrest/api/src/ai/financial-retrieval/financial-period-pair.resolver.ts`
(novo) — `splitComparisonPeriods(text)` divide uma mensagem nos dois
lados de uma comparação ("compara X com Y" → `[X, Y]`; "X versus/vs Y"
→ `[X, Y]`), pura, sem resolver datas. `resolveFinancialPeriodPair(text,
now)` usa essa divisão e resolve cada lado através de
`resolveFinancialPeriod()` (Fase 8.1, reutilizada sem alteração) —
nunca uma segunda semântica de datas. O primeiro período mencionado é
sempre `current` (o sujeito da pergunta), o segundo é sempre `previous`
(a referência) — decisão simples e determinística, sem ordem
cronológica implícita.

### Intenção e router

`FinancialIntentType` ganhou `'PERIOD_COMPARISON'`.
`resolveFinancialIntent()` verifica `splitComparisonPeriods(text)` antes
de `COMPARISON_PATTERN` — só a forma sintática exata conta como
suportada; "compara os fornecedores mais caros" (sem essa forma)
continua `UNSUPPORTED`. Uma mensagem com a forma "X com Y" onde X/Y não
são períodos (ex. "compara a categoria Hosting com a Manutenção")
resolve `PERIOD_COMPARISON` a este nível — a segurança contra dados
fabricados está na camada seguinte, nunca aqui (ver "Ficheiros
alterados" e testes).

`classifyMessageRelevance()` (router híbrido, Fase 8.4) ganhou a mesma
verificação: nenhuma das três frases pedidas contém vocabulário de
`FINANCIAL_ADJACENT_PATTERN` ("compara maio com junho" não tem
nenhuma palavra financeira) — sem este reconhecimento explícito da
forma, cairiam incorretamente em `GENERAL` e nunca chegariam ao
retrieval financeiro.

### Retrieval

`FinancialRetrievalService.retrieve()` resolve filtros (estado/
fornecedor/categoria, Fase 8.4) antes de verificar se a intenção é
`PERIOD_COMPARISON` — nesse caso, chama o novo método privado
`resolvePeriodComparison()` em vez de `resolveDataForPeriod()` (fluxo
de período único), e nunca recupera por histórico (decisão explícita
desta fase). `resolvePeriodComparison()` chama
`resolveFinancialPeriodPair()`, mapeia `MISSING`/`AMBIGUOUS` para os
`kind` já existentes (`PERIOD_MISSING`/`PERIOD_AMBIGUOUS` — nenhum
`kind` novo introduzido), e quando `RESOLVED`, chama
`DashboardService.getFinancialSummary()` duas vezes em paralelo (uma
por período, mesmos filtros combinados aplicados a ambas) e devolve
`kind: 'DATA'` com `current`/`previous`/`comparison`
(`compareAmount()`/`compareCount()`). `retrieveForIntent()` (usado só
pelas AI Tools) teve o parâmetro `intent` estreitado para
`Exclude<FinancialIntentType, 'PERIOD_COMPARISON'>` — sem tool
associada nesta fase, o compilador impede uma chamada com esta
intenção por esse caminho.

### Apresentação ao utilizador

`buildFinancialContextMessage()` desvia para um bloco próprio quando
`data.intent === 'PERIOD_COMPARISON'` — nunca a linha genérica "Período
consultado" (pensada para um único período). Descreve os dois
períodos, os filtros aplicados (Fase 8.4, iguais para ambos os
períodos) e a variação (diferença absoluta, percentual — nunca
`Infinity`/`NaN`, frase explícita "variação percentual não aplicável"
quando o período anterior é zero — e direção traduzida para pt-PT,
nunca `increase`/`decrease`/`unchanged` em inglês). Os valores
apresentados vêm sempre pré-calculados por `compareAmount()`/
`compareCount()` — o LLM só interpreta e apresenta, nunca calcula
nenhuma diferença ou percentagem por conta própria.

## Ficheiros criados

- `apps/frontrest/api/src/dashboard/period-comparison.util.ts`
- `apps/frontrest/api/src/dashboard/period-comparison.util.spec.ts`
- `apps/frontrest/api/src/ai/financial-retrieval/financial-period-pair.resolver.ts`
- `apps/frontrest/api/src/ai/financial-retrieval/financial-period-pair.resolver.spec.ts`
- `docs/phases/phase-8.6-financial-period-comparison-foundation.md`

## Ficheiros alterados

- `apps/frontrest/api/src/reports/reports.service.ts` — `compareAmount()`/
  `compareCount()` substituídos por importação do util partilhado;
  `PeriodComparisonValue` reexportado; sem alteração de comportamento.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.ts` —
  `PERIOD_COMPARISON` adicionado a `FinancialIntentType`; deteção da
  forma de comparação antes de `COMPARISON_PATTERN`.
- `apps/frontrest/api/src/ai/router/financial-relevance.classifier.ts` —
  reconhece a forma de comparação como `FINANCIAL`, independentemente
  de vocabulário financeiro-adjacente.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts` —
  `FinancialIntentData` ganhou o caso `PERIOD_COMPARISON`;
  `resolvePeriodComparison()` novo; `retrieve()` desvia para ele;
  `retrieveForIntent()`/`resolveDataForPeriod()`/`selectData()`
  estreitados para excluir `PERIOD_COMPARISON` do fluxo de período
  único.
- `apps/frontrest/api/src/ai/tools/financial-tool.registry.ts` —
  `TOOL_NAME_TO_INTENT` estreitado para excluir `PERIOD_COMPARISON`
  (sem tool associada nesta fase).
- `apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts` —
  bloco de renderização da comparação.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.spec.ts`,
  `financial-relevance.classifier.spec.ts`,
  `financial-retrieval.service.spec.ts`,
  `financial-context.builder.spec.ts` — testes novos/ajustados (ver
  "Testes").

## Testes

- `period-comparison.util.spec.ts` — `compareAmount()`/`compareCount()`
  isolados: aumento, diminuição, inalterado, período anterior zero
  (`percentageChange: null`, nunca `Infinity`/`NaN`).
- `financial-period-pair.resolver.spec.ts` — `splitComparisonPeriods()`
  e `resolveFinancialPeriodPair()`: as três frases pedidas, mês
  explícito com/sem ano, um lado sem período (`MISSING`), um lado
  ambíguo (`AMBIGUOUS`), independência da data real da máquina.
- `financial-intent.resolver.spec.ts` — as quatro frases de
  `PERIOD_COMPARISON`; regressão explícita ("Compara maio com junho."
  já não está na lista `UNSUPPORTED`); "compara os fornecedores" sem a
  forma exata continua `UNSUPPORTED`; documentado (e testado) que
  "compara a categoria X com a categoria Y" resolve a intenção a este
  nível — a garantia de nunca fabricar dados está na resolução do par,
  não aqui.
- `financial-relevance.classifier.spec.ts` — as três frases pedidas
  classificadas `FINANCIAL` apesar de não terem vocabulário
  financeiro-adjacente.
- `financial-retrieval.service.spec.ts` — `DashboardService` chamado
  duas vezes com os períodos corretos; filtros aplicados aos dois
  períodos; período anterior zero; comparação de categorias (fora do
  âmbito) devolve `PERIOD_MISSING`, nunca dados fabricados; nunca
  recupera por histórico; erro do `DashboardService` devolve `ERROR`.
- `financial-context.builder.spec.ts` — bloco de comparação nunca usa a
  linha genérica de período único; diferença/percentagem/direção em
  pt-PT; período anterior zero nunca expõe `Infinity`/`NaN`; filtros
  aplicados.
- `reports.service.spec.ts` — inalterado, todos os testes de
  "comparação" continuam a passar sem modificação (confirma a extração
  do util partilhado sem regressão).

## Comandos de validação executados

- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm -w typecheck` (14 packages) — limpo.
- `pnpm --filter @frontrest/api build` e `pnpm -w build` (18 tasks,
  incluindo `@frontrest/web`) — limpo.
- `pnpm --filter @frontrest/api test` — 43 suites, 735 testes, todos a
  passar.
- `pnpm -w test` — 18 tasks, todos a passar.
- `pnpm --filter @frontrest/api test:e2e` — 9 suites, 143 testes,
  todos a passar.

## Validação manual (Docker, `POST /api/ai/chat` real)

Imagem `frontcore-api` reconstruída (`docker compose build api`) e
recriada (`docker compose up -d api`) com o código desta fase.
Autorização explícita do utilizador obtida antes de usar
`AI_PROVIDER=openrouter` (`google/gemini-2.5-flash`), já configurado no
ambiente — mesma prática da Fase 8.2.

- `"Compara maio com junho."` → resposta real descreve os dois períodos
  (0.00 EUR em ambos, dados reais da organização de demonstração) e
  conclui corretamente "não há diferença entre os dois meses".
- `"Compara janeiro com fevereiro."` → resposta real, ambos os
  períodos corretamente identificados.
- `"Este mês versus o mês passado."` → resposta real identifica
  corretamente julho de 2026 (atual) e junho de 2026 (anterior),
  diferenças de valor e contagem apresentadas.
- `"Compara a categoria Hosting com a Manutenção."` (fora do âmbito) →
  resposta determinística a pedir um período concreto — nunca uma
  comparação fabricada entre categorias.
- Regressão: `"Quanto gastei este mês?"` (consulta normal, não
  comparação) e `"Qual é a capital de Portugal?"` (geral) continuam a
  responder corretamente.

Organização de demonstração sem faturas nos períodos testados
(`totalAmount: 0.00` em todos) — validação confirma a integração real
(router → intenção → resolução dos dois períodos → duas queries
Prisma reais → texto de contexto → resposta de um LLM real), não os
valores aritméticos em si (já exaustivamente cobertos pelos testes
automatizados acima com dados variados).

## Limitações conhecidas

- A forma sintática suportada é fixa: "compara X com Y" (com o verbo
  explícito) ou "X versus/vs Y" — uma fraseação totalmente distinta
  (ex. "diferença entre maio e junho") não é reconhecida. Mesma
  disciplina determinística das fases anteriores, nunca uma
  correspondência semântica.
- `resolveFinancialIntent()` não distingue, à sua própria camada, uma
  comparação de períodos de uma comparação de entidades com a mesma
  forma sintática ("compara X com Y") — a distinção acontece só na
  resolução do par (`resolveFinancialPeriodPair()`), nunca fabricando
  dados quando X/Y não são períodos. Documentado e testado
  explicitamente (ver "Testes").
- Validação manual executada contra uma organização sem faturas nos
  períodos testados — os valores de variação (aumento/diminuição
  reais, não só "inalterado") não foram observados manualmente contra
  dados reais nesta fase, só nos testes automatizados.

## Fora do âmbito (confirmado, não implementado)

Comparação relativa a contexto conversacional (ex. "e comparado com o
mês passado?", sem os dois períodos nomeados na mesma mensagem); tool
`compare_periods`; alterações ao Dashboard; alterações ao schema
Prisma; alterações ao frontend; alterações a providers; alterações ao
OCR; comparação entre fornecedores; comparação entre categorias;
comparação de mais de dois períodos.

## Critérios de conclusão

- [x] "Compara maio com junho" funciona (validado com dados reais).
- [x] "Janeiro versus fevereiro" funciona (validado com dados reais).
- [x] "Este mês versus mês passado" funciona (validado com dados
      reais).
- [x] Os filtros (estado/fornecedor/categoria) continuam a funcionar,
      aplicados aos dois períodos.
- [x] Sem regressões nas fases anteriores (735 testes unitários + 143
      e2e, mais validação manual real de consultas não-comparação e
      geral).
- [x] `ReportsService`/Relatórios continuam exatamente iguais (testes
      de "comparação" de `reports.service.spec.ts` inalterados,
      todos a passar).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos (app e
      workspace completo).
- [x] Validação manual via `POST /api/ai/chat` (Docker, OpenRouter
      real, autorizado explicitamente).
- [x] A comparação financeira é produzida exclusivamente a partir dos
      dados estruturados existentes — o LLM nunca calcula diferenças,
      percentagens ou totais; só interpreta e apresenta o que
      `compareAmount()`/`compareCount()` já calcularam.

## Próxima fase

Nenhuma candidata formalmente registada. Comparação relativa a
contexto conversacional ("e comparado com o mês passado?", sem os dois
períodos na mesma mensagem) e a tool `compare_periods` ficam como
ideias para uma fase futura, não decididas nem aprovadas aqui.
