# Phase 8.10 — Financial Analysis Engine Foundation

## Objetivo

Fundação de um motor determinístico de análise financeira,
`apps/frontrest/api/src/financial-analysis/`, que consome os factos e
métricas já produzidos por `financial-insights/` (Fase 8.9) e gera
conclusões estruturadas, tipadas e rastreáveis, acompanhadas da
evidência numérica que as sustenta — sem alterar `financial-insights/`,
sem introduzir novas métricas, agregações ou queries, e sem integração
ainda em nenhum consumidor (AI Chat, Dashboard, Reports).

## Estado inicial

`financial-insights/` (Fase 8.9) produzia `FinancialInsights` — factos
e métricas puros (ranking de fornecedores/categorias, concentração,
saldo por pagar, maior fatura/fornecedor/categoria, tendência mensal) —
sem nenhuma noção de "conclusão" nem de evidência rastreável associada
a uma interpretação. Não existia nenhuma camada que traduzisse esses
factos em afirmações determinísticas explicáveis; cada consumidor
(Chat, Dashboard, Reports) apresentava os números diretamente, sem
nenhuma interpretação intermédia partilhada.

## Arquitetura implementada

Três níveis explicitamente separados (ver ADR-0008):

1. **Financial Insights** (`financial-insights/`, inalterado) — produz
   factos e métricas.
2. **Financial Analysis Engine** (`financial-analysis/`, novo) —
   interpreta esses factos e produz conclusões determinísticas
   suportadas por evidências.
3. **Consumidores** (AI Chat, Dashboard, Reports) — apresentação
   apenas; nenhum integrado nesta fundação.

`financial-analysis/` é um módulo único (não dividido em package nem
em mais do que um módulo de app), irmão de topo de `financial-insights/`
em `apps/frontrest/api/src/`, contendo:

- **Contrato genérico** (`contracts/financial-analysis.ts`) —
  `FinancialAnalysis<TId, TConclusion, TEvidence>`/
  `FinancialAnalysisResult<TId, TConclusion, TEvidence>`: `analyze()`
  síncrono sobre `FinancialInsights`, devolve uma conclusão tipada com
  evidência ou `null` quando não aplicável.
- **Motor de composição** (`financial-analysis.engine.ts`) —
  `runFinancialAnalyses()` corre cada análise registada de forma
  independente sobre o mesmo `FinancialInsights` e agrega só os
  resultados não nulos; metadata puramente determinística
  (`analysesRun: readonly FinancialAnalysisId[]`,
  `conclusionsProduced`), sem `processingTimeMs` nem qualquer valor
  dependente do momento de execução.
- **União discriminada fechada** (`types/financial-analysis-outcome.ts`)
  — `FinancialAnalysisOutcome`/`RegisteredFinancialAnalysis` (correção
  pós-revisão; nome anterior, `AnyFinancialAnalysis`, sugeria abertura
  que o tipo nunca teve) fecham exatamente os resultados/análises
  aprovados nesta fase; uma análise nova acrescenta um membro
  explícito, nunca reabre a união para `string`/`unknown`.
  `FinancialAnalysisId = FinancialAnalysisOutcome['id']` fecha também o
  `id` usado em `analysesRun`, nunca `string` livre.
- **Duas análises concretas** (`analyses/`):
  - `monthly_trend` — reutiliza exclusivamente o `TrendComparison` já
    produzido por `resolveTrend()` (Fase 8.9);
    `increase`/`decrease`/`unchanged`, ou `null` quando não existe
    comparação válida (menos de 2 meses com dados, ou meses não
    consecutivos).
  - `relative_concentration` — compara `supplierConcentration.share`
    com `categoryConcentration.share` via `Prisma.Decimal`, sem limiar
    nem regra financeira nova; só aplicável quando ambos os `share`
    existem e ambos os `topN` efetivos são iguais;
    `supplier_more_concentrated`/`category_more_concentrated`/
    `equally_concentrated`, ou `null` caso contrário.

Nenhum acesso a Prisma, a `DashboardService` ou a qualquer serviço —
cada análise recebe sempre `FinancialInsights` já construído.

## Componentes criados

- `apps/frontrest/api/src/financial-analysis/contracts/financial-analysis.ts`
- `apps/frontrest/api/src/financial-analysis/contracts/index.ts`
- `apps/frontrest/api/src/financial-analysis/types/financial-analysis-outcome.ts`
- `apps/frontrest/api/src/financial-analysis/types/financial-analysis-metadata.ts`
- `apps/frontrest/api/src/financial-analysis/types/index.ts`
- `apps/frontrest/api/src/financial-analysis/analyses/monthly-trend.analysis.ts` (+ `.spec.ts`)
- `apps/frontrest/api/src/financial-analysis/analyses/relative-concentration.analysis.ts` (+ `.spec.ts`)
- `apps/frontrest/api/src/financial-analysis/financial-analysis.engine.ts` (+ `.spec.ts`)
- `apps/frontrest/api/src/financial-analysis/index.ts`

## Categorias criadas

Não aplicável — sem componentes de Design System (`packages/ui`) nesta fase.

## Dependências introduzidas

Nenhuma. Reutiliza `@frontcore/database` (`Prisma.Decimal`, já usado
por `financial-insights/`) e os tipos já existentes de
`financial-insights/`.

## Decisões arquiteturais

- Módulo único (contrato + motor + análises + tipos + testes juntos),
  não dividido em dois módulos — ver ADR-0008, secção "Critério para
  uma futura divisão interna".
- `analyze()` síncrono, divergindo deliberadamente de `extract()`
  (`document-extraction/`, `async`) — sem I/O nem geração por LLM
  nesta fundação.
- Sem resolução de conflitos no motor — cada análise tem o seu próprio
  `id`, nunca compete com outra pelo mesmo resultado.
- `relative_concentration` nunca usa um limiar fixo — a decisão
  explícita do Product Owner foi excluir qualquer regra de negócio
  nova desta fundação; a conclusão é puramente relacional (qual dos
  dois eixos concentra mais).
- `monthly_trend` nunca produz uma conclusão `insufficient_data` — a
  ausência de comparação válida devolve `null` (não aplicável), não uma
  conclusão financeira fabricada.

## ADRs respeitadas

- **ADR-0008** (nova, esta fase) — separação Financial Insights/
  Financial Analysis Engine/consumidores; módulo único; colocação de
  topo; exclusão de `ai/`; critério de divisão futura.
- **ADR-0007** — precedente estrutural para "contrato genérico + motor
  de composição" (`document-extraction/`), com as divergências
  deliberadas documentadas acima (síncrono, sem resolução de
  conflitos, união fechada em vez de `TField` aberto).

## Validações efetuadas

- `pnpm --filter api typecheck`
- `pnpm --filter api test` (specs novos de `financial-analysis/` + suite
  completa de `financial-insights/`, confirmando zero regressão)
- `pnpm --filter api build`
- `pnpm docs:validate`

## Resultado final

Módulo `financial-analysis/` implementado, testado e isolado — produz
conclusões determinísticas a partir de `FinancialInsights`, sem
qualquer integração em Chat, Dashboard ou Reports nesta fase.
`financial-insights/` permanece exatamente como a Fase 8.9 o deixou.

## Critérios de conclusão

- [x] `financial-analysis/` criado com contrato, motor, tipos e as duas
      análises aprovadas.
- [x] `FinancialAnalysisOutcome` fecha exatamente os dois membros
      aprovados — sem `string`/`unknown` no resultado agregado.
- [x] Motor sem `processingTimeMs` nem qualquer valor não determinístico.
- [x] `monthly_trend` e `relative_concentration` implementadas
      exatamente conforme o comportamento aprovado, incluindo a regra
      de `topN` efetivo igual.
- [x] `financial-insights/` inalterado — zero alteração ao seu
      contrato, tipos, exports ou testes.
- [x] Nenhuma alteração ao schema Prisma; nenhuma nova query.
- [x] Nenhuma integração com Chat/Dashboard/Reports nesta fase.
- [x] Testes unitários cobrindo todos os ramos descritos, incluindo os
      `null` de ambas as análises.
- [x] ADR 0008 criado.
- [x] Documento de fase e índices atualizados.
- [x] `typecheck`/`lint`/`build`/`test` limpos.

## Observações para fases futuras

- **Problema encontrado**: sem consumidor real, `financial-analysis/`
  não valida ainda a sua reutilização prática por Chat/Dashboard/Reports.
  **Impacto**: a fundação demonstra o contrato, mas não a integração.
  **Sugestão**: uma fase futura dedicada à integração num primeiro
  consumidor real (candidato mais simples: Dashboard, já consumidor de
  `financial-insights/`). **Prioridade**: Média.
- **Problema encontrado**: apenas duas análises concretas existem;
  aging de faturas, rankings completos, forecasting, scoring e
  recomendações prescritivas ficaram fora, por decisão explícita.
  **Impacto**: cobertura funcional mínima, não representativa do valor
  final do motor. **Sugestão**: avaliar caso a caso, em fases futuras,
  quais dessas capacidades justificam uma análise nova — nunca por
  contagem, sempre por necessidade concreta de um consumidor real (ver
  ADR-0008). **Prioridade**: Baixa.

## Próxima fase

Não decidida nesta fase — candidata natural: integração do motor num
primeiro consumidor real (Dashboard ou Chat), a confirmar em
Analysis/Planning Mode antes de qualquer implementação.
