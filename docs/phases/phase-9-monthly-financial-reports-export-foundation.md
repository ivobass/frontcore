# Fase 9 — Monthly Financial Reports & Export Foundation

## Objetivo

Fundação de relatórios financeiros mensais do FrontRest: relatório de
um mês, comparação com o mês anterior, detalhe das faturas incluídas,
exportação CSV e PDF — reutilizando exatamente a semântica financeira
já estabelecida na Fase 7. Solução pequena, síncrona, sem persistência
de relatórios.

## Âmbito

Só `GET /reports/monthly` (JSON/CSV/PDF) e `/reports` no frontend.
`Dashboard` (Fase 7) e `AI Chat` (Fase 8) são só consumidos, nunca
alterados. Fora do âmbito: qualquer capacidade do Chat IA (tool
calling, retrieval, consultas dinâmicas) — ver "Trabalho futuro" para a
recomendação registada, não implementada.

## Estado anterior

`DashboardService.getFinancialSummary(organizationId, {from?, to?})`
(Fase 7) já agregava `Invoice` isoladas por organização, `CANCELLED` à
parte, montantes via `Prisma.Decimal`; `DashboardModule` já exportava
`DashboardService` (preparado desde a Fase 8). `resolvePeriod()`
resolvia um intervalo `from`/`to`, sem noção de "mês". Nenhum ficheiro,
rota ou dependência CSV/PDF existia em todo o monorepo.

## Decisões arquiteturais

### `ReportsService` reutiliza exclusivamente a API pública de `DashboardService`

`ReportsModule` importa `DashboardModule`; `ReportsService` injeta
`DashboardService` real e chama só `getFinancialSummary()` — duas vezes
(mês selecionado, mês anterior), via `Promise.all` com a única query
Prisma própria deste serviço (detalhe de faturas). Nunca conhece
métodos privados de `DashboardService` (`lookupCategoryNames`,
`lookupSupplierNames`, `buildMonthlyTrend`) nem reimplementa nenhuma
agregação financeira — o mesmo precedente já estabelecido pela Fase 8
(`AiTenantContextService` → `DashboardService`). Sem HTTP interno, sem
dependência circular (`Reports → Dashboard`, nunca o inverso).
Alternativas descartadas: extrair um serviço de agregações partilhado
(sem necessidade real — só dois consumidores, ambos já servidos pela
API pública, refactor prematuro/YAGNI); duplicar queries em
`ReportsService` (rejeitada, sem nenhuma prova de que o reuso é
inadequado).

### `month.util.ts` — nunca duplica `resolvePeriod()`

`resolveMonth('YYYY-MM')` calcula só o primeiro/último dia ISO do mês e
delega em `resolvePeriod()` (Fase 7) toda a validação de calendário e a
construção dos limites UTC (`gte`/`lt`) — mesma disciplina UTC,
nenhuma lógica de datas nova. `previousMonth()` reutiliza a
normalização nativa do `Date.UTC` (mês zero-based `-1` recua o ano
automaticamente) para a transição janeiro → dezembro do ano anterior —
mesmo idioma já usado em `period.util.ts`.

### Comparação — sem `Infinity`/`NaN` por construção, não por validação a posteriori

`percentageChange` é sempre `null` quando o período anterior é zero —
a divisão nunca chega a acontecer (verificação antes do cálculo, não
depois). `absoluteChange` calculado via `Prisma.Decimal` (montantes) ou
aritmética inteira simples (contagens) — nunca `number` sobre strings
monetárias. `direction` (`increase`/`decrease`/`unchanged`) derivada do
sinal de `absoluteChange`, nunca recalculada a partir da percentagem.

### Detalhe de faturas — inclui `CANCELLED`, sem paginação

`invoices[]` não filtra por `status` — `CANCELLED` está presente,
distinguível pelo campo `status` (são documentos reais do período),
mesma decisão já confirmada na análise. Sem paginação: o volume é
naturalmente limitado por organização+mês (confirmado real nesta
validação — organizações reais com poucas dezenas de faturas/mês); a
revisitar só se o volume real de alguma organização o justificar.

### Exportação — PDFKit, sem biblioteca para CSV

Comparadas explicitamente PDFKit, `pdf-lib`, `@react-pdf/renderer` e
Puppeteer (HTML→PDF). **PDFKit** escolhida: zero dependências nativas,
fontes standard (`Helvetica`/`WinAnsiEncoding`) já cobrem acentuação
portuguesa sem embutir fonte nova, fluxo de texto e paginação
automáticos (ao contrário de `pdf-lib`, que exigiria calcular
manualmente cada posição Y), sem o runtime `react`/`yoga-layout` a
reboque que `@react-pdf/renderer` traria só para um documento estático
gerado no servidor, e sem o Chromium completo que Puppeteer exigiria
(`docker/api.Dockerfile` é Alpine — impacto desproporcionado para
"resumo + tabela"). **CSV escrito à mão**, sem dependência — RFC4180 é
simples o suficiente para não justificar um package: delimitador `;`
(no locale `pt-PT`, `,` é separador decimal — o Excel português espera
`;`), BOM UTF-8 (sem ele o Excel assume Latin-1 e desalinha acentos),
mitigação OWASP contra CSV injection (`'` prefixado em campos
iniciados por `=`/`+`/`-`/`@`). Esta recomendação não é tratada como
imutável — se uma alternativa objetivamente superior for identificada
numa fase futura, deve ser comparada e justificada antes de substituir
PDFKit, não assumida.

### JSON, CSV e PDF — sempre o mesmo `MonthlyFinancialReport`

Os três formatos chamam sempre `ReportsService.getMonthlyReport()` —
nunca uma query diferente por formato; os serializers CSV/PDF são
funções puras que só recebem o relatório já calculado, nunca tocam em
Prisma. Confirmado real: os três formatos devolvem o mesmo
`period.from`/`period.to` para o mesmo pedido.

### Resposta binária no NestJS — `res.send()` explícito, nunca o valor de retorno

Descoberta real durante a validação: devolver um `Buffer` diretamente
de um método de controller (mesmo com `@Res({ passthrough: true })`)
faz o NestJS tratá-lo como objeto serializável e responder com
`response.json(buffer)` (`{"type":"Buffer","data":[...]}`), nunca os
bytes binários reais — confirmado por um teste e2e que falhava com essa
assinatura exata antes da correção. O endpoint PDF usa `@Res()` sem
`passthrough` e chama `res.send(buffer)` explicitamente; o endpoint CSV
devolve uma `string` (que o NestJS já envia corretamente via
`response.send()`, sem este problema).

## Contrato final

```http
GET /reports/monthly?month=YYYY-MM        → MonthlyFinancialReport (JSON)
GET /reports/monthly.csv?month=YYYY-MM    → text/csv; charset=utf-8
GET /reports/monthly.pdf?month=YYYY-MM    → application/pdf
```

`month` omisso → mês atual (UTC), mesma omissão já usada pelo
dashboard. Sem `@Roles` em nenhuma rota — mesmo alcance de
`GET /dashboard/financial-summary`/`GET /invoices`.

```ts
interface MonthlyReportPeriod { month: string; from: string; to: string; }

interface PeriodComparisonValue {
  current: string; previous: string; absoluteChange: string;
  percentageChange: number | null;
  direction: 'increase' | 'decrease' | 'unchanged';
}

interface MonthlyFinancialReport {
  period: MonthlyReportPeriod;
  previousPeriod: MonthlyReportPeriod;
  totals: { invoiceCount, activeInvoiceCount, cancelledInvoiceCount, totalAmount, averageAmount };
  comparison: { totalAmount: PeriodComparisonValue; activeInvoiceCount: PeriodComparisonValue };
  byStatus: Array<{ status; count; totalAmount }>;
  byCategory: Array<{ categoryId; categoryName; count; totalAmount }>;
  topSuppliers: Array<{ supplierId; supplierName; count; totalAmount }>;
  invoices: Array<{ id; number; supplierName; categoryName; issueDate; dueDate; status; totalAmount }>;
}
```

## Ficheiros criados

```
apps/frontrest/api/src/reports/{reports.module,reports.controller,reports.service,month.util}.ts
apps/frontrest/api/src/reports/dto/monthly-report-query.dto.ts
apps/frontrest/api/src/reports/serializers/{csv,pdf}.serializer.ts
apps/frontrest/api/src/reports/month.util.spec.ts
apps/frontrest/api/src/reports/reports.service.spec.ts
apps/frontrest/api/src/reports/serializers/{csv,pdf}.serializer.spec.ts
apps/frontrest/api/test/reports.e2e-spec.ts

apps/frontrest/web/lib/reports.ts
apps/frontrest/web/lib/reports.test.ts
apps/frontrest/web/app/(dashboard)/reports/page.tsx
apps/frontrest/web/app/(dashboard)/reports/reports.test.tsx

docs/phases/phase-9-monthly-financial-reports-export-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/app.module.ts     — regista ReportsModule
apps/frontrest/api/package.json          — dependência pdfkit + @types/pdfkit

apps/frontrest/web/lib/nav-config.ts     — item "Relatórios" (/reports)

docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`DashboardModule`/`DashboardService`/`DashboardController`/
`FinancialDashboardSummary`/`resolvePeriod()` — **inalterados**.
`ai/` (Fase 8) — **inalterado**. Nenhuma migration Prisma.

## Testes adicionados

- **Backend, `month.util.spec.ts`** (13): mês normal, fevereiro
  (28/29 dias, ano bissexto), formato inválido, mês impossível (00/13),
  mês anterior (mesmo ano e transição janeiro→dezembro do ano
  anterior), `currentMonth()`.
- **Backend, `reports.service.spec.ts`** (17): chama `DashboardService`
  duas vezes com os períodos corretos; `totals`/`byStatus`/`byCategory`/
  `topSuppliers` vêm diretamente do resumo (mesma referência, sem
  recálculo); isolamento por organização; nunca consulta
  `InvoiceDraft`; detalhe inclui `CANCELLED`; detalhe ordenado por
  `issueDate` ascendente; relatório vazio; comparação positiva/
  negativa/igual/período anterior zero; nunca `Infinity`/`NaN`;
  precisão monetária via `Decimal` (`0.30 - 0.10 = 0.20` exato).
- **Backend, `csv.serializer.spec.ts`** (13): BOM, delimitador `;`,
  tabela de detalhe, tradução de estados, escaping de delimitador/
  aspas/quebra de linha, proteção CSV injection (`=`/`+`/`-`/`@`),
  montantes como texto exato, cabeçalhos em português.
- **Backend, `pdf.serializer.spec.ts`** (4): assinatura `%PDF-` e
  tamanho não-zero; conteúdo cresce proporcionalmente aos dados
  (confirmação estrutural, sem depender de inspeção visual exclusiva);
  relatório vazio válido; múltiplas faturas geram páginas adicionais
  reais (`/Count` > 1 confirmado no PDF gerado).
- **Backend e2e, `reports.e2e-spec.ts`** (15, store de Prisma
  mockado por mês real, não superficial): 401 sem token; MEMBER
  consegue ler; `organizationId` no query string rejeitado pelo
  `ValidationPipe` (`forbidNonWhitelisted`); organização sempre da
  identidade; duas organizações sem fuga de dados; mês inválido/
  impossível → 400; resposta JSON válida; período anterior zero →
  `percentageChange` null; nunca `InvoiceDraft`; CSV/PDF com headers e
  filename corretos; JSON/CSV/PDF referem-se ao mesmo período.
- **Frontend, `lib/reports.test.ts`** (4): download autenticado, criação
  e revogação do `ObjectURL` (ordem confirmada — revogação só depois do
  clique), filename do `Content-Disposition`, erro sanitizado em falha.
- **Frontend, `reports.test.tsx`** (13): loading, erro, vazio, dados
  preenchidos, comparação de aumento/redução/sem alteração/percentagem
  indisponível (nunca `Infinity`/`NaN` na UI), tabela de faturas,
  mudança de mês, mês vazio não dispara pedido, exportar CSV/PDF,
  erro de exportação.

## Resultados dos testes

- `pnpm typecheck` — 24/24.
- `pnpm build` — 14/14; rota `/reports` gerada (3.14 kB).
- `pnpm test` (raiz) — 18/18 tarefas: `@frontrest/api` 480/480 (440
  pré-existentes + 40 novos), `@frontrest/web` 57/57 (40 pré-existentes
  + 17 novos), `@frontrest/workers` 27/27 (inalterado).
- `pnpm --filter @frontrest/api test:e2e` — 122/122 (107 pré-existentes
  + 15 novos).

## Validação manual (Docker + dados reais)

Stack reconstruída (`docker compose build api web && docker compose up
-d`); confirmado que `pdfkit` foi corretamente empacotado na imagem
`api` (build/arranque sem erros). Token assinado dentro do container
(`JWT_ACCESS_SECRET` nunca impresso), organização real "ivoaovivo" (6
faturas reais em julho de 2026, incluindo a fornecedora "FARMACIA
ESPERANÇA").

`GET /reports/monthly?month=2026-07` — **todos os números conferem
byte-a-byte com os valores brutos da base de dados**: `totalAmount`
"470.00" (20+16+34+300+80+20), `activeInvoiceCount` 6,
`byStatus` PENDING 3/336.00, PAID 1/80.00, OVERDUE 2/54.00; comparação
com junho (sem faturas) → `percentageChange: null`, `direction:
"increase"`; `invoices[]` com 6 linhas, ordenadas por `issueDate`.

`GET /reports/monthly.csv` — `Content-Type: text/csv; charset=utf-8`,
`Content-Disposition` com filename correto, BOM UTF-8 confirmado nos 3
primeiros bytes (`ef bb bf`), **"FARMACIA ESPERANÇA" com o Ç
corretamente preservado** no CSV descarregado.

`GET /reports/monthly.pdf` — `Content-Type: application/pdf`,
`Content-Disposition` correto, ficheiro real de 1800 bytes começado por
`%PDF-`.

Isolamento: mês inválido (`2026-13`) → `400`; sem token → `401`;
organização real diferente ("Isolation Test Org") → `activeInvoiceCount:
0`, `invoices: []` (nenhum dado de "ivoaovivo" visível). Rota `/reports`
do frontend → `200`.

## Limitações conhecidas

- Confirmação visual no browser não foi tecnicamente possível neste
  ambiente (sem ferramenta de automação de browser instalada) —
  substituída pela validação mais forte disponível: chamadas HTTP reais
  contra Docker+Postgres reais com dados genuínos, inspeção byte-a-byte
  do CSV/PDF descarregados, e a suite de testes automatizados do
  frontend. Recomenda-se confirmação visual manual antes do fecho
  definitivo.
- Sem paginação no detalhe de faturas — decisão explícita (volume
  naturalmente limitado por mês), não uma omissão.
- PDF sem cabeçalho repetido por página (só a primeira página tem
  título/período) — simplificação aceite para esta foundation.

## Fora do âmbito (confirmado, não implementado)

Melhorias a OCR/Fiscal Parsing, alterações a Upload/InvoiceDraft/
Worker/Queues/Auth/Multi-tenant, alterações a Dashboard ou AI Chat,
Tool Calling, RAG, embeddings, pesquisa documental/OCR, extração de
linhas de fatura, comparação de produtos, inteligência sobre preços,
histórico de preços, agentes IA, workflow IA, packages novos,
abstrações genéricas prematuras, refactors oportunistas.

## Critérios de conclusão

- [x] Relatório mensal funciona exclusivamente sobre `Invoice`.
- [x] Comparação com o mês anterior funciona (validada real).
- [x] Mesma semântica da Fase 7 reutilizada (API pública, sem duplicação).
- [x] Sem queries financeiras duplicadas.
- [x] Sem pedidos HTTP internos ao dashboard.
- [x] Divisão por zero tratada (`percentageChange: null` antes do cálculo).
- [x] `Infinity`/`NaN` impossíveis no contrato (por construção).
- [x] Tenant isolation protegido (testes reais + validação Docker).
- [x] CSV válido, seguro (CSV injection mitigado) e compatível com caracteres portugueses.
- [x] PDF legível, suporta caracteres portugueses (validado real).
- [x] Headers de download corretos (validado real).
- [x] JSON, CSV e PDF derivam do mesmo contrato normalizado.
- [x] Sem persistência de relatórios.
- [x] Sem alteração ao fluxo de drafts/OCR.
- [x] Sem package novo.
- [x] Sem migration não justificada.
- [x] Testes unitários (40 novos), e2e (15 novos) e frontend (17 novos) a passar.
- [x] `pnpm typecheck`/`build`/`test` limpos.
- [x] Fluxo validado em Docker com dados reais.
- [ ] Interface validada manualmente no browser — pendente confirmação do utilizador (ver "Limitações conhecidas").
- [x] `docs/phases/phase-9-monthly-financial-reports-export-foundation.md` criado.
- [x] `docs/PHASES.md`/`docs/INDEX.md`/`docs/ARCHITECTURE.md` atualizados.

## Trabalho futuro

### Fase 8.1 — Financial AI Tools & Retrieval Foundation (proposta, não preparada)

**Problema identificado**: o Chat IA (Fase 8) responde bem sobre o
resumo financeiro fixo já incluído no `system prompt`, mas não consegue
responder a perguntas que exigem uma consulta nova e específica —
por fornecedor nomeado ("quanto devo à Farmácia Esperança"), por
produto ("preço médio do Paracetamol", "que produtos aumentaram de
preço"), por linha de fatura ("em que fatura aparece X"), ou pesquisa
sobre texto OCR/documental. Nenhuma destas consultas existe hoje, e
`InvoiceItem` (onde vive `description`/`unitPrice`, a granularidade de
produto) nunca é consultado por nenhum serviço atual.

**Porque não pertence à Fase 9**: a Fase 9 resolve relatórios
estruturados de âmbito fixo, não perguntas dinâmicas em linguagem
natural. Resolver isto acrescentando mais dados fixos ao `system
prompt` da Fase 8 violaria a regra já estabelecida nessa fase (contexto
pequeno, controlado, reconstruído por pedido) e não escalaria.

**Como deverá ser resolvido**: tool calling sobre `AiCompletionProvider`
(hoje sem suporte — `packages/ai`, Fase 6.11) e retrieval sobre dados
não estruturados (OCR, documentos). Alargado além de "tool calling"
para incluir também: consultas dinâmicas parametrizadas, pesquisa
documental, pesquisa sobre texto OCR, pesquisa de `InvoiceItem`,
histórico de preços, consultas financeiras especializadas.

**Princípio arquitetural a registar**: o Chat IA nunca deverá depender
do tamanho do contexto enviado ao modelo. Cada pergunta deve originar
apenas as consultas estritamente necessárias — o contexto é construído
dinamicamente por pergunta, nunca acumulado; deve evitar-se
ativamente o crescimento contínuo do prompt com dashboards, relatórios,
OCR e demais dados financeiros "só para garantir" que a resposta está
lá. A IA atua como **orquestrador** das ferramentas disponíveis, nunca
como repositório permanente de toda a informação financeira.

**Ferramentas orientadas por domínio, não por pergunta**: as
ferramentas disponibilizadas ao modelo devem ser genéricas e
reutilizáveis (`getInvoices()`, `getSupplierBalance()`,
`getMonthlyReport()`, `searchInvoiceItems()`, `searchDocuments()`) —
nunca uma ferramenta por pergunta concreta
(`howMuchDoIOweToSupplier()`, `whatProductsIncreased()`). O modelo
combina livremente capacidades genéricas para responder a perguntas
diferentes, em vez de a arquitetura antecipar cada pergunta possível.

### Visão futura — memória e personalização (documentação de evolução, não implementável nesta nem na próxima fase)

O FrontRest IA deverá evoluir, em fases futuras próprias, para um
assistente financeiro capaz de: aprender padrões de utilização,
reconhecer perguntas frequentes, sugerir automaticamente análises
mensais, personalizar os insights apresentados, recordar preferências
do utilizador, sugerir consultas úteis sem que o utilizador as tenha de
escrever sempre.

Esta memória não deve ser implementada através de ficheiros Markdown,
nem depender exclusivamente do contexto enviado ao LLM (mesmo
princípio da Fase 8.1 — o contexto é efémero, por pedido, nunca o local
de memória persistente). A arquitetura deverá prever, quando essa
necessidade for real e não hipotética, uma camada própria e distinta
de: preferências, padrões de utilização, memória persistente, insights
proativos — sempre isolada por organização **e** utilizador, auditável,
e compatível com RGPD (minimização de dados, direito ao apagamento,
finalidade explícita de cada dado guardado).

Registada como visão de arquitetura para reavaliação futura — nenhuma
destas capacidades é implementada, desenhada em detalhe, nem
transformada em modelo de dados nesta fase.

## Próxima fase

Confirmação visual manual desta fase (bloqueante para fecho
definitivo); depois, candidatos naturais: Fase 8.1 (proposta acima, se
aprovada); mais formatos de relatório (trimestral/anual), só com
necessidade real confirmada.
