# Fase 8.4 — Hybrid AI Routing & Conversational Financial Queries Foundation

## Objetivo

Evoluir o Chat IA para um router híbrido seguro: perguntas financeiras
continuam a usar exclusivamente retrieval determinístico e/ou tools
sobre dados reais (garantia da Fase 8.3, integralmente preservada);
perguntas genuinamente gerais passam a ser respondidas diretamente
pelo provider, por um caminho totalmente separado, sem contexto nem
tools financeiras; perguntas financeiras não reconhecidas por nenhuma
intenção específica nunca são tratadas como gerais só por um regex
falhar; continuações conversacionais podem reutilizar intenção,
período e filtros financeiros recentes; e um conjunto fechado de
filtros combinados (estado, fornecedor, categoria) passa a estar
disponível em todas as consultas financeiras.

## Âmbito

Classificador híbrido determinístico (`GENERAL` vs. financeiro);
extensão fechada de `DashboardService` com 3 filtros opcionais
(`status`/`supplierId`/`categoryId`) e um primitivo novo
(`getLargestInvoices()`); resolução segura de menções a
fornecedor/categoria nomeados (`FinancialEntityResolverService`,
reutilizando `SuppliersService`/`ExpenseCategoriesService`); contexto
conversacional estruturado (filtros herdados só em continuações
explícitas, sempre substituíveis pela mensagem atual); expansão das 6
tools existentes com filtros opcionais + 1 tool nova
(`get_largest_expenses`). Sem RAG, embeddings, agentes autónomos,
loops abertos de tools, escrita financeira, promoção automática de
drafts, `ocrText` como fonte de resposta, memória permanente nova,
streaming, provider novo, package novo, migration, ou alteração ao
frontend.

## Estado inicial

A Fase 8.3 tratava qualquer resultado não-`DATA` do retrieval
(`UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS`/`ERROR`) de forma
uniforme — mesmo uma pergunta genuinamente não financeira ("Qual é a
capital de Portugal?") recebia sempre o mesmo texto fixo ("Não tenho
essa informação disponível... Posso ajudar com: resumo financeiro...")
depois de o orquestrador de tools também não a resolver, nunca uma
resposta real do provider. `DashboardService.getFinancialSummary()`
não suportava nenhum filtro combinável — `byStatus` sempre a
distribuição completa, `byCategory` sem ordenação, `topSuppliers`
limitado a 5, sem forma de isolar um fornecedor/categoria nomeado nem
um único estado. As 6 tools espelhavam as 6 intenções sem nenhum
argumento além de `period`. A recuperação por histórico (Fase 8.3) só
cobria intenção e período, nunca um filtro combinado.

## Arquitetura implementada

### Bloco 1 — Router híbrido (`GENERAL` vs. financeiro)

`apps/frontrest/api/src/ai/router/financial-relevance.classifier.ts`
— `classifyMessageRelevance(message, recentUserMessages)`,
determinístico, sem LLM (mesma disciplina de
`resolveFinancialIntent()`). Vocabulário financeiro-adjacente
deliberadamente generoso (fatura, pagamento, gasto, despesa,
fornecedor, categoria, euro, valor, total, custo, dinheiro, dívida,
vencida, pendente, cancelada, financeiro, resumo, média, orçamento,
receita — falsos positivos são seguros, só significam permanecer no
caminho financeiro seguro; falsos negativos são o risco real, por isso
o vocabulário pende sempre para o lado inclusivo). Regra estrutural:
**a ausência de correspondência a uma intenção específica nunca
classifica `GENERAL`** — só a ausência de qualquer vocabulário
financeiro-adjacente, sem sinal de continuação apoiado em contexto
financeiro recente, resulta em `GENERAL`. Uma continuação ("E só da
Hetzner?", "Qual foi a maior?") só conta como financeira quando a
janela de histórico recente já contém sinal financeiro — nunca por si
só.

`AiChatService.sendMessage()` classifica **antes** de qualquer
retrieval financeiro. `GENERAL` → chama o provider diretamente com um
novo `system prompt` mínimo e separado
(`AiTenantContextService.buildGeneralSystemMessage()` — nunca o mesmo
texto de `ASSISTANT_RULES`, que pressupõe sempre dados financeiros),
sem `tools`, sem retrieval, resposta confiada e persistida com
provider/model/tokens reais. A garantia da Fase 8.3 ("nunca confiar
numa resposta sem `DATA` real") mantém-se **integralmente** para
qualquer alegação financeira — o caminho `GENERAL` nunca faz nenhuma,
por isso não a contradiz.

### Bloco 2 — Filtros financeiros combinados (`DashboardService`)

Extensão fechada e aditiva: `getFinancialSummary()` ganha `status?`/
`supplierId?`/`categoryId?` — quando `status` está presente, substitui
a exclusão por omissão de `CANCELLED` (permite consultar exatamente
esse estado, incluindo `CANCELLED`); `supplierId`/`categoryId` são
sempre um `AND` adicional. Todos os agregados existentes
(`totals`/`byStatus`/`byCategory`/`topSuppliers`/`monthlyTrend`)
passam a refletir os filtros quando presentes — comportamento idêntico
ao anterior quando ausentes (confirmado por testes de regressão dos 2
consumidores existentes, `/dashboard` e Fase 9). `byCategory` passou a
vir ordenado por `totalAmount desc` (aditivo — nunca alterou os dados,
só a ordem), necessário para "categoria com maior despesa" ser
discernível.

Novo método `getLargestInvoices(organizationId, {from,to,status?,
supplierId?,categoryId?,limit?})` — estrutura de query distinta
(`findMany`/`orderBy: totalAmount desc`, nunca um `groupBy`), para
"maiores faturas individuais" (decisão explícita: "maiores despesas"
resolve-se conforme a pergunta — faturas individuais → este primitivo
novo; fornecedores com maior despesa agregada → `TOP_SUPPLIERS`,
inalterado; categorias com maior despesa agregada → `BY_CATEGORY`,
agora ordenado). Mesma disciplina de isolamento/`Prisma.Decimal` do
resto do ficheiro.

`FinancialSummaryQueryDto` (HTTP) **não foi alterado** — os novos
filtros só existem no tipo interno que `getFinancialSummary()` aceita
(`FinancialSummaryFilters`), nunca expostos como novos parâmetros de
querystring em `GET /dashboard/financial-summary`; decisão deliberada
para não expandir a API pública do dashboard sem pedido explícito.

### Bloco 3 — Resolução segura de entidades nomeadas

`apps/frontrest/api/src/ai/financial-retrieval/entity-resolver.service.ts`
(`FinancialEntityResolverService`) — reutiliza
`SuppliersService.findAll()`/`ExpenseCategoriesService.findAll()` (já
exportados pelos respetivos módulos, nunca uma query Prisma
duplicada). Correspondência por fronteira de palavra, case/acento-
insensível, sobre o nome real de cada entidade da organização; quando
mais do que um nome distinto corresponde, `AMBIGUOUS` (nunca escolhe
arbitrariamente); um nome mais longo que também corresponde
(`"Hetzner Cloud"` contém `"Hetzner"`) prevalece sobre o mais curto.
Novo resultado `FinancialRetrievalResult.kind === 'ENTITY_AMBIGUOUS'`
— tratado como `ERROR` por `AiChatService` (nunca tenta o orquestrador
de tools, vai direto ao fallback determinístico, que pede o nome
completo).

**Bug real encontrado e corrigido durante a validação manual**: um
fornecedor e uma categoria com o mesmo nome real (confirmado com dados
reais da organização "ivoaovivo" — existe um fornecedor **e** uma
categoria chamados "Hetzner") resolviam ambos a partir da mesma menção
e eram combinados como dois filtros `AND` independentes
(`supplierId=X` **e** `categoryId=X`), restringindo silenciosamente a
resposta a um subconjunto que o utilizador nunca pediu ("Quanto gastei
com a Hetzner?" devolvia 20,00 EUR — 1 fatura — em vez dos 354,00 EUR
reais de 3 faturas). Corrigido com uma regra de prioridade explícita:
quando o nome resolvido do fornecedor e da categoria coincidem
(`sameEntityName()`, normalizado), só o fornecedor é aplicado — mesma
prioridade já usada por `TOP_SUPPLIERS_PATTERN` sobre
`BY_CATEGORY_PATTERN` no resolvedor de intenção. Nomes distintos
continuam combinados normalmente. Teste de regressão dedicado
adicionado; confirmado corrigido contra os dados reais que expuseram o
bug (ver "Validação manual").

### Bloco 4 — Novas formas de consulta e vocabulário

`FinancialIntentType` ganha `LARGEST_INVOICES`
(`LARGEST_INVOICES_PATTERN`: "maiores faturas", "faturas de maior
valor", "fatura mais cara" — nunca sobrepõe "maior despesa" sozinho,
que continua `BY_CATEGORY`, decisão da Fase 8.3 preservada). Novo
padrão `SPECIFIC_STATUS_PATTERN` (verbo de contagem/filtro + palavra
de estado: "quantas pagas", "quantas vencidas", "quantas pendentes",
"mostra apenas as vencidas") resolve para `FINANCIAL_SUMMARY` com
`statusFilter` — checado **antes** de `OUTSTANDING_PATTERN`, mas exige
sempre um verbo de contagem/filtro, para nunca alterar a regressão
real da Fase 8.3 ("Existem faturas pendentes?", sem verbo, continua
`OUTSTANDING_BALANCE`, Pendente+Vencida combinado). "Quantas pendentes"
com verbo agora isola corretamente só `PENDING`, distinto de
`OUTSTANDING_BALANCE`. `FINANCIAL_SUMMARY_PATTERN` ganha "média" —
`totals.averageAmount`, já existente, passa a responder "média das
faturas" diretamente, agora também sensível a filtros combinados.

### Bloco 5 — Contexto conversacional estruturado (filtros)

`FinancialRetrievalService.retrieve()`: filtros (estado/fornecedor/
categoria) são sempre resolvidos primeiro a partir da mensagem atual;
só recuperados do histórico (mensagem anterior mais recente que
resolve algum filtro) quando a mensagem atual sinaliza explicitamente
uma continuação (`hasContinuationSignal()`,
`apps/frontrest/api/src/ai/financial-retrieval/continuation-signal.ts`
— partilhado com o classificador do router, mesma definição em ambos).
A recuperação de intenção/período (Fase 8.3) foi estendida: além de
"a mensagem atual já resolve o período sozinha", um sinal de
continuação isolado (sem intenção nem período próprios, ex. "E só da
Hetzner?") também ativa a recuperação de intenção/período do
histórico — necessário para uma continuação apoiada inteiramente no
contexto anterior funcionar. Um filtro que a mensagem atual já resolve
por si só substitui sempre o herdado dessa mesma dimensão — nunca
combina dois valores incompatíveis. Validado contra os 6 exemplos
exigidos ("E a anterior?", "E dessas, quantas estão pagas?", "E só da
Hetzner?", "Mostra apenas as vencidas.", "E por categoria?", "Qual foi
a maior?").

### Bloco 6 — Tools expandidas + `get_largest_expenses`

As 6 tools existentes ganham 3 parâmetros opcionais
(`status`/`supplierName`/`categoryName`, mesmo schema fechado
partilhado, `AiToolDefinition.parameters.properties` já suficientemente
genérico — nenhuma alteração a `packages/ai`). Nova tool
`get_largest_expenses` (estrutura de dados distinta, não cabe nas 6
existentes). `AiToolOrchestratorService` valida `status` contra o
enum real (`PENDING`/`PAID`/`OVERDUE`/`CANCELLED` — um valor inventado
pelo modelo é tratado como ausente, nunca propagado); nomes de
fornecedor/categoria passam pela mesma resolução seguro de
`FinancialEntityResolverService`. `ENTITY_AMBIGUOUS` devolvido por
`retrieveForIntent()` (via tool) devolve `NOT_ANSWERED` de imediato,
mesma garantia estrutural da Fase 8.3 (2ª chamada ao provider só com
`DATA` real).

## Ficheiros criados

```
apps/frontrest/api/src/ai/router/financial-relevance.classifier.ts (+ .spec.ts)
apps/frontrest/api/src/ai/financial-retrieval/entity-resolver.service.ts (+ .spec.ts)
apps/frontrest/api/src/ai/financial-retrieval/continuation-signal.ts
docs/phases/phase-8.4-hybrid-ai-routing-conversational-financial-queries-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/dashboard/dashboard.service.ts (+ .spec.ts) — filtros fechados, getLargestInvoices(), byCategory ordenado
apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.ts (+ .spec.ts) — LARGEST_INVOICES, SPECIFIC_STATUS_PATTERN, "média"
apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts (+ .spec.ts) — filtros combinados, recuperação por continuação, regra de colisão fornecedor/categoria
apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts (+ .spec.ts) — LARGEST_INVOICES, linha "Filtros aplicados", ENTITY_AMBIGUOUS
apps/frontrest/api/src/ai/ai-chat.service.ts (+ .spec.ts) — classificação antes do retrieval, ramo GENERAL, ENTITY_AMBIGUOUS tratado como ERROR
apps/frontrest/api/src/ai/ai-tenant-context.service.ts (+ .spec.ts) — buildGeneralSystemMessage()
apps/frontrest/api/src/ai/tools/financial-tool.registry.ts — filtros opcionais, get_largest_expenses
apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.ts (+ .spec.ts) — parsing/validação de filtros opcionais
apps/frontrest/api/src/ai/ai.module.ts — importa SuppliersModule/ExpenseCategoriesModule, regista FinancialEntityResolverService
apps/frontrest/api/test/ai-chat.e2e-spec.ts — router, filtros combinados, isolamento de entidades, OCR/promoção
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Sem package novo, sem migration, sem dependência externa, sem alteração
ao frontend (`SendChatMessageResult`/`ChatMessageView` inalterados).
`packages/ai` inalterado — `AiToolDefinition.parameters.properties`
já suficientemente genérico para os filtros opcionais.

## Testes

`financial-relevance.classifier.spec.ts` (17): geral vs. financeiro,
vocabulário financeiro-adjacente amplo, "nunca GERAL só por um regex
de intenção falhar", continuação depende de contexto financeiro
recente, escrita sem vocabulário financeiro é geral (nunca força o
caminho financeiro sozinha). `entity-resolver.service.spec.ts` (8):
resolução por fronteira de palavra, insensível a acentos, nome mais
longo prevalece, duas entidades distintas → `AMBIGUOUS`, isolamento
por organização. `financial-retrieval.service.spec.ts` (36, +21):
filtros combinados (status/fornecedor/categoria), `LARGEST_INVOICES`,
continuidade estruturada (6 exemplos), regressão da colisão
fornecedor/categoria com o mesmo nome. `financial-intent.resolver.spec.ts`
(36, +13): `LARGEST_INVOICES`, contagem por estado específico,
regressão exata de "Existem faturas pendentes?" (sem verbo, continua
`OUTSTANDING_BALANCE`). `financial-context.builder.spec.ts` (20, +6):
bloco `LARGEST_INVOICES`, linha de filtros aplicados,
`ENTITY_AMBIGUOUS`. `ai-tool-orchestrator.service.spec.ts` (22, +5):
filtros opcionais válidos encaminhados, status inventado descartado,
`ENTITY_AMBIGUOUS` → `NOT_ANSWERED`, tool nova oferecida.
`ai-chat.service.spec.ts` (35, +4): pergunta geral nunca chama
retrieval financeiro, resposta geral persistida com provider/model/
tokens reais, falha do provider no caminho geral sanitizada
igualmente, continuação sem contexto financeiro tratada como geral.
`dashboard.service.spec.ts` (28, +14): filtros fechados aditivos
(comportamento idêntico sem eles), combinações, `getLargestInvoices()`,
`byCategory` ordenado. `ai-chat.e2e-spec.ts` (+11): router híbrido
(geral vs. financeira não reconhecida), filtros combinados e
isolamento da resolução de entidades entre organizações, OCR/promoção
(`InvoiceDraft` nunca consultado pelo Chat antes ou depois da
promoção, `Invoice` promovida entra na mesma agregação sem alteração
de código).

## Validações executadas

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | 24/24 |
| `pnpm build` | 14/14 |
| `pnpm test` | 18/18 tarefas — `@frontrest/api` 658/658 |
| `pnpm --filter @frontrest/api test:e2e` | 143/143 |
| `packages/ai` | 114/114 (inalterado, confirmação de não-regressão) |
| Frontend `ai-chat.test.tsx` | 13/13 (inalterado, confirmação de não-regressão) |

## Validação manual (Docker, dados reais)

Organização real "ivoaovivo" (`cmr96xc6c00009h35fupqih75`), 6 faturas
reais de julho de 2026 (Hetzner: 300,00 PENDING + 34,00 OVERDUE +
20,00 OVERDUE = 354,00 EUR/3 faturas; Farmácia Esperança: 80,00 PAID +
20,00 PENDING; NOS: 16,00 PENDING — total 470,00 EUR/6 faturas).

**Com `AI_PROVIDER=mock`** (script direto contra `FinancialRetrievalService`
real + Postgres real, para inspecionar o resultado estruturado
completo, já que `MockAiProvider` só ecoa texto): confirmado
byte-a-byte — "Quantas faturas pagas este mês?" → `status=PAID`, 1
fatura, 80,00 EUR; "Quais são as maiores faturas deste mês?" → 5
faturas ordenadas corretamente por valor (300/80/34/20/20); "E só da
Hetzner?" como continuação de "Quantas faturas pagas este mês?" →
combina `status=PAID`+`supplierId=Hetzner` → 0 faturas (correto: as
faturas Hetzner são PENDING/OVERDUE, nenhuma PAID). **Foi durante esta
validação que o bug da colisão fornecedor/categoria foi encontrado e
corrigido** (ver Bloco 3) — confirmado corrigido, re-executando o
mesmo script após a correção.

**Com `AI_PROVIDER=openrouter`, `AI_MODEL=google/gemini-2.5-flash`**
(serviço real, chamadas HTTP reais via `POST /api/ai/chat`):

- Pergunta geral ("Qual é a capital de Portugal?") → "A capital de
  Portugal é Lisboa." — `provider='openrouter'` persistido, sem
  nenhuma chamada a `DashboardService`.
- Filtro por fornecedor ("Quanto gastei com a Hetzner este mês?") →
  "Com a Hetzner, gastou 354,00 EUR este mês." — exato, confirma a
  correção do bug de colisão também no caminho real completo (não só
  no script direto).
- `LARGEST_INVOICES` ("Quais são as maiores faturas deste mês?") →
  lista as 5 faturas reais, na ordem e valores corretos, com
  fornecedor/categoria/estado traduzidos.
- Contagem por estado específico ("Quantas faturas pagas este mês?")
  → "Existe 1 fatura paga neste mês." — exato.
- Continuação real ("Quantas faturas vencidas este mês?" → "2
  faturas vencidas"; depois "E só da Hetzner?" → "2 faturas vencidas
  da Hetzner") — correto: as 2 faturas vencidas reais são ambas da
  Hetzner.

Confirmação real, empírica, ponta a ponta (não só testes automatizados)
de todos os blocos novos desta fase.

## Limitações conhecidas

- **Resolução de entidade por texto**: correspondência por fronteira
  de palavra pode falsear positivo quando um nome de fornecedor/
  categoria coincide com uma palavra comum do português (ex. um
  fornecedor chamado "NOS" colide com o pronome "nos") — documentado
  em `entity-resolver.service.ts`, não corrigido nesta fase (YAGNI,
  sem evidência de impacto real; a mitigação seria semântica, fora do
  âmbito determinístico desta fase).
- **`SuppliersService.findAll()` limitado a `MAX_PAGE_SIZE` (100)** na
  resolução de menções — uma organização com mais de 100 fornecedores
  pode ter menções fora dessa janela nunca resolvidas (tratadas como
  ausência, nunca incorretamente). Categorias não têm este limite.
- **Recuperação de filtros por histórico para na primeira mensagem
  anterior que resolve qualquer filtro** (não por dimensão
  independente) — um filtro genuinamente mais antigo que uma mensagem
  intermédia não relacionada não é recuperado; escolha deliberada para
  limitar o custo de I/O (evita até N consultas de fornecedores/
  categorias por mensagem de continuação) — documentado, não uma
  omissão a corrigir.
- **Classificação `GENERAL` é defensiva, não perfeita**: uma pergunta
  financeira com vocabulário totalmente inédito (nenhuma das palavras
  do conjunto financeiro-adjacente) e sem sinal de continuação seria
  classificada `GENERAL` — mitigado por um vocabulário deliberadamente
  amplo e testado, mas não uma garantia absoluta; nunca alegado como
  tal.
- **"Maiores despesas" continua a exigir uma das 3 fraseações
  distintas** (faturas individuais/fornecedor/categoria) para resolver
  para o primitivo certo — uma pergunta ambígua sem nenhum destes
  sinais cai em `BY_CATEGORY` (decisão da Fase 8.3, preservada).
- Confirmação visual manual no browser não tecnicamente possível neste
  ambiente (mesma limitação já registada em fases anteriores) — sem
  alteração ao frontend nesta fase, mitigado pela validação real via
  `POST /api/ai/chat`.

## Fora do âmbito (confirmado, não implementado)

RAG, embeddings, base de dados vetorial, agentes autónomos, loops
abertos de tools, escrita/edição/pagamento/cancelamento de faturas
pelo chat, promoção automática de drafts, respostas baseadas
diretamente em `ocrText`, memória permanente nova, streaming, provider
novo, package novo, migration, alterações não necessárias ao frontend,
refactors oportunistas fora dos módulos afetados.

## Critérios de conclusão

- [x] Router híbrido distingue perguntas gerais de perguntas
      financeiras com segurança.
- [x] Perguntas gerais legítimas chegam ao provider.
- [x] Perguntas financeiras nunca são respondidas sem `DATA` real.
- [x] Novas consultas financeiras suportam estados, fornecedores,
      categorias, médias e maiores despesas.
- [x] Filtros combinados suportados sem depender do limite de
      `topSuppliers`.
- [x] Continuações financeiras reutilizam contexto estruturado
      limitado.
- [x] Alterações explícitas substituem corretamente filtros herdados.
- [x] Isolamento por organização coberto por testes (incl. resolução
      de entidades).
- [x] Todas as operações continuam read-only.
- [x] `InvoiceDraft` nunca entra nas consultas financeiras (validado
      real, antes e depois da promoção).
- [x] Uma fatura promovida passa a surgir automaticamente no chat.
- [x] Sem package novo, migration ou dependência externa.
- [x] Testes unitários e e2e cobrem routing, filtros, tools, contexto
      conversacional e isolamento.
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos.
- [x] Documentação da fase criada e índices arquiteturais atualizados.

## Próxima fase

Por decidir — candidatos naturais: validação de tool calling contra um
servidor Ollama real (limitação registada desde a Fase 8.3, ainda
pendente); confirmação visual manual das fases com frontend ainda
pendentes; mitigação semântica da colisão de nomes curtos/comuns na
resolução de entidades, só com evidência real de impacto.
