# Fase 8.1 — Financial AI Retrieval Foundation

## Objetivo

Substituir o resumo financeiro fixo do período por omissão (Fase 8) por
retrieval financeiro estruturado: a intenção e o período de cada
mensagem do chat são resolvidos deterministicamente (nunca pelo LLM), o
backend consulta só os dados relevantes para essa pergunta através de
`DashboardService` (Fase 7), e o contexto enviado ao provider passa a
ser compacto e específico da pergunta, em vez de um resumo genérico do
mês atual.

## Âmbito

Retrieval estruturado executado no backend, antes da chamada ao
`AiCompletionProvider`. Conjunto fechado de 6 intenções financeiras;
resolução de período por texto (regex/palavras-chave, português de
Portugal); fallback explícito para perguntas não suportadas, período em
falta/ambíguo e erro interno. Sem tools, function calling, agentes,
RAG, embeddings, vector database, SQL gerado pelo modelo, segunda
completion de planeamento, escrita sobre o domínio financeiro, detalhe
de fatura individual, comparação entre períodos, ou qualquer alteração
ao contrato público do chat (`POST /ai/chat`, `GET /ai/conversations`,
`GET /ai/conversations/:id` — corpo/resposta inalterados).

## Estado inicial

`AiTenantContextService.buildSystemMessage(organizationId)` (Fase 8)
chamava sempre `DashboardService.getFinancialSummary(organizationId,
{})` — período omisso, sempre o mês atual — e injetava o resumo
completo (totais, por estado, tendência mensal, categorias,
fornecedores) no `system prompt`, independentemente da pergunta. Uma
pergunta sobre outro período ficava sem dados; uma pergunta sobre um
único bloco (ex. "principais fornecedores") recebia sempre todos os
blocos. `DashboardService.getFinancialSummary()` já expunha todos os
agregados necessários às 6 intenções desta fase — nenhuma lacuna
encontrada, nenhuma extensão ao contrato público do dashboard foi
necessária. `resolvePeriod()` (Fase 7) e `resolveMonth()`/
`previousMonth()`/`currentMonth()` (Fase 9) já continham toda a
validação de calendário/UTC necessária para a resolução de período
desta fase — reutilizados por inteiro, nunca duplicados.

**Conflito identificado com a documentação existente**: o "Trabalho
futuro" da Fase 9 (`docs/phases/phase-9-monthly-financial-reports-export-foundation.md`)
propunha "Fase 8.1 — Financial AI Tools & Retrieval Foundation" como
uma fase baseada em *tool calling* sobre `AiCompletionProvider`. O
pedido que deu origem a este documento redefine explicitamente essa
proposta: a solução aprovada para esta fase é retrieval estruturado
**no backend, antes** da chamada ao provider — nunca tools/function
calling, que ficam para uma fase posterior, só com necessidade real
confirmada. Essa proposta nunca tinha sido implementada nem tinha
estado formalmente decidida (documentada como "proposta, não
preparada") — não existe, por isso, uma decisão já aprovada a reabrir,
só uma proposta anterior a substituir por uma decisão explícita agora
tomada. Registado aqui em vez de assumido silenciosamente.

## Arquitetura implementada

### Fluxo

```text
Mensagem do utilizador (já persistida como USER)
        ↓
resolveFinancialIntent(mensagem) — regex/palavras-chave, sem LLM
        ↓ (UNSUPPORTED → guia o modelo a admitir falta de capacidade)
resolveFinancialPeriod(mensagem, now) — regex/palavras-chave, sem LLM
        ↓ (MISSING/AMBIGUOUS → guia o modelo a pedir clarificação)
FinancialRetrievalService.retrieve(organizationId, mensagem, now)
        ↓
DashboardService.getFinancialSummary(organizationId, { from, to })
        ↓
seleção do subconjunto relevante para a intenção (FinancialIntentData)
        ↓
buildFinancialContextMessage(resultado) — texto compacto, pt-PT
        ↓
AiTenantContextService.buildSystemMessage() — regras fixas + bloco de dados
        ↓
AiCompletionProvider.complete() — contrato inalterado (Mock/Ollama)
```

`AiChatService` muda uma única linha: `buildSystemMessage(organizationId)`
passa a `buildSystemMessage(organizationId, content)` — `content` é a
mesma mensagem já validada e persistida como `USER` antes desta
chamada. Todo o resto do fluxo (persistência da mensagem `USER` antes
do provider, histórico carregado depois, mensagem `ASSISTANT` só após
sucesso, sanitização de erros do provider, isolamento por organização
e utilizador) permanece exatamente como na Fase 8 — nenhum destes
comportamentos foi tocado.

### `financial-intent.resolver.ts` — intenção, sem LLM

Conjunto fechado e tipado (`FinancialIntentType`): `FINANCIAL_SUMMARY`,
`OUTSTANDING_BALANCE`, `BY_STATUS`, `BY_CATEGORY`, `TOP_SUPPLIERS`,
`MONTHLY_TREND`. Texto normalizado (minúsculas, sem acentos);
padrões de exclusão (escrita, detalhe de fatura, comparação entre
períodos) verificados **antes** dos de inclusão, para nunca classificar
um pedido de alteração como uma consulta válida só por coincidência
lexical. Qualquer mensagem que não corresponda a nenhum padrão
reconhecido devolve `UNSUPPORTED` — nunca uma intenção livre.

### `financial-period.resolver.ts` — período, sem LLM

Reutiliza sempre `resolvePeriod()` (Fase 7) e `resolveMonth()`/
`previousMonth()`/`currentMonth()` (Fase 9) para toda a validação de
calendário e construção dos limites UTC — nunca uma segunda semântica
temporal. Suporta: mês atual/mês passado, ano atual/ano passado, mês
explícito (com ou sem ano), e um intervalo explícito de meses (`"de
<mês> [de <ano>] a <mês> de <ano>"`). Devolve `RESOLVED`, `MISSING`
(nenhuma expressão de período reconhecida) ou `AMBIGUOUS` (uma
expressão temporal foi reconhecida mas não resolve para um período
concreto — ex. "no Natal", "esta semana" — ou resolve para um
intervalo impossível, ex. `from > to`; capturado sempre por `try/catch`
interno, nunca lança). `currentMonth()` (`reports/month.util.ts`) ganhou
um parâmetro opcional `referenceDate` (omissão `new Date()`) — extensão
aditiva, retrocompatível, só para os testes desta fase controlarem a
data determinísticamente, sem depender da data real da máquina.

### `financial-retrieval.service.ts` — orquestração

`FinancialRetrievalService.retrieve(organizationId, message, now)`:
resolve intenção → resolve período → chama exclusivamente
`DashboardService.getFinancialSummary(organizationId, { from, to })` →
seleciona só o subconjunto de campos relevante para a intenção
(`FinancialIntentData`, uma união discriminada por `intent` — nunca
`any`). `organizationId` vem sempre do chamador autenticado (nunca da
mensagem); nunca acede ao Prisma diretamente; nunca conhece o provider.
Uma falha do `DashboardService` é capturada e devolvida como `{ kind:
'ERROR' }` — nunca propaga a exceção para dentro do fluxo do chat.

### `financial-context.builder.ts` — texto para o provider

Função pura `buildFinancialContextMessage(FinancialRetrievalResult):
string`. Cada `kind` (`UNSUPPORTED`, `PERIOD_MISSING`,
`PERIOD_AMBIGUOUS`, `ERROR`, `DATA`) produz um bloco de texto explícito
e distinto — o modelo nunca precisa de adivinhar porque não recebeu
dados. Dentro de `DATA`, só o bloco da intenção pedida é incluído
(nunca todos os agregados); um array vazio produz "Sem faturas
confirmadas neste período." em vez de um bloco ausente — uma consulta
válida sem resultados nunca é apresentada como erro. Estados
(`InvoiceStatus`) sempre traduzidos aqui, nunca o enum bruto.

### `AiTenantContextService` — fica só orquestração

Reduzida a compor `ASSISTANT_RULES` (regras fixas, agora com uma linha
adicional sobre nunca afirmar que executou uma ação e sobre nunca
assumir um período não indicado) com o bloco devolvido por
`buildFinancialContextMessage()`. Já não conhece `DashboardService`
nem `Prisma.Decimal` diretamente — essa lógica moveu-se para
`FinancialRetrievalService` (cálculo de "Por pagar") e
`financial-context.builder.ts` (formatação).

## Ficheiros criados

```
apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.spec.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-period.resolver.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-period.resolver.spec.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.spec.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.spec.ts

docs/phases/phase-8.1-financial-ai-retrieval-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/ai/ai-tenant-context.service.ts       — delega em FinancialRetrievalService + builder
apps/frontrest/api/src/ai/ai-tenant-context.service.spec.ts   — reescrito para o novo comportamento
apps/frontrest/api/src/ai/ai-chat.service.ts                  — buildSystemMessage(organizationId, content)
apps/frontrest/api/src/ai/ai-chat.service.spec.ts              — assert atualizado (organizationId + mensagem)
apps/frontrest/api/src/ai/ai.module.ts                         — regista FinancialRetrievalService
apps/frontrest/api/src/reports/month.util.ts                   — currentMonth(referenceDate?), aditivo
apps/frontrest/api/src/reports/month.util.spec.ts               — + 1 teste (data de referência explícita)
apps/frontrest/api/test/ai-chat.e2e-spec.ts                     — + 1 teste de integração do retrieval

docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`DashboardService`, `DashboardModule`, `AiController`, os DTOs do chat,
o schema Prisma e os providers `MockAiProvider`/`OllamaAiProvider`
(`packages/ai`) **não foram alterados** — nenhuma migration, nenhum
package novo, nenhuma dependência externa nova, nenhuma alteração ao
frontend.

## Intenções e períodos suportados

| Intenção | Exemplos | Dados recuperados | Sem correspondência |
|---|---|---|---|
| `FINANCIAL_SUMMARY` | "Quanto gastei este mês?", "Qual foi o total do mês passado?" | `totals` (faturas ativas, total, média, canceladas) | — |
| `OUTSTANDING_BALANCE` | "Quanto tenho por pagar este ano?" | `outstandingCount`/`outstandingAmount` (Pendente+Vencida, `Prisma.Decimal`) | — |
| `BY_STATUS` | "Mostra os valores por estado em junho.", "quantas faturas há em cada estado" | `byStatus` (traduzido) | — |
| `BY_CATEGORY` | "Quais foram as principais categorias em maio?" | `byCategory` | — |
| `TOP_SUPPLIERS` | "Quais foram os principais fornecedores este ano?" | `topSuppliers` | — |
| `MONTHLY_TREND` | "Mostra a evolução mensal deste ano." | `monthlyTrend` | — |
| *(nenhuma)* | não financeira, detalhe/número de fatura, comparação entre períodos, escrita/aprovação/criação | nenhum | `UNSUPPORTED` — orienta o modelo a admitir a limitação e a indicar as consultas suportadas |

Semântica temporal: "mês atual"/"este mês" e "mês passado"/"mês
anterior" (mês civil imediatamente anterior, com rollover
dezembro→janeiro do ano anterior); "ano atual"/"este ano" e "ano
passado"/"ano anterior" (ano civil); mês explícito nomeado (assume o
ano da data de referência quando omisso); mês explícito com ano;
intervalo explícito de meses. Ausência de qualquer expressão de
período → `PERIOD_MISSING`; expressão reconhecida mas não resolvível
(ou intervalo impossível) → `PERIOD_AMBIGUOUS` — nunca cai
silenciosamente no mês atual em nenhum dos dois casos. Timezone e
limites inclusivos/exclusivos idênticos aos já usados pelo Dashboard
(`resolvePeriod()`, sempre UTC).

## Contratos

`AiCompletionProvider`/`AiCompletionRequest`/`AiCompletionResponse`/
`AiMessage` (`packages/ai`) **permanecem inalterados** — confirmado por
inspeção do código e pelos testes de `packages/ai` (não tocados).
`POST /ai/chat`, `GET /ai/conversations`, `GET /ai/conversations/:id`
inalterados (corpo público idêntico à Fase 8, sem intenção, período,
tool ou `organizationId` expostos ao cliente).

```ts
type FinancialIntentType =
  | 'FINANCIAL_SUMMARY' | 'OUTSTANDING_BALANCE' | 'BY_STATUS'
  | 'BY_CATEGORY' | 'TOP_SUPPLIERS' | 'MONTHLY_TREND';

type FinancialRetrievalResult =
  | { kind: 'UNSUPPORTED' }
  | { kind: 'PERIOD_MISSING' }
  | { kind: 'PERIOD_AMBIGUOUS' }
  | { kind: 'ERROR' }
  | { kind: 'DATA'; period: { from: string; to: string }; data: FinancialIntentData };
```

## Testes

- `financial-intent.resolver.spec.ts` (17): as 7 intenções + variações
  de fraseado; escrita/alteração, detalhe de fatura, comparação e
  pergunta não financeira sempre `UNSUPPORTED`; máximo uma intenção por
  mensagem; insensível a acentuação/maiúsculas.
- `financial-period.resolver.spec.ts` (14): mês/ano atual e
  anterior (com transição dezembro→janeiro), mês explícito com/sem ano,
  fevereiro em ano bissexto/não bissexto, intervalo explícito (mesmo
  ano e anos diferentes), intervalo inválido → `AMBIGUOUS` (nunca
  lança), expressão temporal não resolvível → `AMBIGUOUS`, ausência de
  período → `MISSING`, independência da data real da máquina.
- `financial-retrieval.service.spec.ts` (14): `UNSUPPORTED`/
  `PERIOD_MISSING`/`PERIOD_AMBIGUOUS` nunca chamam o `DashboardService`;
  `organizationId` e período corretos encaminhados; cada intenção
  devolve só o seu subconjunto de dados (nunca outros blocos); "Por
  pagar" via `Prisma.Decimal`, incluindo zero; consulta válida sem
  faturas devolve `DATA`, nunca `UNSUPPORTED`/`ERROR`; erro do
  `DashboardService` → `ERROR`, nunca propaga; isolamento por
  organização.
- `financial-context.builder.spec.ts` (13): texto distinto por `kind`;
  bloco de dados correto e exclusivo por intenção; zero nunca omitido
  (`OUTSTANDING_BALANCE`); array vazio produz nota explícita; estados
  sempre traduzidos; nenhum dado técnico (stack, SQL, `organizationId`)
  em nenhum `kind`.
- `ai-tenant-context.service.spec.ts` (14, reescrito): delega
  corretamente no retrieval com organização+mensagem+data de
  referência; regras obrigatórias preservadas (mesmas da Fase 8, mais a
  nova); os 5 `kind` do retrieval produzem o texto correto na mensagem
  `system` final.
- `ai-chat.service.spec.ts`: preservado por inteiro (23 testes já
  existentes da Fase 8 continuam a passar sem alteração de
  comportamento) — só a asserção de `buildSystemMessage` foi atualizada
  para incluir a mensagem.
- `month.util.spec.ts`: + 1 teste (`currentMonth(referenceDate)`).
- `ai-chat.e2e-spec.ts`: + 1 teste de integração ponta a ponta
  (intenção suportada — "Quanto tenho por pagar este mês?" — resolve o
  período, confirma a chamada real a `prisma.invoice.groupBy` via
  `DashboardService`, e devolve a resposta do Mock provider com o
  contrato público inalterado). Um único teste é suficiente aqui: o que
  um e2e prova, e nenhum teste unitário prova sozinho (esses instanciam
  os serviços à mão, sem passar pela injeção do Nest), é que a árvore de
  injeção de `AiModule` com `FinancialRetrievalService` liga
  corretamente ponta a ponta — os restantes casos (não suportada,
  período em falta/ambíguo, fallback de escrita) já têm cobertura
  exaustiva e determinística nas suites unitárias acima, sem precisar de
  repetição a este nível. Os 15 testes de isolamento/histórico/erros
  pré-existentes da Fase 8 continuam a passar sem alteração.

## Validações executadas

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | 24/24 |
| `pnpm build` | 14/14 (sem alteração ao frontend) |
| `pnpm test` | 18/18 tarefas — `@frontrest/api` 542/542 (480 pré-existentes + 62 novos), `@frontrest/web` 57/57 (inalterado), `@frontrest/workers` 27/27 (inalterado) |
| `pnpm --filter @frontrest/api test:e2e` | 123/123 (122 pré-existentes + 1 novo) |

Nenhum comando falhou sem correção subsequente registada nesta secção
— não houve nenhuma falha real durante esta implementação além do
ajuste de tipagem trivial de um `it.each` na primeira escrita de
`financial-intent.resolver.spec.ts` (corrigido antes da primeira
execução completa).

## Validação manual

Stack reconstruída (`docker compose build api && docker compose up -d
api`); arranque confirmado sem erros, com `AiModule`/`ReportsController`
mapeados normalmente (prova de que a árvore de injeção com
`FinancialRetrievalService` está correta). Organização real
"ivoaovivo" (6 faturas confirmadas, julho de 2026: `PENDING`
3×336.00, `PAID` 1×80.00, `OVERDUE` 2×54.00 — confirmado por `SELECT`
direto ao PostgreSQL real).

**Com `AI_PROVIDER=mock`**: as 7 perguntas suportadas do enunciado
mais os 5 cenários de fallback (não financeira, comparação, detalhe de
fatura, escrita, período ambíguo) completaram todos com sucesso (sem
500/erro), incluindo contra dados reais e isolamento entre
organizações ("Isolation Test Org", 0 faturas) — confirma que o
pipeline de retrieval nunca lança para nenhum destes casos.
`MockAiProvider` ecoa sempre a última mensagem (a pergunta do
utilizador, nunca o `system prompt`), por isso não permite inspecionar
o texto de dados diretamente — essa cobertura vem das suites unitárias
acima, exaustivas para cada `kind`.

**Com `AI_PROVIDER=ollama`, `AI_MODEL=qwen3:4b`** (servidor Ollama
local real): "Quanto tenho por pagar este mês?" → resposta real do
modelo **"390,00 EUR" (5 faturas)** — confirmado byte-a-byte contra o
`SELECT` direto (`PENDING` 3+`OVERDUE` 2 = 5 faturas, 336.00+54.00 =
390.00), prova que `OUTSTANDING_BALANCE` seleciona e calcula o
subconjunto correto e que o modelo usa o valor já calculado sem o
recalcular. "Quanto gastei este mês?" → o modelo recebeu corretamente
o total real (470,00 EUR, igual ao `SELECT` direto) no bloco de dados,
mas produziu uma resposta confusa ("não é possível determinar") apesar
de o valor estar presente — limitação de raciocínio do modelo local
pequeno (4B parâmetros, CPU), não do retrieval (o dado injetado estava
correto; ver "Limitações conhecidas").

## Limitações conhecidas

- **Latência do Ollama local**: `qwen3:4b` neste ambiente de
  desenvolvimento (CPU, sem GPU) levou consistentemente >120s
  (`AI_TIMEOUT_MS`) para várias perguntas durante a validação manual
  (`BY_STATUS`, o cenário de período ambíguo), incluindo para um
  `system prompt` pequeno sem bloco de dados — não reproduzido de forma
  previsível (o mesmo tipo de pedido por vezes responde em ~30s, por
  vezes expira). Não é uma regressão desta fase (o `AI_TIMEOUT_MS` e o
  mapeamento para `504` já existiam desde a Fase 8) — é uma
  característica conhecida de correr um modelo de 4B parâmetros
  localmente em CPU, exacerbada pelo modo de "thinking" do Qwen3.
  Confirmação visual manual no browser não foi tecnicamente possível
  neste ambiente (sem ferramenta de automação de browser instalada) —
  mesma limitação já registada nas Fases 5.4/6.8/8/9.
- **Qualidade de resposta do modelo local pequeno**: numa das respostas
  reais confirmadas (`FINANCIAL_SUMMARY`), o modelo recebeu o valor
  correto mas descreveu-o de forma pouco clara — o retrieval e o
  contexto estavam corretos (confirmado byte-a-byte), a limitação é da
  capacidade de raciocínio do modelo `qwen3:4b` local, não do código
  desta fase. Um provider maior (cloud, ou um modelo local maior)
  tenderia a explicar o mesmo dado com mais clareza.
- **Resolução de período por regex**: cobre as formas de fraseado
  explicitamente pedidas (mês/ano atual/anterior, mês explícito,
  intervalo de meses) — não é um parser linguístico genérico; frases
  fora destas formas (ex. "no último trimestre", "há 3 meses") são
  tratadas como `PERIOD_MISSING`/`PERIOD_AMBIGUOUS`, nunca interpretadas
  incorretamente, mas também nunca resolvidas.
- **Uma intenção principal por mensagem**: uma pergunta que misture duas
  intenções suportadas (ex. "mostra o total e os fornecedores") resolve
  só a primeira que corresponder à ordem de prioridade interna — por
  desenho desta foundation (ver Requisitos, "cada mensagem produz no
  máximo uma intenção financeira principal"), não uma limitação a
  corrigir aqui.

## Fora do âmbito (confirmado, não implementado)

Tools/function calling, tool definitions, tool execution, alteração ao
contrato de `AiCompletionProvider`, alteração estrutural aos providers
Mock/Ollama, novos providers (OpenAI/Anthropic/Azure/OpenRouter),
streaming, structured outputs genéricos, segunda completion de
planeamento, agentes, loops multi-step, múltiplas consultas por
mensagem, RAG, embeddings, vector database, pesquisa semântica, SQL
gerado pelo modelo, acesso do modelo ao Prisma, escrita/alteração de
faturas/fornecedores/categorias, aprovação/marcação de pagamentos,
detalhe de fatura individual, pesquisa por número de fatura, retrieval
de OCR/documentos, comparação entre períodos, previsões/recomendações
automáticas, cache do retrieval, persistência do contexto financeiro,
novo worker/fila/infraestrutura, novo package, nova migration,
dependência externa nova, alteração ao frontend, refactors oportunistas
fora do descrito acima.

## Critérios de conclusão

- [x] Documentação obrigatória lida a partir de `docs/INDEX.md`.
- [x] Estado real do código confirmado antes da implementação.
- [x] Contratos atuais identificados e respeitados (`AiCompletionProvider` inalterado, HTTP do chat inalterado).
- [x] O chat deixou de usar sempre o período por omissão — resolvido por mensagem.
- [x] Intenção e período resolvidos deterministicamente, sem LLM.
- [x] Período resolvido antes da consulta financeira.
- [x] Conjunto fechado e tipado de intenções, com `UNSUPPORTED` explícito.
- [x] Período em falta/ambíguo tratados explicitamente, nunca mês atual silencioso.
- [x] Máximo uma intenção principal por mensagem.
- [x] Retrieval usa exclusivamente `organizationId` autenticado.
- [x] `DashboardService` reutilizado por inteiro — nenhuma query financeira duplicada.
- [x] Cálculos financeiros permanecem no backend (`Prisma.Decimal`).
- [x] Só os dados relevantes por intenção chegam ao provider.
- [x] Consultas válidas sem resultados distintas de erro; zero nunca omitido.
- [x] `AiCompletionProvider` inalterado — sem tools/function calling.
- [x] Mock e Ollama continuam funcionais (validado real).
- [x] Mensagem `USER` persistida antes do provider; `ASSISTANT` só após sucesso; histórico sem duplicação.
- [x] Isolamento por organização e por utilizador preservado (15 testes e2e da Fase 8 continuam a passar).
- [x] Testes unitários de intenção, período, retrieval e contexto adicionados (58 novos).
- [x] Testes temporais independentes da data real da máquina.
- [x] Testes existentes do AI Chat continuam a passar sem alteração de comportamento.
- [x] Nenhum package novo, dependência externa, migration ou infraestrutura nova.
- [x] Frontend não alterado.
- [x] `pnpm typecheck`/`build`/`test` limpos; `test:e2e` limpo.
- [x] Validação manual com Mock executada.
- [x] Validação manual com Ollama executada (real, dados cross-checados).

## Observações para fases futuras

### Latência de modelos locais pequenos sob `AI_TIMEOUT_MS` fixo

**Problema encontrado**: durante a validação manual, `qwen3:4b` local
(CPU) excedeu `AI_TIMEOUT_MS` (120s) de forma inconsistente — a mesma
categoria de pergunta ora respondeu em ~30s, ora expirou.

**Impacto**: um utilizador real com um provider local lento pode ver
`504` de forma imprevisível, mesmo para perguntas simples.

**Sugestão**: nenhuma ação de código — é uma característica conhecida
de correr modelos locais pequenos em CPU. Se se tornar recorrente,
considerar tornar `AI_TIMEOUT_MS` configurável por ambiente com um
valor mais alto para desenvolvimento local, sem alterar a omissão de
produção.

**Prioridade**: Baixa.

### Fase 8.1 original (tool calling) — ainda não implementada

**Problema encontrado**: a proposta original da Fase 9 para "Fase
8.1" (tool calling + retrieval de documentos/OCR/`InvoiceItem`/preço)
continua válida como direção futura — esta fase resolve só a parte de
retrieval estruturado sobre agregados já existentes do Dashboard, não
tool calling nem pesquisa sobre dados não estruturados.

**Impacto**: perguntas sobre um fornecedor nomeado, um produto, uma
linha de fatura ou texto OCR continuam fora do alcance do chat
(tratadas como `UNSUPPORTED`, nunca incorretamente).

**Sugestão**: uma fase futura dedicada a tool calling sobre
`AiCompletionProvider` (exigirá primeiro estender o contrato de
`packages/ai`, hoje sem suporte), com ferramentas orientadas por
domínio (`getInvoices()`, `getSupplierBalance()`, `searchInvoiceItems()`),
nunca uma ferramenta por pergunta — princípio já registado na Fase 9 e
reafirmado aqui.

**Prioridade**: Média — sem consumidor real a bloquear hoje.

## Próxima fase

Por decidir — candidatos naturais: tool calling sobre
`AiCompletionProvider` (ver observação acima, só com necessidade real
confirmada); confirmação visual manual desta fase e das Fases
5.4/6.8/8/9, ainda pendentes.
