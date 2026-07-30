# Phase 8.13 — Grounded AI Financial Analysis Integration

## Objetivo

Tornar o AI Chat o terceiro consumidor real do Financial Analysis
Engine (Fase 8.10), depois do Dashboard (Fase 8.11) e Reports (Fase
8.12), mantendo integralmente as garantias de Strict Grounding
introduzidas na Fase 8.8 — nenhuma conclusão ou evidência chega à
resposta final sem passar pela mesma fronteira determinística já
aplicada aos dados existentes.

## Estado inicial

`FinancialRetrievalService.resolveDataForPeriod()` já era o único
ponto de construção de `FINANCIAL_SUMMARY` — partilhado pelo caminho
direto (`retrieve()`) e pelo caminho de tool calling
(`retrieveForIntent()`, usado por `AiToolOrchestratorService`).
`buildFinancialContextMessage()`/`validateFinancialGrounding()` já
isolavam um bloco próprio para `FINANCIAL_SUMMARY`
(`buildInsightsLines()`/`collectInsightFacts()`, Fase 8.9). Nenhum dos
dois conhecia `financial-analysis/`.

## Arquitetura implementada

- **`FinancialRetrievalService`** — `FinancialIntentData`'s
  `FINANCIAL_SUMMARY` ganha `analysis: FinancialAnalysisEngineOutput`,
  sempre presente. `resolveDataForPeriod()` constrói `insights` uma
  única vez e executa `runFinancialAnalyses()` uma única vez sobre
  esses mesmos insights, com uma seleção própria
  (`AI_CHAT_FINANCIAL_ANALYSES = [monthlyTrendAnalysis,
  relativeConcentrationAnalysis]`) — distinta das seleções equivalentes
  do Dashboard e de Reports; nenhum registo global partilhado entre os
  três consumidores. Por este método ser partilhado pelos dois
  caminhos de invocação, o caminho de tool calling herda `analysis`
  automaticamente, sem nenhuma alteração a
  `AiToolOrchestratorService`.
- **`buildFinancialContextMessage()`** — nova `buildAnalysisLines()`,
  chamada dentro do bloco `FINANCIAL_SUMMARY` (mesmo ramo de
  `buildInsightsLines()`, nunca no ramo "sem faturas", mesma disciplina
  já aplicada aos Financial Insights). Cada conclusão vira uma linha
  própria (`"<título>: <conclusão> (<evidência>)."`); quando
  `analysis.results` está vazio, uma linha explícita
  ("Análise financeira: sem conclusões aplicáveis neste período.") —
  nunca omissão silenciosa.
- **`validateFinancialGrounding()`** — **sem alteração funcional**.
  Confirmado e documentado por comentário: a evidência de
  `monthlyTrendAnalysis`/`relativeConcentrationAnalysis` é sempre uma
  cópia verbatim de campos já presentes em `insights`
  (`trend.comparison`, `supplierConcentration.share`,
  `categoryConcentration.share` — decisão de desenho da Fase 8.10), por
  isso `collectInsightFacts()` já autoriza qualquer valor/percentagem
  que a análise possa introduzir. `collectAnalysisFacts()` não foi
  criada (YAGNI, decisão explícita do Product Owner) — só se
  justificaria se uma análise futura produzisse evidência que não fosse
  um subconjunto de `insights`.
- **Tool calling** — nenhuma alteração a `AiToolOrchestratorService`:
  continua a reutilizar exclusivamente `FinancialRetrievalService`,
  `buildFinancialContextMessage()` e `validateFinancialGrounding()`,
  exatamente como antes desta fase. O motor nunca é executado no
  orquestrador.

## Componentes criados

- `docs/phases/phase-8.13-grounded-ai-financial-analysis-integration.md`

Nenhum ficheiro de produção novo — só extensões a `financial-retrieval.service.ts`
e `financial-context.builder.ts`, e um comentário em
`financial-grounding.validator.ts`.

## Dependências introduzidas

Nenhuma. `financial-retrieval.service.ts`/`financial-context.builder.ts`
passam a importar `financial-analysis/` (funções puras, já existentes).

## Decisões arquiteturais

- **Seleção própria do AI Chat** — `AI_CHAT_FINANCIAL_ANALYSES` é uma
  terceira constante independente, ao lado das de Dashboard e Reports;
  confirma, pela terceira vez, que não existe nem nunca existiu um
  registo global de análises no motor.
- **`collectAnalysisFacts()` não criada (YAGNI)** — decisão explícita
  do Product Owner: só criar quando a informação não estiver já
  completamente coberta por `collectInsightFacts()`. Documentado no
  código, não só aqui, para a decisão sobreviver a uma leitura futura
  sem o histórico desta conversa.
- **`buildAnalysisLines()` nunca corre no ramo "sem faturas"** — mesma
  disciplina já aplicada a `buildInsightsLines()` (Fase 8.9): um
  período sem nenhuma fatura confirmada colapsa para uma única linha
  ("Sem faturas confirmadas neste período."), sem destaques nem
  análise — não uma inconsistência nova desta fase.
- **Nenhuma alteração ao orquestrador de tools** — confirmado por
  leitura direta do código antes de implementar: `retrieveForIntent()`
  já é o único ponto de entrada usado pelas tools, e já delega em
  `resolveDataForPeriod()`, o mesmo método estendido nesta fase.

## ADRs respeitadas

Nenhuma ADR nova. Reutiliza integralmente ADR-0007 (motor genérico) e
ADR-0008 (separação Financial Insights/Financial Analysis
Engine/consumidores) — AI Chat torna-se o terceiro consumidor
documentado, sem alterar nenhuma das duas decisões.

## Validações efetuadas

- `pnpm --filter api typecheck`
- `pnpm --filter api test`
- `pnpm --filter api test:e2e`
- `pnpm --filter api lint`
- `pnpm --filter api build`
- `pnpm docs:validate`

## Resultado final

AI Chat é o terceiro consumidor real do Financial Analysis Engine.
`FINANCIAL_SUMMARY` devolve `totals`, `insights` e `analysis`
separados, sempre presentes. As conclusões e evidências chegam ao
provider (como dados) e ao fallback determinístico (como resposta),
nos dois caminhos (direto e tool calling), com as mesmas garantias de
Strict Grounding já existentes. Dashboard, Reports e
`financial-insights/`/`financial-analysis/` permanecem inalterados.

## Critérios de conclusão

- [x] AI Chat é o terceiro consumidor do Financial Analysis Engine.
- [x] `FINANCIAL_SUMMARY` devolve `totals`, `insights` e `analysis` separados.
- [x] Insights e análises são calculados uma única vez, sem queries novas.
- [x] Conclusões e evidências chegam ao provider e ao fallback determinístico.
- [x] Strict Grounding valida deterministicamente todo o novo conteúdo
      (via `collectInsightFacts()`, já suficiente — sem nova função).
- [x] Os caminhos direto e tool calling mantêm as mesmas garantias.
- [x] Testes, typecheck, e2e, lint, build e `pnpm docs:validate` passam.

## Observações para fases futuras

- **Problema encontrado**: nenhum. `collectAnalysisFacts()` foi
  avaliada e conscientemente não criada — não é dívida técnica, é uma
  decisão YAGNI documentada.
- **Problema encontrado**: `AI_CHAT_FINANCIAL_ANALYSES` é a terceira
  cópia da mesma seleção de duas análises (Dashboard, Reports, AI
  Chat). **Impacto**: nenhum funcional. **Sugestão**: reavaliar só se
  uma futura Fase de consolidação achar a duplicação genuinamente
  incómoda — nunca extrair uma abstração partilhada antecipadamente.
  **Prioridade**: Baixa.

## Próxima fase

Não anunciada nesta fase — os três consumidores planeados
(Dashboard, Reports, AI Chat) estão agora integrados.
