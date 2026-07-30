# Fase 8.9 — Financial Insights Foundation

## Objetivo

Camada determinística de **Financial Insights** — conclusões derivadas
(concentração, ranking, saldo por pagar, maior fatura/fornecedor/
categoria, direção de tendência) calculadas uma única vez a partir do
`FinancialDashboardSummary`/`LargestInvoice[]` já existentes (Fases 7/
8.4), reutilizadas sem duplicação por três consumidores reais: Chat IA
(Fase 8.1, intenção `FINANCIAL_SUMMARY`), Dashboard (novo endpoint) e
Reports (Fase 9, `MonthlyFinancialReport`). Os Reports apresentam estes
insights — nunca são o objetivo da fase.

## Estado inicial

`DashboardService.getFinancialSummary()`/`getLargestInvoices()` (Fase
7/8.4) já eram a única fonte de agregação financeira, chamada por
`FinancialRetrievalService` (Chat), `ReportsService` (Fase 9) e
`AiToolOrchestratorService` (via `retrieveForIntent()`). Nenhuma
percentagem, concentração, ranking com posição ou tendência com direção
era calculada em lado nenhum — `topSuppliers`/`byCategory` já vinham
ordenados desc (Fase 8.4), mas sem `share`; "saldo por pagar" só
existia, duplicado internamente, dentro de
`FinancialRetrievalService.selectOutstanding()` (privado, só o Chat);
"maior fatura" (`getLargestInvoices()`) só era usada pela tool
`get_largest_expenses`, nunca por Dashboard/Reports.

## Arquitetura implementada

### Contrato separado — `FinancialInsights`

`apps/frontrest/api/src/financial-insights/financial-insights.types.ts` —
novo módulo, nunca um package (`packages/*` continua sem segundo
produto consumidor real). `FinancialInsights` é um contrato
deliberadamente **separado** de `FinancialDashboardSummary`
("FinancialSummary"), nunca fundido nem substituindo responsabilidades:

```ts
FinancialSummary (agregados, Fase 7)
        ↓ (buildFinancialInsights())
FinancialInsights (KPIs derivados, Fase 8.9)
```

Contratos de domínio pequenos, um por conceito: `SupplierInsight`,
`CategoryInsight`, `OutstandingInsight`, `LargestExpenseInsight`,
`TrendInsight`, compostos em `FinancialInsights` (`largestSupplier`,
`largestCategory`, `supplierConcentration`, `categoryConcentration`,
`outstanding`, `largestExpense`, `trend`, `supplierRanking`,
`categoryRanking`). `share`/`percentageChange` novos são sempre
**string decimal normalizada a 2 casas** (`"33.33"`), nunca `number` —
o símbolo "%" é responsabilidade exclusiva da camada de apresentação
(texto do Chat, serializers CSV/PDF, frontend). `PeriodComparisonValue.
percentageChange` (Fase 9, reutilizado dentro de `TrendInsight.
comparison`) manteve-se `number`, por decisão explícita — contrato já
estável, fora do âmbito alterar.

### Funções puras, não uma camada de serviços

`apps/frontrest/api/src/financial-insights/financial-insights.util.ts` —
exporta só funções (`buildFinancialInsights()` e os helpers internos
`buildSupplierRanking()`/`buildCategoryRanking()`/`computeConcentration()`/
`resolveOutstanding()`/`resolveLargestExpense()`/`resolveTrend()`),
nunca uma classe `@Injectable()` — mesma forma de `dashboard/
period-comparison.util.ts`/`period.util.ts`/`reports/month.util.ts`,
o precedente direto desta fase. Todo o cálculo é feito via
`Prisma.Decimal` — nunca `number` intermédio para montantes ou
percentagens; `share`/`percentageChange` ficam sempre `null` (nunca
`Infinity`/`NaN`) quando o total do período é zero.

`FINANCIAL_INSIGHTS_SUPPLIER_TOP_N = 3` e `FINANCIAL_INSIGHTS_CATEGORY_TOP_N = 3`
— fixadas nesta fase, junto da implementação; sem configuração por
ambiente nem parâmetro HTTP. O ranking de fornecedores continua
limitado à janela já devolvida por `getFinancialSummary()` (`topSuppliers`,
top 5); `byCategory` continua sem limite (já assim desde a Fase 7).

`resolveOutstanding()` substitui `FinancialRetrievalService.
selectOutstanding()` (privado, removido nesta fase) — mesma soma
"Pendente + Vencida" via `Decimal`, agora única fonte partilhada por
Chat/Dashboard/Reports, sem alterar o resultado observável do Chat.
`resolveTrend()` reutiliza `compareAmount()` (Fase 9/8.6) sobre os dois
últimos meses de `monthlyTrend` — com menos de 2 meses com dados,
devolve `direction: 'insufficient_data'` e `comparison: null` — nunca
uma tendência fabricada a partir de um único ponto.

### Garantia arquitetural sobre queries

Nenhuma query financeira duplicada; nenhuma query Prisma reimplementada;
`financial-insights.util.ts` reutiliza exclusivamente as APIs públicas
de `DashboardService` (`getFinancialSummary()`/`getLargestInvoices()`),
nunca usa `PrismaService` diretamente. Quando as duas chamadas são
independentes entre si (nenhuma depende do resultado da outra),
corridas sempre em paralelo via `Promise.all` — nunca sequencialmente
— nos três pontos de integração: `FinancialRetrievalService.
resolveDataForPeriod()` (caso `FINANCIAL_SUMMARY`), `DashboardController.
getFinancialInsights()` (novo endpoint) e `ReportsService.
getMonthlyReport()` (adicionada ao `Promise.all` já existente).

### Integração no Chat IA

`FinancialIntentData`'s variante `FINANCIAL_SUMMARY` ganhou o campo
`insights: FinancialInsights` — nenhuma outra intenção
(`TOP_SUPPLIERS`/`BY_CATEGORY`/`MONTHLY_TREND`/`OUTSTANDING_BALANCE`/
`LARGEST_INVOICES`/`PERIOD_COMPARISON`) mudou de forma. Nenhuma tool
nova, nenhum `FinancialIntentType` novo — `get_financial_summary` (já
existente, Fase 8.3) passa a devolver `insights` de graça, por
partilhar exatamente o mesmo caminho (`retrieveForIntent()` →
`resolveDataForPeriod()`).

`financial-context.builder.ts` ganhou um bloco "Destaques" (função
`buildInsightsLines()`), só para `FINANCIAL_SUMMARY` — maior fornecedor/
categoria com percentagem, concentração, saldo por pagar (sempre
presente, mesmo a zero), maior fatura, tendência mensal (ou "dados
insuficientes para uma conclusão" explícito). Todos os valores vêm já
calculados de `data.insights`, nunca recalculados no builder.

### Strict Grounding estendido, nunca enfraquecido

`financial-grounding.validator.ts` ganhou uma nova categoria de facto
`percentages: Set<string>` (nunca `Set<number>`) + `PERCENTAGE_TOKEN_PATTERN`
(`/(-?\d+(?:[.,]\d{1,2})?)\s*%/g` — sinal negativo opcional, vírgula ou
ponto decimal) + `normalizePercentageToken()` (via `Prisma.Decimal`,
nunca `number` intermédio) + novo `FinancialGroundingFailureReason =
'PERCENTAGE_NOT_ALLOWED'`. `collectAllowedFacts()` ganhou
`collectInsightFacts()`, chamada só no caso `FINANCIAL_SUMMARY` —
percorre `FinancialInsights` inteiro (`largestSupplier`/`largestCategory`.
share, `supplierConcentration`/`categoryConcentration`.share,
`outstanding`, `largestExpense.invoice`, `trend.comparison`) e regista
todos os montantes/contagens/datas/percentagens reais como factos
permitidos. Uma percentagem no texto do provider que não coincida
exatamente (depois de normalizada ao formato canónico) com nenhum
valor real é sempre rejeitada — sem tolerâncias aproximadas, sem
arredondamentos diferentes do valor autorizado — substituída pelo
mesmo fallback determinístico já existente (Fase 8.3/8.8).

### Dashboard — novo endpoint

`GET /dashboard/financial-insights` (`DashboardController.
getFinancialInsights()`) — mesmo isolamento por `organizationId` de
`CurrentUser()`, mesmos parâmetros `from`/`to` de `financial-summary`
(`FinancialSummaryQueryDto`, inalterado). Compõe `getFinancialSummary()`
+ `getLargestInvoices()` (paralelo) + `buildFinancialInsights()`
diretamente no controller — sem serviço novo, mesma disciplina de
"funções puras" pedida para esta fase.

### Reports

`MonthlyFinancialReport` ganhou o campo `insights: FinancialInsights`
(contrato aditivo, `totals`/`byStatus`/`byCategory`/`topSuppliers`/
`invoices` inalterados). `ReportsService.getMonthlyReport()` passou a
chamar também `dashboardService.getLargestInvoices()` — API pública já
existente, adicionada ao mesmo `Promise.all` das duas chamadas a
`getFinancialSummary()` e ao detalhe de faturas, nunca sequencial.
`csv.serializer.ts`/`pdf.serializer.ts` ganharam uma secção "Destaques"
equivalente à do Chat (maior fornecedor/categoria com %, concentração,
saldo por pagar, maior fatura, tendência) — mesmos valores de
`insights`, nunca recalculados no serializer.

### Frontend

`/dashboard` (novo card "Destaques", buscando `getFinancialInsights()`
em paralelo com `getFinancialSummary()` via `Promise.all`) e `/reports`
(nova secção "Destaques" no relatório mensal, usando `report.insights`
já incluído na resposta existente) — `lib/dashboard.ts`/`lib/reports.ts`
espelham os tipos `FinancialInsights`/`SupplierInsight`/`CategoryInsight`/
etc., mesmo padrão já usado para os restantes contratos HTTP deste
projeto (sem geração automática de tipos).

## Ficheiros criados

- `apps/frontrest/api/src/financial-insights/financial-insights.types.ts`
- `apps/frontrest/api/src/financial-insights/financial-insights.util.ts`
- `apps/frontrest/api/src/financial-insights/financial-insights.util.spec.ts`
- `apps/frontrest/api/src/financial-insights/financial-insights.test-fixtures.ts` (`buildEmptyFinancialInsights()`, reutilizado por 6 ficheiros de teste)
- `docs/phases/phase-8.9-financial-insights-foundation.md`

## Ficheiros alterados

- `apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts` (+`.spec.ts`) — `FINANCIAL_SUMMARY` ganha `insights`, `Promise.all`, `selectOutstanding()` removido.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts` (+`.spec.ts`) — bloco "Destaques".
- `apps/frontrest/api/src/ai/financial-retrieval/financial-grounding.validator.ts` (+`.spec.ts`) — categoria `percentages`.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-conversation-context.spec.ts`, `apps/frontrest/api/src/ai/ai-chat.service.spec.ts`, `apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.spec.ts` — fixtures atualizadas (`insights` obrigatório).
- `apps/frontrest/api/src/dashboard/dashboard.controller.ts` (+ novos testes em `test/dashboard.e2e-spec.ts`) — novo endpoint.
- `apps/frontrest/api/src/reports/reports.service.ts` (+`.spec.ts`) — `insights`, `Promise.all` com `getLargestInvoices()`.
- `apps/frontrest/api/src/reports/serializers/csv.serializer.ts`/`pdf.serializer.ts` (+`.spec.ts`) — secção "Destaques".
- `apps/frontrest/api/test/reports.e2e-spec.ts` — `wireInvoiceData()` distingue a query de `getLargestInvoices()` (`include`, nunca `select`).
- `apps/frontrest/web/lib/dashboard.ts` — tipos `FinancialInsights`/etc. + `getFinancialInsights()`.
- `apps/frontrest/web/lib/reports.ts` — `MonthlyFinancialReport.insights`.
- `apps/frontrest/web/app/(dashboard)/dashboard/page.tsx` (+`.test.tsx`) — card "Destaques".
- `apps/frontrest/web/app/(dashboard)/reports/page.tsx` (+`.test.tsx`) — secção "Destaques".
- `docs/PHASES.md`, `docs/INDEX.md`, `docs/ARCHITECTURE.md`.

**Correções pós-revisão** (ver secção dedicada, abaixo) — também
alterados: `financial-insights.types.ts`/`.util.ts`/`.util.spec.ts`
(`TrendComparison`, consecutividade, desempate, `topN` dinâmico);
`financial-grounding.validator.ts`/`.spec.ts` (percentagens de
`PERIOD_COMPARISON`); `financial-context.builder.spec.ts`,
`csv.serializer.spec.ts`/`pdf.serializer.ts` (tipo `TrendComparison`);
`test/dashboard.e2e-spec.ts` (`topN` dinâmico); `lib/dashboard.ts`/
`lib/reports.ts` (`TrendComparison`, `insights` opcional);
`dashboard/page.tsx`(+`.test.tsx`)/`reports/page.tsx`(+`.test.tsx`)
(tolerância a `insights` ausente/falha).

## Dependências introduzidas

Nenhuma — reutiliza `Prisma.Decimal` (`@frontcore/database`, já
dependência existente) e componentes já existentes de `@frontcore/ui`
(`Card`/`Typography`/`Badge`). Sem biblioteca gráfica, sem motor de
templates, sem Chromium.

## Decisões arquiteturais

- **Numeração — Fase 8.9, não Fase 11 nem Fase 9.x**: decisão do
  Product Owner — a numeração segue a linhagem funcional (AI Finance),
  não o número de módulos alterados; fases anteriores (8.1–8.8) já
  alteraram simultaneamente Chat/Dashboard/Router/Retrieval/Tools/
  Prisma/Frontend. Sem conflito documental identificado — as secções
  "Fora do âmbito" das Fases 8.1/8.4/8.6/8.7/8.8 descrevem o que
  ficava fora *dessas* fases especificamente, nunca uma regra
  permanente contra fases futuras da mesma linhagem.
- **`FinancialInsights` separado de `FinancialDashboardSummary`**:
  decisão explícita do Product Owner — dois contratos, nunca um só;
  `financial-insights.util.ts` nunca é chamado de dentro de
  `DashboardService`, só pelos 3 consumidores.
- **Funções puras, não um serviço `@Injectable()`**: mesma forma do
  precedente já estabelecido (`period-comparison.util.ts`, Fase 9),
  evita uma camada de serviços prematura.
- **`share`/percentagens como string decimal, nunca `number`**:
  decisão explícita — todo o cálculo via `Prisma.Decimal`, o "%" só na
  apresentação; `TrendComparison` (correção pós-revisão) é um contrato
  próprio para isto não quebrar `PeriodComparisonValue` (Fase 9,
  intocado).
- **`Top N = 3` fixo, sem configuração**: decisão explícita — YAGNI,
  sem parâmetro HTTP nem variável de ambiente nesta fase; o valor
  devolvido é sempre a quantidade efetivamente considerada (correção
  pós-revisão), nunca o limite nominal quando há menos elementos reais.
- **Tendência exige meses consecutivos** (correção pós-revisão): uma
  lacuna temporal entre os dois meses mais recentes de `monthlyTrend`
  nunca produz uma comparação — `insufficient_data` explícito.
- **Ranking com desempate estável** (correção pós-revisão; refinado na
  correção final): fornecedores — montante desc, nome asc, `supplierId`
  asc como 3º critério (o modelo permite fornecedores diferentes com o
  mesmo nome; quando nome e montante são também iguais, o `supplierId`
  garante ainda o mesmo resultado, sempre, nunca dependente da ordem
  devolvida pela base de dados); categorias — montante desc, nome asc
  (inalterado nesta correção final, sem 3º critério). Nunca muta
  `FinancialDashboardSummary.topSuppliers`/`byCategory` (cópia interna).

## Validações efetuadas

- `pnpm --filter @frontrest/api test` — 46 suites, **885 testes**
  (antes da Fase 8.9: 45/841; após a implementação inicial: 46/870;
  após as correções pós-revisão: 46/885), todos a passar.
- `pnpm --filter @frontrest/api test:e2e` — 9 suites, **154 testes**,
  todos a passar.
- `pnpm --filter @frontrest/web test` — 7 suites, **68 testes** (após
  as correções pós-revisão — antes: 66), todos a passar.
- `pnpm --filter @frontrest/api typecheck` / `pnpm --filter @frontrest/web typecheck` — limpos.
- Confirmado manualmente: uma percentagem fabricada pelo provider
  (não coincidente com nenhum `share`/`percentageChange` real) é
  rejeitada (`PERCENTAGE_NOT_ALLOWED`) — teste dedicado em
  `financial-grounding.validator.spec.ts`.
- Confirmado: nenhuma chamada a `PrismaService` dentro de
  `financial-insights/` (revisão de código — só `DashboardService` é
  importado, e só pelo tipo `FinancialDashboardSummary`/`LargestInvoice`).
- Confirmado: `DashboardService` inalterado nesta fase (nenhum método
  novo, nenhuma assinatura alterada).

## Resultado final

`FinancialInsights` é hoje a única fonte de KPIs derivados do FrontRest,
reutilizada sem duplicação por Chat IA, Dashboard e Reports — a mesma
percentagem de concentração de um fornecedor é idêntica nos três
lugares porque é o mesmo cálculo, chamado uma vez por pedido.

## Correções pós-revisão

Uma revisão técnica independente, realizada depois da implementação
inicial desta fase, identificou 8 correções — todas de implementação,
nenhuma reabre o âmbito ou a arquitetura já aprovados.

1. **Strict Grounding — regressão do `PERIOD_COMPARISON` (obrigatória)**.
   `collectAllowedFacts()` já validava percentagens do `FINANCIAL_SUMMARY`
   (via `FinancialInsights`), mas nunca registava as duas percentagens
   reais de `PERIOD_COMPARISON` (`comparison.totalAmount`/
   `activeInvoiceCount`.`percentageChange`) no conjunto permitido —
   qualquer resposta que mencionasse a percentagem real de uma
   comparação de períodos (ex. "100% de aumento") era incorretamente
   rejeitada assim que o validador passou a verificar percentagens em
   texto. Corrigido: as duas percentagens (quando não nulas) são agora
   adicionadas a `percentages`, normalizadas via `Prisma.Decimal` (o
   contrato `PeriodComparisonValue.percentageChange: number`, Fase 9,
   nunca foi alterado). 5 novos testes.
2. **Tendência mensal — só meses consecutivos**. `resolveTrend()`
   comparava sempre os dois últimos pontos de `monthlyTrend`, mesmo
   quando não eram adjacentes (ex. maio e julho, com junho ausente por
   não ter faturas) — produzindo uma "tendência" entre pontos não
   consecutivos. Corrigido: `areConsecutiveMonths()` (índice absoluto
   `ano×12+mês`, cobre a viragem de ano sem caso especial) confirma
   consecutividade antes de calcular qualquer comparação; sem ela,
   `direction: 'insufficient_data'`, `comparison: null` — nunca uma
   tendência fabricada a partir de pontos não adjacentes. 6 novos testes
   (consecutivos, dezembro→janeiro, lacuna maio→julho, 1 mês, 0 meses).
3. **Percentagens públicas — `TrendInsight.comparison.percentageChange`
   era a única exceção `number`**. Corrigido com um contrato próprio,
   `TrendComparison` (`financial-insights.types.ts`), nunca
   `PeriodComparisonValue` (Fase 9, intocado) — `percentageChange` é
   agora sempre string decimal a 2 casas ou `null`
   (`buildTrendComparison()`, `financial-insights.util.ts`, via
   `Prisma.Decimal` desde a origem, nunca convertido a partir de um
   `number` já calculado).
4. **Ranking determinístico (desempate)**. `buildSupplierRanking()`/
   `buildCategoryRanking()` recebiam `topSuppliers`/`byCategory` já
   ordenados por valor desc (Fase 8.4), mas o `groupBy`/`orderBy` do
   Prisma não garante uma ordem determinística entre linhas com o
   mesmo `totalAmount`. Corrigido: `sortDeterministically()` — cópia do
   array (nunca muta o original, para `FinancialDashboardSummary`
   continuar exatamente como veio para outros consumidores), valor
   desc como critério primário, nome (`localeCompare`) como desempate.
   4 novos testes, incl. confirmação de que o array original nunca é
   mutado.
   **Correção final** (revisão read-only subsequente): o modelo permite
   fornecedores diferentes com o mesmo nome — quando nome e montante
   são também iguais, o comparator podia devolver `0`, deixando a
   posição final depender da ordem devolvida pela base de dados.
   `sortDeterministically()` ganhou um 3º critério opcional (`idOf`),
   usado só por `buildSupplierRanking()` (`supplierId` asc,
   `localeCompare`) — nunca a posição original do array. Categorias
   permanecem sem 3º critério, comportamento inalterado (não foi
   identificado o mesmo problema — `categoryId` nunca colide por nome
   do mesmo modo relatado para fornecedores; correção mínima, só onde
   pedida). 3 novos testes (mesmo nome+montante com `supplierId`
   diferente, em duas ordens de entrada; confirmação de não-mutação;
   confirmação de que categorias continuam sem este 3º critério).
5. **Top N enganador com menos de 3 elementos**. `computeConcentration()`
   devolvia sempre `topN: 3` (o limite configurado), mesmo com só 1 ou
   2 fornecedores/categorias reais — "os 3 principais representam
   100%" quando só existia 1. Corrigido: `topN` devolvido é agora
   `Math.min(topN configurado, elementos disponíveis)` — a quantidade
   **efetivamente considerada**, nunca o limite nominal quando há
   menos dados reais. Testes atualizados e novos (lista vazia, menos
   de 3 elementos).
6. **Duplicação operacional no Dashboard — analisada, não eliminada**.
   `/dashboard` faz 2 pedidos HTTP independentes
   (`getFinancialSummary()` + `getFinancialInsights()`); o segundo
   recalcula internamente `getFinancialSummary()` outra vez no
   servidor, para o mesmo período/organização — uma segunda execução
   real da mesma agregação. Eliminar isto exigiria uma de três coisas,
   todas rejeitadas: (a) fundir `FinancialInsights` dentro de
   `FinancialDashboardSummary` — contradiz a decisão explícita desta
   fase de os manter como contratos sempre separados; (b) cache ou
   memoização por pedido — explicitamente proibido nesta correção; (c)
   um novo serviço/camada de composição — também explicitamente
   proibido. Mantida a implementação atual (2 pedidos independentes) —
   ver "Limitações conhecidas".
7. **Compatibilidade do frontend com respostas antigas**. `MonthlyFinancialReport.insights`
   passou a opcional (`insights?: FinancialInsights`, `lib/reports.ts`)
   — `/reports` omite a secção "Destaques" quando ausente, nunca
   lança. `/dashboard` já fazia 2 pedidos independentes; `getFinancialInsights()`
   ganhou um `.catch(() => null)` próprio dentro do `Promise.all` — uma
   falha nesse pedido (ex. endpoint ainda inexistente num deploy
   faseado) nunca bloqueia o resumo principal. Nenhuma alteração à API.
8. **Documentação** — esta secção, mais os pontos atualizados abaixo em
   "Decisões arquiteturais", "Validações efetuadas", "Limitações
   conhecidas" e `docs/ARCHITECTURE.md`.

Validação depois das correções: `pnpm --filter @frontrest/api test` —
46 suites, **885 testes**; `pnpm --filter @frontrest/api test:e2e` — 9
suites, **154 testes**; `pnpm --filter @frontrest/web test` — 7 suites,
**68 testes**; todos a passar. `pnpm typecheck`/`pnpm lint`/`pnpm build`
limpos em todo o workspace.

## Critérios de conclusão

- [x] Módulo puro `financial-insights/` criado, sem `PrismaService`.
- [x] `FinancialInsights` separado de `FinancialDashboardSummary`.
- [x] `SupplierInsight`/`CategoryInsight`/`OutstandingInsight`/`LargestExpenseInsight`/`TrendInsight` definidos.
- [x] `share`/percentagens sempre string decimal a 2 casas, nunca `number`.
- [x] `FINANCIAL_INSIGHTS_SUPPLIER_TOP_N`/`CATEGORY_TOP_N = 3`, fixos.
- [x] `Promise.all` em todos os pontos com chamadas independentes.
- [x] Integração no resumo financeiro do Chat (`FINANCIAL_SUMMARY`).
- [x] Novo endpoint `GET /dashboard/financial-insights`.
- [x] Integração no relatório mensal (JSON/CSV/PDF).
- [x] Apresentação em `/dashboard` e `/reports`.
- [x] Strict Grounding estendido (percentagens), nunca enfraquecido.
- [x] Testes unitários, e2e e frontend, todos a passar.
- [x] Nenhuma alteração a `DashboardService`, schema Prisma, tool registry, router.
- [x] Documentação da fase criada; `PHASES.md`/`INDEX.md`/`ARCHITECTURE.md` atualizados.
- [x] (Correção pós-revisão) Percentagens reais de `PERIOD_COMPARISON` incluídas no conjunto permitido do Strict Grounding.
- [x] (Correção pós-revisão) Tendência mensal só entre meses consecutivos — `insufficient_data` explícito perante qualquer lacuna.
- [x] (Correção pós-revisão) `TrendComparison.percentageChange` sempre string decimal, nunca `number`.
- [x] (Correção pós-revisão) Ranking com desempate determinístico e estável.
- [x] (Correção pós-revisão) `topN` reflete sempre a quantidade efetivamente considerada.
- [x] (Correção pós-revisão) Frontend tolera respostas/pedidos sem `insights`, sem alterar a API.

## Limitações conhecidas

- `supplierRanking`/`categoryRanking` continuam limitados pela janela
  já existente (`topSuppliers` top 5); "ranking completo" além de 5
  fornecedores fica para fase futura.
- Sem `paidAt` no schema — nenhum insight sobre "tempo até pagamento".
- `trend` só considera os meses já presentes em `monthlyTrend`
  (dependente do período consultado), e só produz uma comparação real
  quando os dois meses mais recentes são consecutivos (correção
  pós-revisão) — uma lacuna temporal é sempre `insufficient_data`,
  nunca uma tendência entre pontos não adjacentes.
- Filtros (fornecedor/categoria/estado) continuam não expostos via
  HTTP em Dashboard/Reports — só o Chat os usa (Fase 8.4); candidato a
  fase futura.
- **`/dashboard` executa `getFinancialSummary()` duas vezes por pedido
  de página** (uma vez diretamente, outra dentro de
  `GET /dashboard/financial-insights`) — duplicação operacional
  identificada na revisão pós-implementação (Correção 6), analisada e
  deliberadamente não eliminada: exigiria fundir os contratos
  `FinancialDashboardSummary`/`FinancialInsights` (rejeitado — decisão
  explícita de os manter separados), uma cache/memoização por pedido
  (proibida) ou um novo serviço de composição (proibido). `/reports`
  não tem este problema — `ReportsService.getMonthlyReport()` computa
  o resumo uma única vez e passa-o diretamente a
  `buildFinancialInsights()`, na mesma chamada de servidor.

## Fora do âmbito (confirmado, não implementado)

Filtros HTTP novos em Dashboard/Reports; relatório anual; intervalo
personalizado; forecasting; recomendações; scoring; agentes;
`InvoiceItem`; histórico de preços; packages novos; migrations;
alterações ao schema Prisma; tools novas; intents novas.
