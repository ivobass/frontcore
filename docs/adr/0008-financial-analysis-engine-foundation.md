# ADR-0008: Financial Analysis Engine Foundation — separação entre factos e conclusões financeiras

- **Estado:** Aceite
- **Data:** 2026-07-30
- **Fase:** 8.10 — Financial Analysis Engine Foundation

## Contexto

Desde a Fase 8.9, `financial-insights/` (`apps/frontrest/api/src/financial-insights/`)
deriva, de forma pura e determinística, os KPIs financeiros (ranking de
fornecedores/categorias, concentração, saldo por pagar, maior
fatura/fornecedor/categoria, tendência mensal) a partir de
`DashboardService.getFinancialSummary()`/`getLargestInvoices()`. Esse
módulo produz **factos e métricas** — nunca uma conclusão interpretada,
nunca uma explicação do que esses números significam.

A Fase 8.10 introduz uma responsabilidade nova, genuinamente distinta:
interpretar esses factos já produzidos e gerar **conclusões
determinísticas, tipadas e rastreáveis**, acompanhadas da evidência
numérica que as sustenta — para reutilização futura por AI Chat,
Dashboard e Reports (nenhum dos três integrado nesta fundação).
Acrescentar essa responsabilidade dentro de `financial-insights/`
misturaria de novo duas preocupações que a análise desta fase decidiu
manter separadas — o mesmo tipo de tangling que a Fase 6.10 (ADR-0007)
corrigiu para `fiscal-parsing/` (motor genérico de extração vs.
especialização de domínio, então na mesma classe).

## Decisão

**Três níveis, explicitamente separados:**

1. **Financial Insights** (`financial-insights/`, Fase 8.9, inalterado)
   — produz factos e métricas.
2. **Financial Analysis Engine** (`financial-analysis/`, esta fase) —
   interpreta esses factos e produz conclusões determinísticas
   suportadas por evidências.
3. **Consumidores** (AI Chat, Dashboard, Reports) — apenas apresentam
   ou comunicam as conclusões; nenhuma lógica de interpretação própria.
   Nenhum destes é alterado nesta fundação.

**Novo módulo único, `apps/frontrest/api/src/financial-analysis/`** —
irmão de topo de `financial-insights/`, não um package, não aninhado em
`ai/`. Contém, no mesmo módulo, o contrato genérico, o motor de
composição, as duas análises concretas aprovadas, os tipos e os testes:

```ts
interface FinancialAnalysisResult<TId extends string, TConclusion extends string, TEvidence> {
  readonly id: TId;
  readonly conclusion: TConclusion;
  readonly evidence: TEvidence;
}

interface FinancialAnalysis<TId extends string, TConclusion extends string, TEvidence> {
  readonly id: TId;
  analyze(insights: FinancialInsights): FinancialAnalysisResult<TId, TConclusion, TEvidence> | null;
}

function runFinancialAnalyses(
  analyses: RegisteredFinancialAnalysis[],
  insights: FinancialInsights,
): { results: FinancialAnalysisOutcome[]; metadata: FinancialAnalysisMetadata };
```

`FinancialAnalysisOutcome`/`RegisteredFinancialAnalysis` são uniões
discriminadas **fechadas** (por `id`), não uma generalização para
`string`/`unknown` — cada análise nova acrescenta um membro explícito à
união, nunca a reabre para um tipo aberto. `RegisteredFinancialAnalysis`
(correção pós-revisão; nome anterior, `AnyFinancialAnalysis`, sugeria
abertura que o tipo nunca teve) representa o conjunto fechado de
análises registadas e aprovadas pelo motor, não qualquer análise
arbitrária. `analyze()` é síncrono (sem I/O, sem geração por LLM nesta
fundação) e o motor não resolve conflitos entre análises, porque
nenhuma duas competem pelo mesmo `id`. `analysesRun` na metadata é
tipado como `readonly FinancialAnalysisId[]` (`FinancialAnalysisId =
FinancialAnalysisOutcome['id']`) — nunca `string[]` livre.
A metadata do motor (`analysesRun`, `conclusionsProduced`) é puramente
determinística — sem `processingTimeMs` nem qualquer valor que dependa
do momento de execução.

Duas análises concretas, mínimas e representativas:

- **`monthly_trend`** — reutiliza exclusivamente o `TrendComparison` já
  produzido por `financial-insights/`; `increase`/`decrease`/`unchanged`,
  ou `null` quando não existe comparação válida.
- **`relative_concentration`** — compara `supplierConcentration.share`
  com `categoryConcentration.share`, sem limiar nem regra financeira
  nova, só a grandeza relativa entre os dois; só aplicável quando ambos
  os `share` existem e ambos os `topN` efetivos são iguais.

## Onde não vive, e porquê

- **Dentro de `financial-insights/`** — rejeitada. Foi precisamente a
  alternativa descartada por esta fase: voltaria a misturar "produzir
  factos" com "interpretar factos", a mesma tangling que a Fase 6.10
  corrigiu noutro módulo.
- **`packages/financial-analysis`** — rejeitada por YAGNI, mesmo
  raciocínio do ADR-0007 para `packages/document-extraction`: sem
  segundo consumidor real fora de FrontRest hoje (Chat/Dashboard/Reports
  são três consumidores dentro do mesmo produto, não um segundo
  produto FrontCore).
- **Aninhado em `apps/frontrest/api/src/ai/`** — rejeitada. `ai/` é,
  na prática, a pasta específica do AI Chat (`ai/financial-retrieval/`,
  `ai/tools/`, `ai/router/`); aninhar o motor ali sugeriria uma
  propriedade do Chat que contradiz o requisito de reutilização futura
  por Dashboard e Reports, nenhum dos quais é consumidor de `ai/`.
- **Dois módulos desde já** (motor genérico separado das análises
  concretas, espelhando o estado final de `document-extraction/`/
  `fiscal-parsing/`) — rejeitada nesta fundação. Com apenas duas
  análises demonstradoras, dividir já em dois módulos seria estrutura
  prematura (regra anti-caos, `docs/PROJECT_STRUCTURE.md`) sem nenhum
  segundo consumidor concreto do motor genérico isoladamente.

## Consequências

**Positivas**

- Separação de responsabilidades explícita e nomeada: um consumidor
  futuro (Chat, Dashboard, Reports) importa `financial-analysis/` sem
  nunca precisar de reinterpretar `FinancialInsights` por conta própria.
- `financial-insights/` permanece exatamente como a Fase 8.9 o deixou —
  zero alteração ao seu contrato, tipos ou testes.
- A união discriminada fechada garante, em tempo de compilação, que
  cada conclusão mantém `id`/`conclusion`/`evidence` tipados em
  conjunto — impossível agregar um resultado com `string`/`unknown`.

**Negativas / trade-offs aceites**

- Um módulo com apenas duas análises concretas — aceite conscientemente
  como fundação mínima representativa (contrato, composição,
  rastreabilidade, determinismo, reutilização futura), não como
  cobertura funcional completa; aging de faturas, rankings completos,
  forecasting, scoring, recomendações e agentes ficam fora,
  explicitamente, desta fase.
- Nenhum consumidor real ainda (mesma situação inicial de
  `document-extraction/` só com `fiscal-parsing/`, aceite no ADR-0007)
  — módulo produzido, não consumido, nesta fundação.

## Critério para uma futura divisão interna

Uma separação futura do módulo único (ex. motor genérico num módulo,
análises concretas noutro) só se justifica perante **responsabilidades
independentes, ciclos de mudança distintos, ou reutilização concreta**
— nunca pelo número de análises. Exemplos concretos que justificariam
reabrir esta decisão: um segundo consumidor que precise só do motor
genérico sem nenhuma das análises concretas; uma análise futura cujo
ciclo de alteração seja claramente independente das duas existentes
(ex. depende de uma fonte de dados adicional que as outras não usam);
ou uma responsabilidade nova que não pertença nem ao motor nem a uma
análise individual. A mera adição de uma terceira ou quarta análise,
por si só, não é critério suficiente.

## Alternativas consideradas

Ver secção "Onde não vive, e porquê", acima — analisadas e descartadas
com justificação explícita, não hipóteses não exploradas.
