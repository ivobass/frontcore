# Phase 8.12 — Reports Financial Analysis Integration Foundation

## Objetivo

Integrar o Financial Analysis Engine (Fase 8.10) nos relatórios
mensais, tornando Reports no **segundo consumidor real** do motor —
Dashboard (Fase 8.11) continua a ser o primeiro. AI Chat permanece
reservado para a Fase 8.13.

## Estado inicial

`ReportsService.getMonthlyReport()` já construía `FinancialInsights`
diretamente no serviço (`buildFinancialInsights(summary, largest.invoices)`),
ao contrário do endpoint `financial-insights` do Dashboard (que compõe
no controller) — Reports já seguia, antes desta fase, o padrão de
composição no serviço que a Fase 8.11 exigiu para o Dashboard. Não foi
necessária nenhuma correção de camada, só uma extensão.

## Arquitetura implementada

- **`ReportsService.getMonthlyReport()`** — constrói `FinancialInsights`
  uma única vez (inalterado) e, logo a seguir, executa
  `runFinancialAnalyses()` sobre esses mesmos insights, com uma seleção
  explícita e **própria deste módulo** —
  `REPORTS_FINANCIAL_ANALYSES = [monthlyTrendAnalysis, relativeConcentrationAnalysis]`,
  uma constante distinta da usada pelo `DashboardService`
  (`dashboard.service.ts`, Fase 8.11): cada consumidor do motor declara
  o seu próprio array, não existe nenhum registo global/default
  partilhado.
- **`MonthlyFinancialReport`** ganha `analysis: FinancialAnalysisEngineOutput`,
  sempre presente (nunca opcional) — mesmo sem nenhuma conclusão
  aplicável, `analysis.results` é `[]`, nunca o campo omitido. `insights`
  permanece como estava (opcional, por tolerância já registada na Fase
  8.9) — os dois contratos continuam separados, nunca fundidos.
- **`ReportsController`** — inalterado; os três formatos (`monthly`,
  `monthly.csv`, `monthly.pdf`) já delegavam em `getMonthlyReport()`,
  logo herdam `analysis` automaticamente.
- **`csv.serializer.ts`/`pdf.serializer.ts`** — nova secção "Análise
  financeira", com rótulos de conclusão próprios de cada serializer
  (duplicados deliberadamente, mesma disciplina já usada para
  `STATUS_LABELS` entre os dois ficheiros); apresentam exclusivamente
  `id`/`conclusion`/`evidence` já devolvidos pelo motor — nunca
  recalculam montantes, aplicam limiares ou inferem conclusões. Quando
  `analysis.results` está vazio, uma mensagem explícita
  ("Sem conclusões aplicáveis neste período.") — nunca omissão
  silenciosa da secção.
- **Frontend `/reports`** — novo componente próprio da área Reports,
  `financial-analysis-section.tsx`, **sem importar nem reutilizar** o
  `FinancialAnalysisSection` do Dashboard (decisão explícita do Product
  Owner — evita acoplar as duas áreas através de um componente
  partilhado nunca pedido); apresenta a mesma ordem já existente (dados
  do relatório → Destaques/Financial Insights → Análise financeira),
  logo após o card "Destaques"; `null` quando `analysis.results` está
  vazio, mesmo comportamento já adotado pela secção equivalente do
  Dashboard.

## Componentes criados

- `apps/frontrest/web/app/(dashboard)/reports/financial-analysis-section.tsx`
- `docs/phases/phase-8.12-reports-financial-analysis-integration-foundation.md`

## Categorias criadas

Não aplicável — sem componentes de Design System (`packages/ui`) nesta fase.

## Dependências introduzidas

Nenhuma. `ReportsService` passa a importar `financial-analysis/`
(módulo de funções puras, já existente, sem provider NestJS) —
nenhuma dependência de injeção nova.

## Decisões arquiteturais

- **Seleção de análises própria de Reports** — `REPORTS_FINANCIAL_ANALYSES`
  não é partilhada com a constante equivalente do Dashboard; cada
  consumidor escolhe explicitamente o seu array (esclarecido antes
  desta fase, confirmado como não sendo um registo global implícito).
- **`analysis` obrigatório, nunca opcional** — ao contrário de
  `insights?` (tolerância a respostas antigas, Fase 8.9), `analysis` é
  introduzido já como campo obrigatório em ambos os contratos
  (backend/frontend), porque a API nunca o omite — decisão explícita
  do Product Owner, para não replicar uma tolerância desnecessária a
  um campo que nasce já sempre presente.
- **Componente de Reports independente do Dashboard** — duplicação
  deliberada de um pequeno componente de apresentação, em vez de
  extrair uma abstração partilhada; decisão explícita do Product Owner,
  para não acoplar Reports e Dashboard através de um componente que
  nenhuma das duas fases pediu.
- **Sem ADR nova** — nenhuma decisão estrutural nova; reutiliza
  integralmente a arquitetura de ADR-0007/ADR-0008.

## ADRs respeitadas

- **ADR-0008** — separação Financial Insights/Financial Analysis
  Engine/consumidores mantida; Reports não recalcula, não infere, não
  duplica lógica financeira.
- **ADR-0007** — precedente estrutural do motor genérico, sem alteração.

## Validações efetuadas

- `pnpm --filter api typecheck`
- `pnpm --filter api test`
- `pnpm --filter api test:e2e`
- `pnpm --filter api build`
- `pnpm --filter api lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter web lint`
- `pnpm docs:validate`

## Resultado final

Reports é o segundo consumidor real do Financial Analysis Engine.
Dashboard continua a ser o primeiro. `financial-insights/`,
`financial-analysis/` e Dashboard permanecem inalterados. JSON, CSV,
PDF e o frontend de `/reports` apresentam o mesmo contrato-base
(`insights`/`analysis` separados), sem recálculo em nenhuma camada.

## Critérios de conclusão

- [x] `MonthlyFinancialReport` devolve `insights` e `analysis` separados.
- [x] O motor é executado uma vez por relatório, sobre os insights já calculados.
- [x] JSON, CSV, PDF e `/reports` apresentam as conclusões e evidências sem recálculo.
- [x] Nenhuma nova query financeira introduzida.
- [x] Testes, typecheck, lint, build, e2e e `pnpm docs:validate` passam.

## Observações para fases futuras

- **Problema encontrado**: Reports e Dashboard duplicam agora, cada um
  com a sua própria constante, a mesma lista de duas análises
  (`monthlyTrendAnalysis`, `relativeConcentrationAnalysis`).
  **Impacto**: nenhum funcional — é a consequência direta e aceite da
  decisão de "cada consumidor escolhe explicitamente o seu array".
  **Sugestão**: nenhuma ação recomendada enquanto só existirem dois
  consumidores com a mesma seleção — reavaliar apenas se um terceiro
  consumidor (Fase 8.13, AI Chat) tornar a duplicação genuinamente
  incômoda. **Prioridade**: Baixa.
- **Problema encontrado**: `financial-analysis-section.tsx` existe
  agora em duplicado — um em `dashboard/`, outro em `reports/` —
  por decisão explícita de não partilhar. **Impacto**: manutenção de
  rótulos pt-PT em três sítios (dois componentes frontend + serializers
  backend). **Sugestão**: só extrair uma abstração partilhada se um
  terceiro consumidor frontend precisar da mesma apresentação — nunca
  antecipadamente. **Prioridade**: Baixa.

## Próxima fase

Fase 8.13 — Grounded AI Financial Analysis Integration (AI Chat como
terceiro consumidor), já anunciada, não iniciada nesta fase.
