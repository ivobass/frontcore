# Fase 7 — Financial Dashboard Foundation

## Objetivo

Primeira foundation do dashboard financeiro do FrontRest, baseada
exclusivamente em `Invoice` confirmadas da organização autenticada —
uma API de agregações e um `/dashboard` real, com cards e gráficos
simples. Pequena e explícita, não uma plataforma genérica de
analytics.

## Âmbito

Só leitura/agregação sobre `Invoice` já existente. Não repete nem
altera o fluxo `Upload → InvoiceDraft → OCR → Fiscal Parsing → Review
→ Promote` (Fases 6.3–6.12). Sem receitas, vendas, lucro, margem, cash
flow, contas bancárias, pagamentos parciais, `Payment`, orçamento,
forecast, IA, exportação, alteração ao schema Prisma, migration,
cache, WebSockets ou biblioteca gráfica nova.

## Estado anterior

`/dashboard` (`apps/frontrest/web/app/(dashboard)/dashboard/page.tsx`)
mostrava só organização/utilizador/role. `Invoice` já tinha todos os
campos necessários (`organizationId`, `supplierId`, `categoryId?`,
`issueDate`, `totalAmount: Decimal(12,2)`, `status`), mas nenhuma
agregação existia — nem endpoint, nem `groupBy`/`aggregate` em nenhum
serviço do monorepo.

## Decisões arquiteturais

### Fonte de dados e semântica de `CANCELLED`

Só `Invoice` — nunca `InvoiceDraft` (staging, nunca dado financeiro
confirmado). `issueDate` como dimensão temporal (nunca `createdAt`).
`CANCELLED` excluído de todos os totais "ativos" (`totals.totalAmount`,
`totals.averageAmount`, `monthlyTrend`, `byCategory`, `topSuppliers`),
mas contado à parte (`totals.cancelledInvoiceCount`) e presente em
`byStatus` — nunca escondido, só não somado. `OVERDUE` é sempre o
estado persistido, nunca recalculado a partir de `dueDate`.

### Módulo `apps/frontrest/api/src/dashboard/`, um único endpoint

`GET /dashboard/financial-summary`, sem `@Roles` (mesmo alcance de
`GET /invoices` — qualquer utilizador autenticado da organização). A
organização vem sempre de `CurrentUser().organizationId`, nunca de um
parâmetro do pedido. Nenhuma query depende do número de faturas (sem
N+1): 6 pedidos fixos por resposta (`aggregate`, `count`, 3×
`groupBy`, 1× `findMany` para a tendência mensal) + 2 lookups de nome
(categoria/fornecedor), sempre com `organizationId` no `where`.

### Período — limites inequívocos, sempre em UTC

`resolvePeriod()` (`period.util.ts`) — início inclusivo, fim exclusivo
internamente (`to` + 1 dia), ambos os limites construídos com
`Date.UTC()`, nunca no timezone local do processo Node. Formato
validado em duas camadas: `@IsDateString()` no DTO (forma —
`"15-07-2026"`/`"15/07/2026"` rejeitados, confirmado empiricamente) +
uma verificação de calendário real em `resolvePeriod()` (`"2026-02-30"`
tem forma válida mas dia inexistente — `@IsDateString()` sozinho
aceita-o, só o round-trip via `Date.UTC` o rejeita). `from > to`
também rejeitado aqui (cruza dois campos, fora do âmbito de um único
decorator). Omissos → mês atual, em UTC.

### Precisão monetária — `Decimal` do início ao fim

`Prisma.Decimal` tem `.toJSON()` próprio — confirmado empiricamente
que `JSON.stringify()` já serializa qualquer `Decimal` como string sem
perda de precisão, sem conversão manual. A soma da tendência mensal
(agregada em memória, único caso sem `groupBy` nativo por mês — Prisma
não tem `date_trunc` portável) usa `Prisma.Decimal.plus()`, nunca
`number` — evita a perda de precisão de uma conversão prematura,
exigida explicitamente pelo contrato desta fase. `averageAmount` usa
sempre `_avg.totalAmount` do próprio Prisma (cálculo ao nível da base
de dados), nunca recalculado no serviço.

### Datas — ISO no contrato, `pt-PT` só na apresentação

`period.from`/`period.to` no contrato HTTP continuam sempre ISO
`YYYY-MM-DD`. A apresentação `pt-PT` reutiliza `lib/format.ts::formatDate()`
sem alteração — confirmado empiricamente que `Intl.DateTimeFormat('pt-PT')`
produz `"15/07/2026"` (barras), a mesma convenção já usada em
`invoices`/`invoice-drafts`; nenhum formatador novo foi criado.

### Frontend — sem biblioteca gráfica nova

`ProportionalBarList` — um único componente reutilizado por evolução
mensal, distribuição por categoria e principais fornecedores (as três
secções são estruturalmente a mesma coisa: rótulo + contagem +
montante, barra proporcional ao maior valor do conjunto) — evita 3
ficheiros quase idênticos. Barra HTML/CSS simples (`width: %`); nenhuma
necessidade concreta identificada que justificasse uma dependência
gráfica. `FinancialSummaryCards` — os 4 cards principais, sem cálculo
próprio (só apresenta o que o backend já agregou). `/dashboard`
orquestra: seletor de período (`<input type="date">` nativo, valores
sempre ISO), loading/erro/vazio/preenchido, e as secções.

## Contrato final

Igual ao proposto na análise, sem alterações — `FinancialDashboardSummary`
com `period`/`totals`/`byStatus`/`monthlyTrend`/`byCategory`/`topSuppliers`,
todos os montantes como string, `topSuppliers` limitado a 5,
`categoryName: "Sem categoria"` quando `categoryId` é `null`.

## Ficheiros criados

```
apps/frontrest/api/src/dashboard/dashboard.module.ts
apps/frontrest/api/src/dashboard/dashboard.controller.ts
apps/frontrest/api/src/dashboard/dashboard.service.ts
apps/frontrest/api/src/dashboard/dto/financial-summary-query.dto.ts
apps/frontrest/api/src/dashboard/period.util.ts
apps/frontrest/api/src/dashboard/period.util.spec.ts
apps/frontrest/api/src/dashboard/dashboard.service.spec.ts
apps/frontrest/api/test/dashboard.e2e-spec.ts

apps/frontrest/web/lib/dashboard.ts
apps/frontrest/web/app/(dashboard)/dashboard/financial-summary-cards.tsx
apps/frontrest/web/app/(dashboard)/dashboard/proportional-bar-list.tsx
apps/frontrest/web/app/(dashboard)/dashboard/dashboard.test.tsx

docs/phases/phase-7-financial-dashboard-foundation.md
```

Não criados face à lista inicial da fase, por decisão tomada durante a
implementação: `monthly-trend-chart.tsx`, `category-breakdown-chart.tsx`
e `top-suppliers.tsx` — as três secções partilham a mesma forma
(rótulo/contagem/montante/barra proporcional), substituídas por um
único `proportional-bar-list.tsx` reutilizado 3×, em vez de 3 ficheiros
quase idênticos.

## Ficheiros alterados

```
apps/frontrest/api/src/app.module.ts        — regista DashboardModule
apps/frontrest/api/test/utils/mock-prisma.ts — + aggregate/groupBy no mock partilhado (aditivo)
apps/frontrest/web/app/(dashboard)/dashboard/page.tsx — dashboard financeiro real
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`apps/frontrest/web/lib/format.ts` **não foi alterado** — `formatDate()`/
`formatCurrency()` já cobriam corretamente a apresentação `pt-PT`
pedida (confirmado empiricamente antes de decidir).

## Testes adicionados

- **Backend, `period.util.spec.ts`** (10 testes): mês atual por
  omissão, limites inclusivo/exclusivo, virada de ano, formato
  inválido, mês/dia impossível, `from > to`, período de um único dia.
- **Backend, `dashboard.service.spec.ts`** (15 testes): isolamento por
  organização (queries de agregação e de lookup de nomes), exclusão de
  `CANCELLED` dos totais ativos + contagem própria, `byStatus` inclui
  `CANCELLED`, categoria nula → "Sem categoria", período sem dados
  (zeros/arrays vazios), média vinda do Prisma, `topSuppliers`
  ordenado/limitado a 5 com fallback de nome, serialização como
  string, validação de período propagada, `issueDate` como dimensão
  temporal, tendência mensal agregada com soma `Decimal`.
- **Backend e2e, `dashboard.e2e-spec.ts`** (12 testes): 401 sem token,
  organização sempre da identidade (nunca de parâmetro), duas
  organizações produzem queries distintas, qualquer role autenticada
  lê, aceitação `YYYY-MM-DD`, rejeição de formato `DD/MM/YYYY`,
  rejeição `from > to`, rejeição de data impossível, limites inicial
  (inclusivo)/final (exclusivo) confirmados no `where` real, resposta
  vazia válida, forma do contrato.
- **Frontend, `dashboard.test.tsx`** (9 testes): loading, erro, período
  vazio, cards+secções com dados, total nunca inclui `CANCELLED`
  (verificado indiretamente — o card mostra exatamente o valor devolvido
  pela API), datas em `pt-PT`/nunca ISO, parâmetros enviados em ISO,
  mudança de período dispara novo pedido, período inválido não dispara
  pedido e mostra erro claro.

## Resultados dos testes

- `pnpm typecheck` — 23/23.
- `pnpm build` — 14/14; rota `/dashboard` gerada (2.92 kB).
- `pnpm test` (raiz) — 17/17 tarefas: `@frontrest/api` 411/411 (386
  pré-existentes + 25 novos), `@frontrest/web` 32/32 (23 pré-existentes
  + 9 novos).
- `pnpm --filter @frontrest/api test:e2e` — 92/92 (80 pré-existentes +
  12 novos).
- Validação Docker + manual no browser — ver secção própria.

## Limitações conhecidas

- Tendência mensal agregada em memória (`invoice.findMany` + redução
  local), não `groupBy` nativo por mês — Prisma não tem `date_trunc`
  portável; aceitável para o volume esperado por organização, a
  revisitar só se o volume real justificar.
- `averageAmount` devolve `"0.00"` (nunca `null`) quando não há faturas
  ativas no período — decisão explícita para simplificar o consumidor,
  documentada no contrato.

## Fora do âmbito (confirmado, não implementado)

Receitas, vendas, lucro, margem, cash flow, contas bancárias,
pagamentos parciais, `Payment`, orçamento, forecast, comparação entre
organizações, IA/insights, exportação PDF/CSV, alteração ao
`InvoiceDraft`/OCR/parsing fiscal, migration Prisma, cache, WebSockets,
biblioteca gráfica.

## Critérios de conclusão

- [x] `GET /dashboard/financial-summary` existe e exige autenticação.
- [x] Todas as agregações isoladas por `organizationId`.
- [x] `issueDate` como dimensão temporal.
- [x] `CANCELLED` excluído dos totais ativos, contado à parte.
- [x] Categorias nulas → "Sem categoria".
- [x] Montantes sem perda de precisão (`Decimal` → string, nunca via `number`).
- [x] Períodos inválidos rejeitados (formato, `from > to`, calendário impossível).
- [x] Períodos vazios devolvem resposta válida (zeros/arrays vazios).
- [x] Parâmetros HTTP em `YYYY-MM-DD`; apresentação em `pt-PT` (barras, helper existente).
- [x] Sem parsing manual ambíguo de datas.
- [x] Limites do período protegidos contra timezone (sempre UTC).
- [x] Sem cálculo global no frontend — cards/gráficos só apresentam o que a API já agregou.
- [x] Frontend com cards e gráficos (barras HTML/CSS).
- [x] Loading, erro e vazio tratados.
- [x] Sem alteração ao schema Prisma, sem migration, sem package novo, sem dependência gráfica nova, sem componente genérico de datas novo.
- [x] Testes unitários, e2e e frontend a passar.
- [x] `pnpm typecheck`/`build`/`test` limpos.
- [x] Validação Docker + manual no browser executada.
- [x] Documentação da fase criada; `PHASES.md`/`INDEX.md`/`ARCHITECTURE.md` atualizados.

## Próxima fase

Candidatos naturais, fora do âmbito desta fase: Token Refresh (já
identificado como prioridade Alta na Fase 6.12); relatórios
financeiros mais completos (Fase 9, `docs/PHASES.md`); Regression Test
Suite equivalente para agregações, se o dashboard crescer em
complexidade.
