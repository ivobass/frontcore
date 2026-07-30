# Phase 8.11 — Dashboard Financial Analysis Integration Foundation

## Objetivo

Integrar o Financial Analysis Engine (Fase 8.10) no Dashboard como
primeiro consumidor real, apresentando conclusões determinísticas e as
respetivas evidências, sem alterar `financial-insights/`, Reports ou
AI Chat.

## Estado inicial

`financial-analysis/` (Fase 8.10) existia como módulo produzido mas sem
nenhum consumidor real — nenhum controller, serviço ou página o
importava. `DashboardController`/`DashboardService` já continham o
padrão de composição para `GET /dashboard/financial-insights` (Fase
8.9), mas diretamente no controller (`Promise.all` + `buildFinancialInsights()`
ali mesmo, sem passar pelo `DashboardService`) — precedente que esta
fase decidiu não seguir.

## Arquitetura implementada

Novo endpoint aditivo `GET /dashboard/financial-analysis`, com
responsabilidades por camada explicitamente separadas:

- **`DashboardController`** — só HTTP: recebe o pedido, obtém
  `organizationId` exclusivamente de `CurrentUser`, delega em
  `DashboardService.getFinancialAnalysis()`, devolve
  `DashboardFinancialAnalysisResponse`. Não constrói `FinancialInsights`,
  não seleciona análises, não executa `runFinancialAnalyses()` — ao
  contrário do endpoint irmão `financial-insights`, que continua a
  compor diretamente no controller (assimetria aceite conscientemente,
  ver "Decisões arquiteturais").
- **`DashboardService.getFinancialAnalysis()`** (novo método, serviço
  existente, nenhum serviço NestJS novo) — corre
  `getFinancialSummary()`/`getLargestInvoices()` em paralelo
  (`Promise.all`), constrói `FinancialInsights` uma única vez
  (`buildFinancialInsights()`), seleciona explicitamente
  `monthlyTrendAnalysis`/`relativeConcentrationAnalysis`
  (`REGISTERED_FINANCIAL_ANALYSES`, conjunto fechado) e executa
  `runFinancialAnalyses()`; devolve `{ insights, analysis }`.
- **Frontend** — a página `/dashboard` substituiu integralmente o
  pedido a `getFinancialInsights()` por `getDashboardFinancialAnalysis()`;
  continua a apresentar o card "Destaques" (agora a partir de
  `financialAnalysis.insights`) e ganha uma nova secção "Análise
  financeira" (`FinancialAnalysisSection`), que só rotula/apresenta
  `id`/`conclusion`/evidência já devolvidos — nunca recalcula, nunca
  infere, omite o que não é aplicável (o motor já só devolve o
  aplicável). Uma falha no novo pedido nunca bloqueia o resumo
  principal (`.catch(() => null)`, mesmo padrão já usado para o
  pedido anterior).

## Componentes criados

- `apps/frontrest/web/app/(dashboard)/dashboard/financial-analysis-section.tsx`
- `docs/phases/phase-8.11-dashboard-financial-analysis-integration-foundation.md`

## Categorias criadas

Não aplicável — sem componentes de Design System (`packages/ui`) nesta fase.

## Dependências introduzidas

Nenhuma. `DashboardService` passa a importar `financial-insights/` e
`financial-analysis/` (ambos módulos de funções puras, já existentes,
sem provider NestJS) — nenhuma dependência de injeção nova.

## Decisões arquiteturais

- **Controller fino, composição no serviço** — decisão obrigatória do
  Product Owner, aplicada apesar do precedente existente
  (`financial-insights`) compor diretamente no controller. Assimetria
  registada como conhecida, não corrigida nesta fase (fora do âmbito
  tocar em `financial-insights`).
- **Sem serviço NestJS novo** — `getFinancialAnalysis()` é um método a
  mais em `DashboardService`, não um `FinancialAnalysisService`
  separado; não há necessidade concreta de um segundo consumidor de
  injeção que o justifique.
- **Frontend com exatamente dois pedidos** — `getFinancialInsights()`
  foi **substituído**, não somado, por `getDashboardFinancialAnalysis()`;
  a página nunca chama o endpoint antigo de insights, apenas o novo,
  que já devolve `insights` dentro da mesma resposta. Correção
  registada durante o planeamento: uma formulação anterior, que
  descrevia isto como uma 3ª/4ª execução por carregamento de página,
  estava incorreta — o pedido à página não aumenta, só o endpoint que
  ela chama muda.
- **Duplicação operacional pré-existente, não agravada** — `getFinancialSummary()`
  continua a ser executado duas vezes por carregamento de página (uma
  vez diretamente, outra dentro de `getFinancialAnalysis()`), exatamente
  a mesma limitação já registada na Fase 8.9; esta fase não a resolve
  nem a piora.

## ADRs respeitadas

Nenhuma ADR nova — reutiliza a arquitetura já decidida em ADR-0007
(padrão de composição) e ADR-0008 (separação Financial Insights/
Financial Analysis Engine/consumidores), sem nenhuma decisão estrutural
nova nesta fase.

## Validações efetuadas

- `pnpm --filter api typecheck`
- `pnpm --filter api test`
- `pnpm --filter api build`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm docs:validate`

## Resultado final

Dashboard é o primeiro consumidor real do Financial Analysis Engine.
`financial-insights/`, `financial-analysis/`, Reports e AI Chat
permanecem inalterados. A página `/dashboard` continua com exatamente
dois pedidos em paralelo.

## Critérios de conclusão

- [x] Dashboard é o primeiro consumidor real.
- [x] `FinancialInsights` permanece inalterado.
- [x] `financial-analysis/` continua independente de Dashboard e HTTP
      (nenhuma alteração ao módulo).
- [x] Factos e conclusões permanecem separados na resposta (`insights`/`analysis`).
- [x] `GET /dashboard/financial-insights` continua compatível (inalterado).
- [x] Nenhuma nova query Prisma.
- [x] Nenhum terceiro pedido introduzido pela página.
- [x] Evidências apresentadas sem recálculo no frontend.
- [x] Multi-tenancy confirmado por e2e (organizationId exclusivamente de `CurrentUser`).
- [x] `typecheck`/lint/testes/build/documentação — todos passam.

## Observações para fases futuras

- **Problema encontrado**: `getFinancialSummary()` é executado duas
  vezes por carregamento de página (`/dashboard/financial-summary`
  diretamente, e novamente dentro de `getFinancialAnalysis()`).
  **Impacto**: custo de agregação duplicado por pedido, sem afetar
  correção. **Sugestão**: um novo endpoint composto que devolva
  `summary`+`insights`+`analysis` numa só resposta, ou um mecanismo de
  cache por pedido — nenhuma das duas avaliada em detalhe nesta fase.
  **Prioridade**: Baixa (mesma limitação já registada, sem agravamento).
- **Problema encontrado**: assimetria entre `GET /dashboard/financial-insights`
  (compõe no controller) e `GET /dashboard/financial-analysis` (compõe
  no serviço). **Impacto**: inconsistência de padrão dentro do mesmo
  controller. **Sugestão**: avaliar, em fase futura, mover a composição
  de `financial-insights` para o serviço também, por consistência —
  nunca como correção "de passagem" nesta fase. **Prioridade**: Baixa.

## Próxima fase

Sequência já anunciada pelo Product Owner: Fase 8.12 (Reports Financial
Analysis Integration), Fase 8.13 (Grounded AI Financial Analysis
Integration) — nenhuma das duas iniciada nesta fase.
