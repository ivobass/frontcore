# Fase 8.8 — Financial AI Reliability & Strict Grounding Foundation

## Nota — correção obrigatória aplicada

A primeira implementação desta fase reforçou só as **instruções** dadas
ao provider (`ASSISTANT_RULES`/`TOOL_ATTEMPT_RULES`), sem validar a
**resposta final** em si — prompts, por mais explícitos, nunca são uma
garantia estrutural (o provider continua livre para os ignorar). Uma
correção obrigatória, aplicada na mesma fase, acrescentou a peça em
falta: uma fronteira determinística entre `FinancialRetrievalResult`
(dados reais) e o texto final, que nunca confia no LLM para se validar
a si próprio. Este documento já reflete o estado final, corrigido —
ver "Arquitetura implementada", secção 5, e "Testes" para o detalhe da
correção.

## Nota — correções finais aplicadas (Strict Grounding)

Uma segunda ronda de correções, ainda dentro do âmbito desta fase,
resolveu três lacunas concretas encontradas na fronteira determinística
da secção anterior: (1) `AMOUNT_TOKEN_PATTERN` só reconhecia o formato
interno (ponto decimal) e uma forma simples com vírgula — nunca
separadores de milhares (`.`/espaço), números negativos, ou a
combinação dos dois (ex. `"12.345.678,90 EUR"`); (2)
`normalizeAmountToken()` foi reescrita para a nova gramática, sempre
preservando o sinal negativo; (3) `isValidPeriod()`
(`financial-conversation-context.ts`) validava forma e calendário de
`from`/`to`, mas nunca que `from <= to` — um snapshot com `from > to`
ainda chegava a `resolvePeriod()` (que lança). Nenhuma destas correções
altera arquitetura, âmbito, ou qualquer ficheiro fora dos já tocados
por esta fase — ver "Ficheiros alterados" e "Testes" para o detalhe
exato.

## Objetivo

Reforçar a fiabilidade do Chat Financeiro — o LLM nunca é fonte de
verdade, só apresenta dados financeiros estruturados produzidos pelo
backend, e nenhuma resposta financeira pode inventar, alterar, omitir
ou reinterpretar dados reais. Fase exclusivamente de AI Reliability,
sem nenhuma funcionalidade nova de negócio.

## Âmbito

Cinco reforços sobre a arquitetura já existente (Fases 8.1–8.7), sem
alterar nenhuma delas estruturalmente: (1) Strict Grounding a nível de
prompt — regras explícitas mais rigorosas em
`ASSISTANT_RULES`/`TOOL_ATTEMPT_RULES` contra alteração/reinterpretação
de dados, e contra respostas finais inconsistentes (só espaço em
branco); (2) Router Hardening — vocabulário financeiro-adjacente
alargado (`saldo`/`extrato`/`preço`/`cobrança`); (3) Financial
Conversation Context Hardening — validação mais rigorosa do snapshot
(Fase 8.7), incluindo a correção de um bug real de crash; (4) Prompt
Injection Hardening — sanitização estrutural de nomes de fornecedor/
categoria (dados do domínio, nunca gerados por este código) antes de
entrarem em qualquer mensagem enviada ao modelo; (5) **Strict Grounding
estrutural (correção obrigatória)** — fronteira determinística
(`validateFinancialGrounding()`) entre `FinancialRetrievalResult` e a
resposta final, aplicada tanto ao caminho direto como à resposta final
após tool calling, nunca o LLM como validador. Mantido fora do âmbito,
por instrução explícita: OCR, Fiscal Parsing, InvoiceDraft, promoção de
faturas, validações contabilísticas, IVA, NIF, Dashboard, Reports,
tools novas, providers novos, embeddings, RAG, agentes, streaming,
packages novos, migrations, alterações Prisma, alterações ao frontend,
alteração ao tool registry, alteração à arquitetura da Fase 8.7.

## Estado inicial

Fases 8.1–8.7 já garantiam estruturalmente que o provider nunca é
confiado como resposta final sem `DATA` real (Fase 8.3), que o router
nunca classifica `GENERAL` só por falta de correspondência a uma
intenção específica (Fase 8.4), e que o contexto conversacional é lido
de forma defensiva (Fase 8.7). Quatro lacunas concretas confirmadas
nesta fase, antes de qualquer alteração:

- **Bug real confirmado por reprodução direta**: `parseFinancialConversationContext()`
  (Fase 8.7) validava a *forma* de `period.from`/`period.to`, mas nunca
  o *calendário* — um snapshot com `period: { from: "2026-13-45", ... }`
  passava a validação e só falhava mais tarde, dentro de
  `FinancialRetrievalService.retrieve()`, quando `resolvePeriod()`
  lança `BadRequestException`. Reproduzido isoladamente antes de
  qualquer correção.
- `ASSISTANT_RULES`/`TOOL_ATTEMPT_RULES` proibiam **inventar** dados
  ausentes, mas nunca proibiam explicitamente **alterar/arredondar/
  reformular** um valor real já fornecido.
- Nomes de fornecedor/categoria entravam sempre em bruto na mensagem
  `system`/`tool` — nunca sanitizados, apesar de serem escritos por
  qualquer utilizador `MANAGER` da organização.
- **Lacuna central, identificada só depois da primeira implementação
  (motivo desta correção)**: mesmo com as regras de prompt reforçadas
  (ponto 2 acima), nada validava a resposta final em si — um provider
  que ignorasse as regras (por erro do modelo, ou por um ataque de
  prompt injection bem-sucedido apesar das mitigações) tinha a sua
  resposta persistida e apresentada sem nenhuma verificação
  determinística. Prompts são uma mitigação, nunca uma garantia
  estrutural.

## Arquitetura implementada

### 1. Strict Grounding — regras de prompt

`ai-tenant-context.service.ts` (`ASSISTANT_RULES`) e
`ai-tool-orchestrator.service.ts` (`TOOL_ATTEMPT_RULES`) ganham, em
paralelo, duas regras: "Nunca alteres, arredondes, aproximes, reformules
ou reinterpretes um valor, data, período, fornecedor, categoria ou
estado [listado/devolvido]..." (distinta de "nunca inventes"); e uma
regra que instrui o modelo a tratar nomes de fornecedor/categoria
sempre como dados, nunca como instruções. Camada de mitigação — nunca a
garantia estrutural (essa é a secção 5, abaixo).

`AiToolOrchestratorService.run()` — a resposta final é rejeitada
(`NOT_ANSWERED`) também quando o conteúdo é só espaço em branco, não só
quando é literalmente vazio.

### 2. Router Hardening

`financial-relevance.classifier.ts` — `FINANCIAL_ADJACENT_PATTERN`
ganha `saldo`/`extrato`/`preço`/`cobrança`/`cobrar`/`cobrado`/`cobrada`.
Decisão explícita: nunca a forma nua "cobra" (colide com o substantivo
"cobra"/serpente). Mesma disciplina determinística de sempre, sem LLM.

### 3. Financial Conversation Context Hardening

`financial-conversation-context.ts` — `isValidPeriod()` passou a
validar também o calendário real de `from`/`to` (`isValidIsoDateString()`,
novo, reimplementação pura da lógica de `parseIsoDateUtc()` —
`dashboard/period.util.ts` não é reutilizada diretamente porque lança);
`recordedAt` exige ser parseável como data; campos de filtro nomeados
nunca aceitam string vazia/só espaço. Todo o corpo de
`parseFinancialConversationContext()` corre dentro de `try`/`catch` —
nunca lança, confirmado por teste com um `getter` hostil. Fallback para
reanálise por texto (Fases 8.3/8.4) inalterado. Arquitetura da Fase 8.7
não alterada — mesma assinatura, mesmo contrato.

### 4. Prompt Injection Hardening

`financial-context.builder.ts` — nova `sanitizeDomainText()` (exportada
na correção, para reutilização pela secção 5), aplicada a todo nome de
fornecedor/categoria antes de entrar em qualquer mensagem: remove
caracteres de controlo (substituindo por espaço, nunca removendo sem
substituir), colapsa espaço repetido, limita a 200 caracteres. Nunca
uma filtragem semântica de palavras-chave — só normalização estrutural.

### 5. Strict Grounding estrutural — fronteira determinística (correção obrigatória)

**Causa da lacuna**: as regras de prompt (secção 1) reduzem o risco,
mas nunca o eliminam — nada impedia, estruturalmente, que uma resposta
final alterasse um valor/data/fornecedor/categoria/estado ou
acrescentasse uma alegação financeira sem suporte, e essa resposta
adulterada era persistida e apresentada como se fosse factual.

**Solução adotada**: `financial-grounding.validator.ts` (novo) —
`validateFinancialGrounding(content, result)`, pura, determinística,
nunca chama o LLM. Extrai diretamente do `FinancialRetrievalResult` já
tipado (nunca reanalisa texto para reconstruir os dados) três conjuntos
fechados de factos permitidos:

- **Valores monetários** (`Set<string>`, formato canónico `"X.XX"`) —
  todos os montantes reais presentes em qualquer variante de
  `FinancialIntentData` (totais, por linha, comparação de períodos).
- **Contagens** (`Set<number>`) — todas as contagens de faturas reais.
- **Datas ISO** (`Set<string>`, `YYYY-MM-DD`) — período consultado,
  período de comparação (atual/anterior), datas de fatura em
  `LARGEST_INVOICES`.

A resposta final é percorrida com três regex (valor monetário
`€`/`EUR`, contagem `N fatura(s)`, data ISO) — qualquer token extraído
que não pertença ao conjunto permitido correspondente rejeita a
resposta (`AMOUNT_NOT_ALLOWED`/`COUNT_NOT_ALLOWED`/`DATE_NOT_ALLOWED`).
Quando `result.filters.status`/`supplierName`/`categoryName` está
definido (a pergunta é sobre uma entidade/estado nomeado específico), a
resposta tem também de mencionar esse valor real — a sua ausência
(substituição por outro) rejeita a resposta
(`MISSING_REQUIRED_STATUS`/`MISSING_REQUIRED_SUPPLIER`/`MISSING_REQUIRED_CATEGORY`).
Valores monetários são normalizados antes de comparar — `AMOUNT_TOKEN_PATTERN`
reconhece o formato interno (`"354.00"`, ponto decimal), o formato
pt-PT (`"354,00"`/`"354,5"`), separadores de milhares (`.` ou espaço,
sempre em grupos de exatamente 3 dígitos — `"1.234,56"`/`"1 234,56"`/
`"12.345.678,90"`), e sinal negativo (`"-1.234,56"`, preservado sempre
na normalização — relevante para `absoluteChange` numa comparação de
períodos, que pode ser negativo numa diminuição). A gramática do
próprio regex já desambigua estruturalmente milhares (sempre 3 dígitos)
de decimais (sempre 1-2, nunca 3) — `normalizeAmountToken()` reaplica a
mesma regra (procura sempre o **último** separador seguido de 1-2
dígitos até ao fim; sem essa forma, trata o número inteiro como parte
inteira, sem casas decimais).

Quando `grounded: false`: o texto do provider nunca é persistido nem
apresentado — `buildFinancialContextMessage(result)` (a mesma
renderização determinística já enviada como dados ao provider, Fase
8.1) é usada diretamente como resposta, marcada com
`GROUNDING_FALLBACK_PROVIDER`/`GROUNDING_FALLBACK_MODEL`
(`'deterministic'`/`'financial-grounding-fallback'`, exportados do
mesmo módulo — única fonte de verdade, nunca duas cópias). Aplicada nos
dois pontos exigidos: `AiChatService.buildGroundedReply()` (caminho
direto, chamado depois de `provider.complete()` no ramo `DATA`) e
`AiToolOrchestratorService.run()` (resposta final depois de tool
calling, usando o mesmo `retrievalResult` já `kind: 'DATA'` confirmado
antes da 2ª chamada ao provider). Uma falha de grounding é sempre
registada (`Logger.warn`, nunca exposta ao cliente) com a razão exata,
para auditoria.

**Alternativas consideradas e rejeitadas**:

- **Usar o próprio LLM como validador** (pedir-lhe para confirmar a sua
  própria resposta, ou usar um 2º modelo) — explicitamente proibido
  pelo requisito 3 desta correção; também filosoficamente incoerente
  (um LLM não é uma fronteira de confiança para se validar a si
  próprio).
- **Parser de linguagem natural completo** (NLP/NER para extrair todas
  as entidades/valores/datas mencionadas, comparando semanticamente) —
  rejeitada por ser desproporcionadamente complexa para o requisito
  ("a solução mais simples"), exigiria uma dependência nova (proibido
  pelo requisito 4), e continuaria imperfeita para linguagem natural
  livre.
- **Reescrever a resposta determinística sempre, nunca confiar em texto
  livre do modelo** (eliminar completamente a fase de "prosa" e
  responder sempre com `buildFinancialContextMessage()`) — rejeitada
  por ser uma alteração de arquitetura maior (perderia toda a
  fluidez conversacional das Fases 8.1–8.7), não pedida, e desproporcional
  face ao objetivo (que pede uma *fronteira de validação*, não a
  eliminação da geração de linguagem natural).
- **Validação apenas de valores monetários, ignorando datas/nomes/estado**
  — rejeitada por não cobrir explicitamente os 7 casos pedidos no
  requisito 8 (fornecedor/categoria/estado inventados exigem também os
  testes de presença obrigatória, não só a exclusão numérica).
- **Exigir a presença de TODOS os nomes reais em qualquer resposta**
  (incl. intents multi-linha como `TOP_SUPPLIERS`/`BY_CATEGORY`/
  `LARGEST_INVOICES` sem filtro) — rejeitada por risco real de falsos
  positivos: uma resposta válida que resuma só os principais 2 de 5
  fornecedores seria incorretamente rejeitada. A presença obrigatória
  fica restrita aos casos de baixo risco de falso positivo — quando
  `filters.status`/`supplierName`/`categoryName` está definido, a
  pergunta é inequivocamente sobre essa única entidade/estado.
- **Exigir a presença literal das datas ISO do período** — rejeitada
  pela mesma razão: um modelo pode legitimamente descrever o período em
  português corrido ("em julho de 2026") sem nunca reproduzir o formato
  ISO, e isso não é uma resposta errada. A validação de datas fica só
  de exclusão (qualquer data ISO presente tem de ser real), nunca de
  presença obrigatória.

### 6. `from > to` nunca é um período válido (correção final)

`isValidPeriod()` (`financial-conversation-context.ts`) já validava
forma ISO e calendário real de `from`/`to` individualmente, mas nunca a
sua ordem relativa — um snapshot com `from: "2026-07-31", to:
"2026-07-01"` passava a validação e só falhava mais tarde, dentro de
`FinancialRetrievalService.retrieve()`, quando `resolvePeriod()` lança
`BadRequestException` ao detetar `from > to`. Corrigido com uma
comparação de string direta (`period.from <= period.to`) — suficiente e
correta porque a forma `YYYY-MM-DD`, já confirmada por
`isValidIsoDateString()`, ordena lexicograficamente de forma idêntica à
ordem cronológica real; nenhuma conversão para `Date` necessária.
`from == to` (período de um único dia) continua válido — só `from >
to` é rejeitado.

## Ficheiros criados

- `apps/frontrest/api/src/ai/financial-retrieval/financial-grounding.validator.ts`
  (`AMOUNT_TOKEN_PATTERN`/`normalizeAmountToken()` corrigidos nesta
  correção final — ver "Nota — correções finais aplicadas", acima).
- `apps/frontrest/api/src/ai/financial-retrieval/financial-grounding.validator.spec.ts`

## Ficheiros alterados

- `apps/frontrest/api/src/ai/ai-tenant-context.service.ts` (+ `.spec.ts`) —
  `ASSISTANT_RULES` reforçado (2 regras novas).
- `apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.ts` (+ `.spec.ts`) —
  `TOOL_ATTEMPT_RULES` reforçado; resposta só com espaço em branco
  tratada como inconsistente; **correção**: `validateFinancialGrounding()`
  aplicada à resposta final, com fallback determinístico marcado.
- `apps/frontrest/api/src/ai/router/financial-relevance.classifier.ts` (+ `.spec.ts`) —
  vocabulário financeiro-adjacente alargado.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-conversation-context.ts` (+ `.spec.ts`) —
  validação de calendário real, `recordedAt` parseável, filtros nunca
  string vazia, corpo dentro de `try`/`catch`; **correção final**:
  `isValidPeriod()` rejeita `from > to`.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts` (+ `.spec.ts`) —
  `sanitizeDomainText()`; **correção**: `sanitizeDomainText()` e
  `translateStatus()` exportados para reutilização por
  `financial-grounding.validator.ts` (nunca duplicados).
- `apps/frontrest/api/src/ai/ai-chat.service.ts` (+ `.spec.ts`) —
  **correção**: `buildGroundedReply()`/`logGroundingFailure()` novos,
  chamados no ramo `DATA`; `GROUNDING_FALLBACK_PROVIDER`/`GROUNDING_FALLBACK_MODEL`
  importados de `financial-grounding.validator.ts`.
- `apps/frontrest/api/test/ai-chat.e2e-spec.ts` — 2 testes (snapshot
  corrompido ponta a ponta; fornecedor com nome de prompt injection
  nunca impede o fluxo real de dados).
- `docs/phases/phase-8.8-financial-ai-reliability-strict-grounding-foundation.md`,
  `docs/PHASES.md`, `docs/INDEX.md`.

Sem alteração a `docs/ARCHITECTURE.md`, ao tool registry
(`financial-tool.registry.ts`), a providers, a Prisma, nem ao frontend —
nenhum destes foi tocado por esta fase nem pela correção.

## Testes

- `financial-grounding.validator.spec.ts` (36 testes: 20 da fase + 16
  desta correção final) — respostas válidas continuam aceites (incl.
  formato pt-PT com vírgula decimal, ausência de qualquer valor/data
  mencionado, filtros por fornecedor/categoria/estado, datas ISO reais,
  comparação de períodos); total diferente (2); período diferente/data
  inventada (2); fornecedor inventado (1); categoria inventada (1);
  estado diferente + contagem diferente (2); alegação financeira
  adicional (2); normalização de formato (2); **correção final** — os
  12 formatos monetários exigidos (`"999,99 €"`, `"999,99€"`,
  `"999,99 EUR"`, `"999 EUR"`, `"50 EUR"`, `"50,5 EUR"`, `"50.50 EUR"`,
  `"1.234,56 EUR"`, `"1 234,56 EUR"`, `"12.345.678,90 EUR"`,
  `"-50,00 EUR"`, `"-50 €"`, `"-1.234,56 EUR"`) reconhecidos
  corretamente (10 casos positivos + 3 negativos, com sinal preservado
  numa comparação de períodos real); um valor incorreto num formato
  reconhecido continua rejeitado; os formatos já suportados antes desta
  correção continuam a funcionar (regressão); um número grande sem
  separador de milhares (`"12345,67 EUR"`) nunca é cortado a meio.
- `ai-chat.service.spec.ts` (+9, 51 no total) — 1 (Fase 8.7, snapshot
  com calendário impossível nunca crasha) + 8 novos nesta correção:
  resposta válida continua persistida tal como veio do provider; total
  diferente; período diferente/data inventada; fornecedor inventado;
  categoria inventada; estado diferente; data inventada
  (`LARGEST_INVOICES`); alegação financeira adicional — todos
  confirmando que o texto adulterado nunca é persistido e que
  `buildFinancialContextMessage(result)` é usado em vez dele, marcado
  `provider: 'deterministic'`, `model: 'financial-grounding-fallback'`.
- `ai-tool-orchestrator.service.spec.ts` (+6, 29 no total) — 2 (regras
  de prompt reforçadas, resposta só com espaço em branco) + 4 novos
  nesta correção: resposta final válida continua `ANSWERED` com o texto
  real do provider; total diferente; fornecedor inventado; data
  inventada — todos confirmando `ANSWERED` com o conteúdo determinístico
  (`toolResultContent`, o mesmo enviado como mensagem `tool`) em vez do
  texto adulterado, mesma marcação `financial-grounding-fallback`.
- `financial-relevance.classifier.spec.ts` (+7, 30 no total) — vocabulário
  novo classifica `FINANCIAL`; "cobra" nua continua `GENERAL`.
- `financial-conversation-context.spec.ts` (24 testes: 20 da fase + 4
  desta correção final) — calendário impossível, forma inválida,
  `recordedAt` não parseável, filtro vazio/só espaço devolvem `null`;
  valor hostil nunca lança; data real (incl. ano bissexto) continua
  aceite; **correção final** — `from < to` aceite, `from == to`
  (período de um único dia) aceite, `from > to` devolve `null` (2
  casos: diferença de um mês, diferença de um único dia).
- `financial-context.builder.spec.ts` (+5, 29 no total) — sanitização
  estrutural (quebras de linha, controlo, comprimento, "Filtros
  aplicados", nome normal inalterado).
- `ai-chat.e2e-spec.ts` (+2, 43 no total) — snapshot corrompido ponta a
  ponta nunca causa 500; fornecedor com nome de prompt injection nunca
  impede a consulta real ao `DashboardService`.

**Nota de exatidão factual**: a versão anterior deste documento
reportava 821 testes/55 novos — número correto nessa altura, agora
atualizado com os 20 testes desta correção final (16 de formatos
monetários + 4 de ordenação de período). O número definitivo, confirmado
por execução real, está em "Comandos de validação executados", abaixo.

## Comandos de validação executados

- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm -w typecheck` (24 tasks) — limpo.
- `pnpm --filter @frontrest/api build` — limpo.
- `pnpm -w build` (14 tasks) — limpo.
- `pnpm --filter @frontrest/api test` — **45 suites, 841 testes**,
  todos a passar (766 antes desta fase + 75 novos: 23 da primeira
  implementação + 32 da correção da fronteira de grounding + 20 desta
  correção final — 16 `financial-grounding.validator.spec.ts` +
  4 `financial-conversation-context.spec.ts`).
- `pnpm -w test` (18 tasks) — limpo.
- `pnpm --filter @frontrest/api test:e2e` — 9 suites, **150 testes**,
  todos a passar (inalterado por esta correção final — nenhum teste
  e2e novo era necessário, ver "Testes").
- Confirmado, por execução real da suite completa (não só dos testes
  novos), que esta correção final **não quebrou nenhum teste
  existente** — os 821 testes anteriores continuam todos a passar sem
  alteração.
- Confirmado, por execução real da suite completa (não só dos testes
  novos), que a correção **não quebrou nenhum teste existente** — os
  766 testes anteriores a esta fase, mais os 23 da primeira
  implementação, continuam todos a passar sem alteração.

## Limitações conhecidas

- **`validateFinancialGrounding()` não valida números por extenso nem
  datas em português corrido** — só extrai valores/contagens/datas em
  formato numérico/ISO explícito. Uma resposta que parafraseie
  "trezentos e cinquenta e quatro euros" ou "12 de julho de 2026" nunca
  é validada nesses termos (nem aceite nem rejeitada por esse motivo) —
  decisão consciente, documentada nas alternativas rejeitadas acima.
- **Presença obrigatória de nome/estado só se aplica quando
  `filters.status`/`supplierName`/`categoryName` está definido** — uma
  resposta a uma pergunta multi-linha sem filtro (ex. "quais os
  principais fornecedores") que substitua um nome por outro dentro da
  lista não é detetada por presença obrigatória (só a exclusão de
  valores/datas continua a aplicar-se) — risco aceite, documentado nas
  alternativas rejeitadas (exigir todos os nomes teria falsos positivos
  reais em resumos parciais legítimos).
- **Uma alegação adicional puramente qualitativa, sem nenhum
  valor/data/nome associado** (ex. "a empresa parece estar em
  dificuldades financeiras"), nunca é detetada — só alegações que
  incluam um facto extraível (valor, contagem, data, ou o
  nome/estado central da pergunta) são cobertas.
- A regra "nunca instruções" (defesa em profundidade ao nível do
  prompt) depende do modelo seguir instruções — nunca uma garantia
  absoluta por si só; a garantia estrutural real é a validação de
  grounding (secção 5) mais a sanitização de domínio (secção 4).
- Validação manual real via Docker/OpenRouter não foi executada nesta
  sessão (não pedida) — toda a validação desta fase é automatizada.
  `MockAiProvider` nunca ecoa o `system prompt`, só a última mensagem do
  pedido — por isso o comportamento do validador de grounding contra um
  texto adulterado só é observável nos testes unitários/integração
  (`financial-grounding.validator.spec.ts`, `ai-chat.service.spec.ts`,
  `ai-tool-orchestrator.service.spec.ts`), nunca via a resposta HTTP de
  um teste e2e.

## Fora do âmbito (confirmado, não implementado)

OCR, Fiscal Parsing, InvoiceDraft, promoção de faturas, validações
contabilísticas, IVA, NIF, Dashboard, Reports, tools novas, providers
novos, embeddings, RAG, agentes autónomos, streaming, packages novos,
migrations, alterações Prisma, alterações ao frontend, alteração ao
tool registry. Nenhuma alteração à arquitetura das Fases 8.1–8.7 — só
reforços internos aos módulos já existentes.

## Critérios de conclusão

- [x] `ASSISTANT_RULES`/`TOOL_ATTEMPT_RULES` proíbem explicitamente
      alterar/arredondar/reformular dados fornecidos.
- [x] Nomes de fornecedor/categoria sanitizados estruturalmente.
- [x] Router reconhece vocabulário financeiro alargado, sem LLM.
- [x] Snapshot de contexto conversacional validado mais rigorosamente,
      bug real corrigido.
- [x] **Fronteira determinística entre `FinancialRetrievalResult` e a
      resposta final, nunca o LLM como validador** — implementada,
      aplicada aos dois caminhos exigidos (direto e após tool calling).
- [x] Resposta que altera valor/data/período/fornecedor/categoria/estado,
      ou acrescenta alegação não suportada, nunca é persistida —
      substituída por um fallback construído exclusivamente a partir de
      `FinancialRetrievalResult`.
- [x] Testes obrigatórios para os 7 casos pedidos (total, período,
      fornecedor, categoria, data, estado, alegação adicional) — nos
      dois caminhos (validador isolado: todos os 7; caminho direto:
      todos os 7; tool calling: 3 representativos, mesma lógica
      partilhada e já exaustivamente testada no validador).
- [x] Respostas válidas confirmadas como continuando aceites, nos dois
      caminhos.
- [x] Sem package novo, sem dependência externa, sem lógica movida para
      `packages/ai`.
- [x] Sem alteração a OCR, Fiscal Parsing, InvoiceDraft, promoção,
      Dashboard, Reports, Prisma, frontend, providers, tool registry,
      ou arquitetura da Fase 8.7.
- [x] `AMOUNT_TOKEN_PATTERN`/`normalizeAmountToken()` reconhecem
      corretamente os 12 formatos monetários exigidos (milhares,
      decimais, espaços, `€`/`EUR`, sinal negativo), sem regredir os
      formatos já suportados.
- [x] `isValidPeriod()` rejeita `from > to`, aceita `from < to` e
      `from == to` — nunca deixa um período assim chegar a
      `resolvePeriod()`.
- [x] Contagem factual de testes corrigida nesta versão do documento
      (841 testes reais na suite unitária, confirmados por execução).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos (app e
      workspace completo), sem nenhuma regressão nos 821 testes
      anteriores a esta correção final.
- [x] Âmbito da Fase 8.8 não expandido — só os 3 pontos pedidos
      (`AMOUNT_TOKEN_PATTERN`, `normalizeAmountToken()`,
      `isValidPeriod()`) foram alterados; AI Router, Tool Calling
      (schema/registo), OCR, Fiscal Parsing, InvoiceDraft, Dashboard,
      frontend, Prisma, providers, `packages/ai`, Prompt Injection,
      validação semântica/AST, e grounding por LLM permanecem
      intocados.

## Próxima fase

Nenhuma candidata formalmente registada. Validação manual real via
Docker/OpenRouter desta fase (pendente, ver "Limitações conhecidas"); e,
só com evidência real de impacto, uma eventual extensão do validador de
grounding para cobrir números por extenso ou presença obrigatória mais
ampla de nomes em respostas multi-linha, ficam como ideias para uma
fase futura, não decididas nem aprovadas aqui.
