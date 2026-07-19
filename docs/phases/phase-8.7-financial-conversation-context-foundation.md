# Fase 8.7 — Financial Conversation Context Foundation

## Nota factual sobre o commit histórico `58eb497`

O commit `58eb4972671aae8a8b0ef1393d88ff45c21b817d`, com a mensagem
`feat(ai): implement Financial Conversation Context Foundation (Phase
8.7)` e a tag `v0.8.7-financial-conversation-context-foundation`, **não
contém nenhuma implementação funcional da Fase 8.7**. O seu `diff`
completo altera exclusivamente quatro documentos do AI Framework —
`docs/INDEX.md`, `docs/ai/AI_BASE_PROMPT.md`, `docs/ai/AI_WORKFLOW.md`,
`docs/ai/README.md` (Execution Mode, continuidade entre fases, prompts
de fase mínimos, estabilidade do AI Framework) — sem nenhuma alteração a
`packages/database/prisma/schema.prisma`, nenhuma migration, nenhum
ficheiro em `apps/frontrest/api/src/ai/`, e nenhum teste novo. Verificado
com `git show --stat 58eb497`, confirmando `4 files changed` (todos em
`docs/`), `0` alterações a código ou schema.

A implementação funcional real da Fase 8.7 — schema, migration, serviço
de contexto conversacional, integração no chat/retrieval/router/
comparação/tool calling, testes unitários e e2e — é a descrita neste
documento, realizada nesta sessão (2026-07-19), posterior ao commit
`58eb497` e ainda não commitada (ver "Comandos Git recomendados" no
relatório desta sessão).

## Objetivo

Persistir, de forma versionada e isolada por conversa, a última
intenção/período/filtros financeiros resolvidos com sucesso no Chat IA
— um snapshot estruturado em `AiConversation`, substituindo a
reanálise de texto livre do histórico recente (Fases 8.3/8.4) como
fonte de recuperação preferida para continuações conversacionais, sem
remover essa reanálise (mantida como fallback para conversas sem
snapshot ainda).

## Âmbito

Contexto financeiro versionado (`FinancialConversationContextV1`)
persistido em `AiConversation.financialContext` (`Json?`, nova
migration Prisma); leitura defensiva e versionada
(`parseFinancialConversationContext()` — nunca lança, nunca confia numa
forma desconhecida); construção a partir de um resultado `DATA` real
(`buildFinancialConversationContext()` — nunca a partir de texto livre
do modelo); integração como fonte de recuperação preferida em
`FinancialRetrievalService.retrieve()` (intenção, período, filtros),
`classifyMessageRelevance()` (router híbrido, Fase 8.4) e
`AiToolOrchestratorService` (exposição do `retrievalResult` real por
trás de uma resposta `ANSWERED`, para o snapshot também ser atualizado
quando a resposta veio de uma tool); isolamento por organização,
utilizador e conversa (herdado da já garantida por
`findOwnedConversation()` — sem mecanismo novo). Mantido fora do
âmbito, por decisão explícita: migração automática entre versões do
snapshot (só o campo `version` existe, preparado para uma v2 futura,
nunca implementada aqui); qualquer alteração de comportamento à
comparação de períodos (Fase 8.6, `resolvePeriodComparison()` continua
a nunca recuperar por histórico); qualquer alteração ao frontend;
qualquer nova tool; qualquer alteração a providers ou OCR.

## Estado inicial

Fase 8.6 (`v0.8.6-financial-period-comparison-foundation`) —
`FinancialRetrievalService.retrieve()` recuperava intenção/período/
filtros de mensagens anteriores exclusivamente por reanálise de texto
livre (`recoverIntent()`/`recoverPeriod()`/`recoverFilters()`, sobre
`recentUserMessages`, a mesma janela finita enviada ao provider), sem
nenhum estado estruturado persistido entre mensagens. `AiConversation`
não tinha nenhum campo para além de `id`/`organizationId`/`userId`/
`createdAt`/`updatedAt`. O commit `58eb497` (ver nota acima) não alterou
nenhum destes factos.

## Arquitetura implementada

### Snapshot versionado

`apps/frontrest/api/src/ai/financial-retrieval/financial-conversation-context.ts`
(novo, funções puras, sem I/O) — `FINANCIAL_CONTEXT_VERSION = 1`;
`FinancialConversationContextV1` (`version`, `intent`, `period`,
`filters`, `recordedAt`); `buildFinancialConversationContext(result,
now)` constrói o snapshot a partir de um `FinancialRetrievalResult` já
`kind: 'DATA'` (nunca de texto livre); `parseFinancialConversationContext(raw)`
lê o valor `Json?` bruto do Prisma de forma defensiva — `version`
diferente de `1`, `intent` desconhecido, `period`/`filters`/`recordedAt`
malformados ou em falta devolvem sempre `null` (nunca lança, nunca
confia numa forma que não seja exatamente a esperada). Para
`PERIOD_COMPARISON` (Fase 8.6), `period` é sempre o lado `current` da
comparação — mesmo comportamento que a recuperação por texto já
produzia antes desta fase (uma mensagem anterior "compara maio com
junho" já recuperava a intenção `PERIOD_COMPARISON` por
`recoverIntent()`), não uma correção nem uma extensão nova.

### Schema e migration

`packages/database/prisma/schema.prisma` —
`AiConversation.financialContext Json?` (nulo até à primeira resolução
`DATA`, ou em conversas anteriores a esta fase). Migration
`packages/database/prisma/migrations/20260719121104_add_ai_conversation_financial_context/migration.sql`
(`ALTER TABLE "AiConversation" ADD COLUMN "financialContext" JSONB;`),
gerada e aplicada com `pnpm prisma:migrate` contra o Postgres local
(`frontcore-postgres`, Docker, já em execução).

### Retrieval — recuperação preferida, texto como fallback

`FinancialRetrievalService.retrieve()` ganhou o parâmetro opcional
`previousContext: FinancialConversationContextV1 | null = null` (último
parâmetro — nunca quebra as 46 chamadas existentes que não o passam).
Quando presente: a intenção recuperada é sempre `previousContext.intent`
(nunca `recoverIntent()`); o período recuperado é sempre
`resolvePeriod(previousContext.period.from, previousContext.period.to)`
(Fase 7, reconstrói `gte`/`lt` a partir das duas datas persistidas —
nunca uma segunda semântica de datas); os filtros herdados numa
continuação (`hasContinuationSignal()`, Fase 8.4) vêm sempre de
`previousContext.filters` (nunca `recoverFilters()`). Quando ausente
(`null` — conversa sem snapshot ainda), o comportamento é
**exatamente** o de antes desta fase: `recoverIntent()`/
`recoverPeriod()`/`recoverFilters()`, inalterados. `resolvePeriodComparison()`
nunca lê `previousContext` — a decisão da Fase 8.6 de nunca recuperar
por histórico permanece intocada.

A vantagem prática sobre a reanálise de texto: o snapshot reflete a
última resolução `DATA` bem-sucedida da conversa **inteira**, nunca só
a janela finita de `recentUserMessages` — uma continuação continua a
recuperar com sucesso mesmo depois de a mensagem original sair da
janela de histórico carregada (confirmado por um teste e2e dedicado com
`AI_CHAT_HISTORY_LIMIT=1`, ver "Testes").

### Router híbrido

`classifyMessageRelevance()` (`router/financial-relevance.classifier.ts`,
Fase 8.4) ganhou o parâmetro opcional `hasFinancialContext = false`
(nunca quebra a única chamada de produção nem os testes existentes).
Uma continuação sem vocabulário financeiro-adjacente na janela de
histórico conta agora também como `FINANCIAL` quando
`hasFinancialContext` é `true` — mesma disciplina de "nunca tratar como
geral só por falta de sinal", agora também informada pelo snapshot
persistido, não só pelo texto recente.

### Tool calling

`AiToolOrchestratorService.run()` — o resultado `ANSWERED` ganhou o
campo `retrievalResult: Extract<FinancialRetrievalResult, { kind: 'DATA'
}>`, o resultado real (nunca texto livre) por trás da resposta da tool.
Sem este campo, `AiChatService` não teria como construir o snapshot
para um turno respondido via tool calling — uma continuação depois de
um turno assim nunca recuperaria com sucesso.

### Chat

`AiChatService.sendMessage()` — lê e interpreta
`conversation.financialContext` (`parseFinancialConversationContext()`)
logo após resolver/criar a conversa (mesma linha já isolada por
`findOwnedConversation()`/`create()`, sem mecanismo de isolamento novo);
passa o resultado a `classifyMessageRelevance()`
(`hasFinancialContext !== null`) e a `financialRetrieval.retrieve()`
(`previousContext`). Sempre que o retrieval determinístico OU o
orquestrador de tools devolve um resultado `DATA` real, o snapshot é
reconstruído (`buildFinancialConversationContext()`) e persistido na
mesma transação Prisma da mensagem `ASSISTANT`
(`persistAssistantReply()`, `tx.aiConversation.update()`). Qualquer
outro resultado (`UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS`/
`ENTITY_AMBIGUOUS`/`ERROR`, e o caminho `GENERAL`) nunca escreve a
coluna — o último snapshot bem-sucedido permanece válido para a
próxima mensagem, decisão explícita confirmada por teste.

### Isolamento

Por organização, utilizador e conversa — sempre o já garantido por
`findOwnedConversation()` (conversa de outra organização ou de outro
utilizador da mesma organização devolve o mesmo 404 genérico, Fase 8) e
pela chave primária da linha (`AiConversation.id`). `financialContext`
vive na mesma linha, sem nenhuma tabela nova, cache partilhado ou
mecanismo de leitura cruzada entre conversas — confirmado por testes
unitários e e2e dedicados (ver "Testes").

## Ficheiros criados

- `apps/frontrest/api/src/ai/financial-retrieval/financial-conversation-context.ts`
- `apps/frontrest/api/src/ai/financial-retrieval/financial-conversation-context.spec.ts`
- `packages/database/prisma/migrations/20260719121104_add_ai_conversation_financial_context/migration.sql`
- `docs/phases/phase-8.7-financial-conversation-context-foundation.md`

## Ficheiros alterados

- `packages/database/prisma/schema.prisma` — `AiConversation.financialContext Json?`.
- `apps/frontrest/api/src/ai/ai-chat.service.ts` — leitura/persistência
  do snapshot, encaminhado ao router e ao retrieval.
- `apps/frontrest/api/src/ai/ai-chat.service.spec.ts` — testes novos
  (persistência, isolamento, leitura defensiva) e ajustes às chamadas a
  `financialRetrieval.retrieve()`/`toolOrchestrator.run()` (5º
  argumento/campo novo).
- `apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts` —
  `retrieve()` ganhou `previousContext`; `resolveFilters()` ganhou o
  mesmo parâmetro; `resolvePeriod()` (Fase 7) reutilizado para
  reconstruir `gte`/`lt`.
- `apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.spec.ts` —
  testes novos para o parâmetro `previousContext`.
- `apps/frontrest/api/src/ai/router/financial-relevance.classifier.ts` —
  `classifyMessageRelevance()` ganhou `hasFinancialContext`.
- `apps/frontrest/api/src/ai/router/financial-relevance.classifier.spec.ts` —
  testes novos.
- `apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.ts` —
  `AiToolOrchestratorResult` (`ANSWERED`) ganhou `retrievalResult`.
- `apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.spec.ts` —
  teste novo e ajuste ao `toEqual` existente.
- `apps/frontrest/api/test/ai-chat.e2e-spec.ts` — `wireInMemoryAiStore()`
  passou a simular `financialContext` (`create`/`update`, acessor
  `getConversation()`); testes novos de persistência/isolamento/
  recuperação além da janela de histórico.
- `docs/PHASES.md`, `docs/INDEX.md`, `docs/ARCHITECTURE.md` — ver secções próprias.

## Testes

- `financial-conversation-context.spec.ts` (14 testes) —
  `buildFinancialConversationContext()` (período único e
  `PERIOD_COMPARISON`, filtros vazios persistidos como `{}`);
  `parseFinancialConversationContext()` round-trip via JSON (como o
  Prisma faria), `null` para `null`/`undefined`/array/versão
  desconhecida/intent desconhecido/período malformado/filtros
  malformados/status fora do enum/campo de filtro não-string/
  `recordedAt` em falta, e aceitação de `filters: {}` como válido.
- `financial-retrieval.service.spec.ts` (+5 testes, 60 no total) —
  recuperação de intenção+período do snapshot mesmo com
  `recentUserMessages` vazio; filtros herdados do snapshot substituídos
  pela dimensão que a mensagem atual resolve por si; sem sinal de
  continuação o snapshot nunca é consultado para filtros; sem
  `previousContext` o comportamento anterior a esta fase é preservado;
  `PERIOD_COMPARISON` nunca lê `previousContext`.
- `financial-relevance.classifier.spec.ts` (+4 testes, 23 no total) —
  `hasFinancialContext=true` classifica uma continuação como
  `FINANCIAL` mesmo sem histórico financeiro-adjacente; nunca força
  `FINANCIAL` sozinho sem sinal de continuação; comportamento omitido/
  `false` idêntico ao anterior a esta fase.
- `ai-tool-orchestrator.service.spec.ts` (+1 teste, 23 no total) —
  `ANSWERED` expõe o `retrievalResult` real usado.
- `ai-chat.service.spec.ts` (+7 testes, 42 no total) — persistência do
  snapshot na mesma transação (`DATA`); leitura do snapshot existente e
  encaminhamento ao retrieval; `financialContext` corrompido tratado
  como `null`; `UNSUPPORTED`/fallback determinístico e `GENERAL` nunca
  escrevem a coluna; tool calling `ANSWERED` persiste a partir do
  `retrievalResult` exposto pelo orquestrador; isolamento entre duas
  conversas do mesmo utilizador.
- `ai-chat.e2e-spec.ts` (+5 testes, 41 no total) — persistência
  ponta a ponta do snapshot; pergunta geral subsequente nunca
  altera o snapshot; isolamento por conversa (duas conversas do mesmo
  utilizador/organização nunca partilham o snapshot); isolamento por
  organização/utilizador (404 já garantido); recuperação de um período
  explícito além da janela de histórico carregada
  (`AI_CHAT_HISTORY_LIMIT=1`, prova direta do valor desta fase sobre a
  reanálise de texto).

## Comandos de validação executados

- `pnpm prisma:migrate --name add_ai_conversation_financial_context`
  (`packages/database`) — migration criada e aplicada contra o Postgres
  local (`frontcore-postgres`, Docker, já em execução); `pnpm run build`
  (`packages/database`) — Prisma Client regenerado e copiado para `dist/`.
- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm -w typecheck` (24 tasks) — limpo.
- `pnpm --filter @frontrest/api build` — limpo.
- `pnpm -w build` (14 tasks) — limpo.
- `pnpm --filter @frontrest/api test` — 44 suites, 766 testes, todos a
  passar (735 antes desta fase + 31 novos).
- `pnpm -w test` (18 tasks) — limpo.
- `pnpm --filter @frontrest/api test:e2e` — 9 suites, 148 testes, todos
  a passar (143 antes desta fase + 5 novos).

## Validação manual (Docker, `POST /api/ai/chat` real)

**Não executada nesta sessão.** As Fases 8.2/8.4/8.6 validaram
manualmente contra `AI_PROVIDER=openrouter` real, mediante autorização
explícita do utilizador a cada vez — essa autorização não foi pedida
nem obtida nesta sessão, e por isso a validação manual real com
Docker/OpenRouter fica como trabalho pendente antes de considerar esta
fase totalmente equivalente ao padrão das fases anteriores. Toda a
restante validação (schema, migration, integração unitária e e2e ponta
a ponta com Mock provider e Postgres local via Prisma) foi executada
com dados reais, sem mocks do próprio `FinancialRetrievalService`/
`DashboardService`/Prisma.

## Limitações conhecidas

- Sem migração entre versões do snapshot: o campo `version` existe e é
  verificado (`parseFinancialConversationContext()` descarta qualquer
  valor que não seja exatamente `1`), mas nenhuma v2 foi definida nem
  há nenhum caminho de migração automática — decisão explícita, fica
  para uma fase futura caso se torne necessária.
- `resolvePeriodComparison()` (Fase 8.6) continua, por desenho
  inalterado desta fase, a nunca recuperar por histórico nem por
  snapshot — uma comparação de períodos relativa a contexto
  conversacional anterior continua fora do âmbito de ambas as fases.
- Para `PERIOD_COMPARISON`, o snapshot persiste só o período `current`
  — uma pergunta de período único imediatamente a seguir a uma
  comparação recupera esse período (mesmo comportamento herdado da
  recuperação por texto já existente antes desta fase, não introduzido
  nem corrigido aqui).
- Validação manual real via Docker/OpenRouter não foi executada nesta
  sessão (ver secção anterior) — pendente de autorização explícita do
  utilizador numa sessão futura.
- O snapshot é sobrescrito integralmente a cada resolução `DATA` — não
  existe combinação/acumulação entre snapshots de turnos diferentes
  (ex. um turno que resolve só um novo filtro nunca combina com um
  snapshot anterior que tinha também um período diferente); cada
  escrita reflete sempre o estado 100% resolvido desse turno, nunca um
  merge parcial.

## Fora do âmbito (confirmado, não implementado)

Migração automática entre versões do snapshot; alteração de
comportamento à comparação de períodos (Fase 8.6); nova tool
`compare_periods` ou qualquer tool nova; alterações ao frontend;
alterações a providers; alterações ao OCR; qualquer agente autónomo,
RAG ou embeddings; qualquer alteração ao schema além do campo
`financialContext`.

## Critérios de conclusão

- [x] `AiConversation.financialContext` (`Json?`) criado via migration,
      aplicada contra o Postgres local.
- [x] Snapshot versionado (`FinancialConversationContextV1`) construído
      só a partir de resultados `DATA` reais, nunca de texto livre.
- [x] Leitura defensiva e versionada — nunca lança, nunca confia numa
      forma desconhecida ou corrompida.
- [x] Integrado como fonte de recuperação preferida em
      `FinancialRetrievalService.retrieve()` (intenção, período,
      filtros), com o comportamento de texto livre preservado como
      fallback para conversas sem snapshot.
- [x] Integrado no router híbrido (`classifyMessageRelevance()`).
- [x] Integrado no tool calling (`AiToolOrchestratorResult.retrievalResult`).
- [x] `resolvePeriodComparison()` (Fase 8.6) permanece inalterado —
      nunca recupera por histórico nem por snapshot.
- [x] Isolamento por organização, utilizador e conversa confirmado por
      testes unitários e e2e dedicados.
- [x] Testes unitários e e2e novos, todos a passar (31 novos testes
      unitários, 5 novos e2e).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos (app e
      workspace completo).
- [ ] Validação manual via `POST /api/ai/chat` (Docker, OpenRouter
      real) — **não executada nesta sessão**, pendente de autorização
      explícita do utilizador.
- [x] Nota factual sobre o commit `58eb497` registada (ver secção
      inicial deste documento).

## Próxima fase

Nenhuma candidata formalmente registada. Validação manual real via
Docker/OpenRouter (pendente desta fase) e uma eventual v2 do snapshot
(caso surja uma necessidade real de combinar/acumular contexto entre
turnos, em vez de sobrescrever integralmente) ficam como ideias para
uma fase futura, não decididas nem aprovadas aqui.
