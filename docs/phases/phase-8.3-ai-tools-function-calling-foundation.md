# Fase 8.3 — AI Tools (Function Calling) Foundation

## Objetivo

Fase única, com dois blocos implementados em conjunto: (1) eliminar
respostas financeiras inventadas pelo Chat IA quando o retrieval
determinístico (Fase 8.1) não reconhece a pergunta — corrigido na
sequência de uma investigação real que confirmou a causa; (2)
introduzir tool calling read-only, só como oportunidade adicional
quando o retrieval determinístico continua sem reconhecer a pergunta,
nunca como substituto — mantendo a arquitetura provider-agnostic de
`packages/ai` completamente genérica. Inclui também uma melhoria de UX
para gestão do histórico de conversas (eliminação individual), pedida
para a mesma fase.

## Âmbito

Bloco 1: vocabulário de reconhecimento alargado, recuperação de
intenção/período por histórico de conversa, fallback determinístico
que nunca confia no modelo sem dados reais. Bloco 2: tools read-only
(6, espelhando 1:1 as intenções da Fase 8.1); extensão aditiva do
contrato `AiCompletionProvider` em `packages/ai`; orquestrador
específico do FrontRest, bounded a no máximo 1 tool call e 2 chamadas
ao provider (nunca um loop aberto), com a garantia estrutural de que a
2ª chamada só acontece quando há dados reais por trás; eliminação de
conversas (`DELETE /ai/conversations/:id`) e melhorias de UX na barra
lateral. Sem RAG, embeddings, agentes autónomos, streaming, escrita
financeira, provider registry dinâmico, pesquisa, favoritos, pastas,
arquivo.

## Bloco 1 — Hardening da precisão do retrieval financeiro

### Investigação e causa raiz

Uma conversa real (organização "ivoaovivo") mostrou respostas
financeiras com valores e entidades inexistentes ("Fornecedor A",
"Matéria-Geral", "1.500,00 €") nunca presentes na base de dados.
Reexecução determinística de `FinancialRetrievalService.retrieve()`
contra as mensagens reais provou que, em todos os casos, o `system
prompt` enviado ao modelo **não continha nenhum dado financeiro** —
`resolveFinancialIntent()`/`resolveFinancialPeriod()` (Fase 8.1) não
reconheciam perguntas naturais como "Quantas faturas existem?",
"Existem faturas pendentes?", "Onde estou a gastar mais dinheiro?", ou
respostas de continuação como "sim este mês". Uma prova de controlo
("Quanto tenho por pagar este mês?") confirmou que, quando o retrieval
reconhece a pergunta, os dados são exatos (`SELECT` direto à base de
dados). A causa não é o cálculo — é a cobertura do reconhecimento, mais
a decisão arquitetural de continuar a chamar o modelo mesmo sem dados
reais, confiando numa instrução ("admite insuficiência") que nem todos
os modelos seguem de forma fiável.

### Vocabulário alargado (`financial-intent.resolver.ts`)

`OUTSTANDING_PATTERN` ganha `pendente(s)`; `BY_CATEGORY_PATTERN` ganha
`onde (estou a gastar|gasto|gastamos)`/`maior despesa` (decisão
explícita: mapeado para categoria, não fornecedor, por ser a dimensão
de despesa mais comum nesta fraseação); `FINANCIAL_SUMMARY_PATTERN`
ganha `quantas faturas`/`faturas existem`/`numero de faturas`. Sem
camada de normalização lexical nova — expansão direta do regex
existente (YAGNI face ao tamanho real da lacuna).

### Recuperação por histórico (`FinancialRetrievalService`)

`retrieve()` ganha um parâmetro `recentUserMessages: string[]`
(mensagens `USER` anteriores, mais recente primeiro, reaproveitando o
mesmo histórico já carregado para o provider — sem query nova). Quando
a mensagem atual não resolve intenção **mas** resolve período sozinha
(ex. "sim este mês"), procura a intenção na mensagem `USER` anterior
mais recente que a resolveu; quando resolve intenção mas não período,
procura o período mais recente resolvido no histórico. Nunca combina
os dois recuperados de mensagens antigas — só um pode faltar na
mensagem atual. Janela sempre limitada ao histórico já enviado ao
provider (`AI_CHAT_HISTORY_LIMIT`), nunca mais longe.

### Fallback determinístico — provider nunca confiado sem dados

`buildFinancialContextMessage()` passa a tratar exclusivamente o `kind`
`DATA` (os outros 4 ramos removidos — ficavam inatingíveis pelo novo
desenho). Nova `buildDeterministicReply()` produz o texto final pt-PT,
já pronto para ser persistido diretamente como mensagem `ASSISTANT` —
não uma instrução para o modelo. `AiTenantContextService` deixou de
depender de `FinancialRetrievalService` — passou a síncrona, pura, só
compõe `ASSISTANT_RULES` com o resultado `DATA` já resolvido por
`AiChatService`.

`AiChatService.sendMessage()` decide **antes** de construir qualquer
`system prompt`: resultado `DATA` → caminho de sempre (system prompt
real + provider); `UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS` →
tenta o orquestrador de tools (Bloco 2 abaixo) e, se este também não
responder, persiste `buildDeterministicReply()` diretamente, **sem
chamar o provider**; `ERROR` (falha interna, ex. `DashboardService`) —
nunca tenta o orquestrador nem o provider, vai direto ao fallback
determinístico, porque um erro do lado do servidor não tem nenhuma
relação com "talvez uma tool ajude". Mensagens determinísticas são
marcadas com `provider='deterministic'`, `model='financial-retrieval-fallback'`
— nunca confundíveis com uma resposta real numa auditoria.

## Bloco 2 — AI Tools (Function Calling)

### Contrato aditivo (`packages/ai`)

`AiToolDefinition`/`AiToolCall` (novo `contracts/ai-tool.ts`, JSON
Schema-based); `AiMessage.role` ganha `'tool'` (+`toolCallId`/`name`);
`AiMessage` ganha `toolCalls?: AiToolCall[]`, só com sentido em
`role: 'assistant'` — necessário para preservar a(s) tool call(s) que
originaram a mensagem ao reenviá-la no pedido seguinte (protocolo
OpenAI-compatible e Ollama nativo exigem ambos essa preservação para
correlacionar com a mensagem `tool` seguinte; `role`/`content` sozinhos
nunca são suficientes). `AiCompletionRequest.tools?`/`AiCompletionResponse.toolCalls?`
(opcionais, aditivos — sem alteração de comportamento quando ausentes).
`MockAiProvider` simula deterministicamente uma chamada à primeira
tool oferecida (testável); `OllamaAiProvider`/`OpenRouterAiProvider`
serializam `tools`/parseiam `tool_calls` nos respetivos formatos reais
(Ollama: `function.arguments` como objeto, mensagem `tool` usa
`tool_name` — a API nativa não tem IDs de tool call, ao contrário do
OpenAI-compatible; OpenRouter: `function.arguments` já como string
JSON, `tool_call_id` na mensagem `tool`, `tool_calls` preservado na
mensagem `assistant` reenviada). Nenhuma alteração exigida a
`AiChatService`/`AiController` só por causa do contrato — confirma a
promessa provider-agnostic desde a Fase 6.11.

### Tools e orquestrador (`apps/frontrest/api/src/ai/tools/`)

6 tools (`get_financial_summary`, `get_outstanding_balance`,
`get_invoices_by_status`, `get_expenses_by_category`,
`get_top_suppliers`, `get_monthly_trend`), cada uma com um único
argumento `period` (texto livre) — allow-list fechada
(`TOOL_NAME_TO_INTENT`), reutilizando `FinancialRetrievalService.retrieveForIntent()`
(novo método público, reaproveita `resolveFinancialPeriod()` +
`DashboardService` + `selectData()`, nunca uma segunda fonte de dados).

`AiToolOrchestratorService.run()`: 1ª chamada ao provider com `tools`
→ sem `toolCalls`, `NOT_ANSWERED` (texto livre nunca é a resposta
final); nome de tool fora da allow-list ou argumentos inválidos,
`NOT_ANSWERED`, nunca executa; tool válida → `retrieveForIntent()`
real. **Garantia estrutural**: a 2ª chamada ao provider só acontece
quando `retrieveForIntent()` devolve `kind === 'DATA'` — qualquer
outro resultado (`PERIOD_MISSING`, `PERIOD_AMBIGUOUS`, `ERROR`,
`UNSUPPORTED`) devolve `NOT_ANSWERED` de imediato, sem construir
nenhuma mensagem `tool` nem fazer a 2ª chamada — nunca se converte um
resultado não-`DATA` numa mensagem `tool` para depois confiar na
resposta textual do modelo, o que reabriria exatamente o risco de
alucinação que o Bloco 1 fecha. Só com `DATA` real: resultado
formatado (`buildFinancialContextMessage()`) → mensagem `assistant`
reenviada com `toolCalls` preservados + mensagem `tool` com o
resultado → 2ª chamada **sem** `tools` (força resposta final, nunca
uma 2ª tool call) → `ANSWERED` com conteúdo real. `organizationId` vem
sempre do chamador autenticado (`AiChatService`), nunca de `args` —
nem sequer declarado no JSON Schema das tools.

`compare_periods` (proposta na análise arquitetural) **não
implementada nesta fase** — exigiria expor a lógica de comparação hoje
privada em `ReportsService`; registada como trabalho futuro.

## Arquitetura — Gestão de Conversas

### Backend

`onDelete: Cascade` já provisionado (`AiMessage.conversation`, schema
existente) — eliminação física sem migration nova.
`AiChatService.deleteConversation(organizationId, userId, id)` reutiliza
`findOwnedConversation()` (mesmo 404 genérico de sempre) →
`prisma.aiConversation.delete()`. `AiController` ganha
`DELETE /ai/conversations/:id` (`204`). `listConversations()`/`getConversation()`
passam a derivar `titlePreview` (renomeado de `lastMessagePreview`) da
**primeira** mensagem da conversa, não da última — único consumidor
(barra lateral) atualizado em conjunto.

### Frontend

`lib/ai-chat.ts::deleteConversation()` (mesmo padrão de
`deleteSupplier`); `ConversationList` ganha um botão de eliminar por
item (visível ao passar o rato/foco) + `EmptyState` reutilizado
(`@frontcore/ui`) quando a lista fica vazia; `page.tsx` reutiliza o
`ConfirmDialog` genérico já existente (`components/confirm-dialog.tsx`,
mesmo componente de Fornecedores/Categorias/Faturas) — sem diálogo
novo. Remoção da lista local imediata após sucesso, sem
`listConversations()` nem refresh da página; eliminar a conversa ativa
volta ao estado "nova conversa".

## Ficheiros criados

```
packages/ai/src/contracts/ai-tool.ts
apps/frontrest/api/src/ai/tools/financial-tool.registry.ts
apps/frontrest/api/src/ai/tools/ai-tool-orchestrator.service.ts (+ .spec.ts)
docs/phases/phase-8.3-ai-tools-function-calling-foundation.md
```

## Ficheiros alterados

```
packages/ai/src/contracts/{ai-message,ai-completion-provider,ai-tool,index}.ts
packages/ai/src/providers/mock/mock-ai-provider.ts (+ .test.ts)
packages/ai/src/providers/ollama/ollama-ai-provider.ts (+ .test.ts)
packages/ai/src/providers/openrouter/openrouter-ai-provider.ts (+ .test.ts)
apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.ts (+ .spec.ts)
apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts (+ .spec.ts)
apps/frontrest/api/src/ai/financial-retrieval/financial-context.builder.ts (+ .spec.ts)
apps/frontrest/api/src/ai/ai-tenant-context.service.ts (+ .spec.ts)
apps/frontrest/api/src/ai/{ai-chat.service,ai.controller,ai.module}.ts (+ .spec.ts)
apps/frontrest/api/test/ai-chat.e2e-spec.ts
apps/frontrest/web/lib/ai-chat.ts
apps/frontrest/web/app/(dashboard)/ai/chat/{conversation-list,page}.tsx (+ .test.tsx)
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Sem package novo, sem migration, sem dependência externa. `DashboardService`,
`ReportsService`, `FinancialRetrievalService.retrieve()` (caminho
principal, salvo a recuperação por histórico do Bloco 1) — inalterados.

## Testes

### Bloco 1 (regressão das frases reais)

`financial-intent.resolver.spec.ts` (23, +5): "Quantas faturas
existem?"→`FINANCIAL_SUMMARY`, "Existem faturas pendentes?"→`OUTSTANDING_BALANCE`,
"Onde estou a gastar mais dinheiro?"→`BY_CATEGORY`, "Qual é o
fornecedor onde mais gastamos?"→`TOP_SUPPLIERS`, "Faz um resumo
financeiro da empresa."→`FINANCIAL_SUMMARY`; vocabulário alargado nunca
sobrepõe exclusões (escrita/comparação). `financial-retrieval.service.spec.ts`
(24, +10, incluindo `retrieveForIntent` para o Bloco 2): "sim este
mês" recupera a intenção da mensagem anterior; pergunta nova sem
período recupera o período de uma mensagem anterior; usa sempre a
mensagem mais recente que resolve; sem histórico continua `UNSUPPORTED`;
mensagem sem período próprio nunca recupera intenção. `financial-context.builder.spec.ts`
(14): `buildDeterministicReply()` testado por `kind`, nunca instruções
dirigidas ao modelo.

### Bloco 2 (tools) e integração

`mock-ai-provider.test.ts` (7), `ollama-ai-provider.test.ts` (29),
`openrouter-ai-provider.test.ts` (30) — serialização de `tools`,
normalização de `tool_calls` (incl. diferença de formato Ollama vs.
OpenAI), preservação de `toolCalls`/`tool_calls` na mensagem
`assistant` reenviada, `tool_name` vs. `tool_call_id` na mensagem
`tool`, comportamento inalterado sem `tools`.
`ai-tool-orchestrator.service.spec.ts` (17): allow-list,
`organizationId` nunca de `args`, bounded a 1 tool call mesmo com
várias na resposta, 2ª chamada nunca oferece `tools`, falhas do
provider nunca propagam, **`PERIOD_AMBIGUOUS`/`PERIOD_MISSING`/`ERROR`/`UNSUPPORTED`
devolvidos por `retrieveForIntent()` nunca fazem a 2ª chamada ao
provider — `NOT_ANSWERED` imediato**, `toolCalls` da 1ª resposta
preservados na mensagem `assistant` reenviada. `ai-chat.service.spec.ts`
(31): `provider.complete` nunca chamado nos 4 `kind` não-`DATA` no
caminho direto; resposta determinística com marcadores próprios;
**`ERROR` nunca chama `toolOrchestrator.run()` nem `provider.complete()`**;
`titlePreview`/`deleteConversation` (isolamento por organização/utilizador).
`ai-chat.e2e-spec.ts`: as 6 frases reais completam com sucesso; "sim
este mês" confirmado a chamar `DashboardService` de facto; tool call
real via Mock + `DashboardService` real; `DELETE` com matriz de
isolamento completa (própria, outra organização, outro utilizador,
inexistente, sem token) + cascata confirmada. Frontend
`ai-chat.test.tsx` (13): diálogo de confirmação, eliminação imediata
sem refresh, cancelar não elimina, eliminar a conversa ativa volta a
"nova conversa", erro mostra feedback sem remover da lista.

## Validações executadas

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | 24/24 |
| `pnpm build` | 14/14 |
| `pnpm test` | 18/18 tarefas (580 testes em `@frontrest/api`, 114 em `packages/ai`, restantes por cache) |
| `pnpm --filter @frontrest/api test:e2e` | 136/136 |
| `packages/ai` (`mock`/`ollama`/`openrouter`) | 114/114 |
| Frontend `ai-chat.test.tsx` | 13/13 |

## Validação manual (Docker, dados reais)

Reexecutada a exata conversa que originou a investigação (organização
"ivoaovivo", 6 faturas reais, julho 2026), com `AI_PROVIDER=mock`:
"Faz um resumo financeiro da empresa." → resolvida via orquestrador de
tools com dados **reais** ("Faturas ativas: 6, total 470.00 EUR" —
byte-a-byte igual à base de dados); as 5 mensagens seguintes ("sim
este mês", "Onde estou a gastar mais dinheiro?", "Quantas faturas
existem?", "Existem faturas pendentes?", "Qual é o fornecedor onde
mais gastamos?") resolveram todas diretamente via `DATA` (confirmado
por `SELECT` direto: `provider='mock'` em todas, nunca `'deterministic'`,
e o conteúdo ecoado confirma o caminho `DATA`, não o de fallback). As
mesmas 6 perguntas que antes produziram "Fornecedor A"/"Matéria-Geral"/valores
inventados agora chegam sempre a dados reais ou a uma resposta
determinística honesta. `DELETE /api/ai/conversations/:id`: `204`
real, `GET` subsequente `404`, `AiMessage` da conversa confirmadas
eliminadas por cascata real (`SELECT COUNT(*) = 0`). `/ai/chat` no
frontend reconstruído (`docker compose build web`) responde `200`.

### Validação real do tool calling multi-turn contra OpenRouter (não só Mock)

Empiricamente confirmado contra o serviço OpenRouter real
(`AI_PROVIDER=openrouter`, `google/gemini-2.5-flash`, mesma organização
"ivoaovivo"), via `POST /api/ai/chat` real (não um script isolado):

- **`get_financial_summary`**: "Podes dar-me uma visão geral das minhas
  finanças da empresa este mês?" (fora do vocabulário regex — nunca
  resolvido diretamente) → tool call real → resposta final "Faturas
  ativas: 6 faturas, ... total de 470,00 EUR..." — byte-a-byte igual à
  base de dados. Persistido com `provider='openrouter'`,
  `model='google/gemini-2.5-flash'`, `inputTokens=293`,
  `outputTokens=88` (nunca `'deterministic'`).
- **`get_top_suppliers`**: "Faz-me um ranking de quem mais me cobrou
  este mês, por entidade emissora das faturas." → tool call real →
  resposta lista Hetzner (3, 354,00 EUR), Farmácia Esperança (2, 100,00
  EUR), NOS (1, 16,00 EUR) — confirmado idêntico a `SELECT` direto
  agrupado por fornecedor. Persistido com `provider='openrouter'`.
- **Pergunta não financeira** ("Qual é a capital de Portugal?"): zero
  tool calls — o modelo devolveu texto livre recusando o tema (visível
  isoladamente fora do fluxo real), mas o orquestrador descarta sempre
  texto livre sem tool chamada (`NOT_ANSWERED`, por desenho — ver
  "Garantia estrutural" acima), por isso a resposta final persistida
  foi sempre o fallback determinístico ("Não tenho essa informação
  disponível..."), confirmado por `provider='deterministic'` na base
  de dados. Confirmado por duas fraseações diferentes, ambas sem
  nenhuma tool chamada.

**Achado honesto, não um bug de código**: a escolha de qual tool
chamar não é perfeitamente determinística — a mesma intenção ("quem
mais me cobra") descrita de formas ligeiramente diferentes por vezes
levou o modelo a chamar `get_outstanding_balance` em vez de
`get_top_suppliers`, ou a não chamar nenhuma tool, antes de uma
fraseação mais explícita ("ranking... por entidade emissora") produzir
a tool correta. Isto é comportamento do modelo (`google/gemini-2.5-flash`
via OpenRouter), não da lógica determinística deste código — a garantia
estrutural que este código impõe é que, seja qual for a tool escolhida
(ou nenhuma), a resposta final nunca é confiada sem dados reais por
trás (ver "Garantia estrutural" acima). Validação **não** realizada
contra Ollama real com um modelo `tools`-capable (só contra Mock) —
ver limitação abaixo.

## Limitações conhecidas

Vocabulário ainda finito — frases muito distantes das formas testadas
podem continuar a cair no fallback (comportamento correto e seguro,
não um bug). Recuperação por histórico não persiste entre limpezas de
`AI_CHAT_HISTORY_LIMIT` — uma conversa muito longa pode perder o
período estabelecido fora da janela, tratado como `PERIOD_MISSING`
nesse caso (aceite, sem estado persistido, ver decisão arquitetural).
`compare_periods` não implementada (registada acima). Confirmação
visual manual no browser não tecnicamente possível neste ambiente
(mesma limitação já registada em fases anteriores).

**Tool calling multi-turn — estado real da validação empírica**:
confirmado contra o serviço OpenRouter real (ver secção acima) para
`get_financial_summary`, `get_top_suppliers`, e uma pergunta não
financeira — os três casos pedidos. A escolha da tool pelo modelo não é
perfeitamente determinística (ver "achado honesto" acima) — comportamento
esperado de um LLM, mitigado estruturalmente (nunca por confiança cega)
pela garantia de que só `DATA` real permite uma resposta final.
**Não confirmado empiricamente contra um servidor Ollama real com um
modelo `tools`-capable** — só testado contra `MockAiProvider`
(determinístico, sempre chama a primeira tool oferecida) nos testes
automatizados; o formato de serialização Ollama (`tool_name` em vez de
`tool_call_id`, sem `id` nas tool calls nativas) segue a documentação
pública do Ollama, mas não foi re-confirmado contra um servidor real
nesta ronda de correção — não declarar este suporte como empiricamente
validado até essa confirmação existir.

## Fora do âmbito (confirmado, não implementado)

Agentes autónomos, RAG, embeddings, streaming avançado, escrita
financeira, execução arbitrária, provider registry dinâmico,
`compare_periods`, pesquisa de conversas, favoritos, pastas, arquivo.

## Critérios de conclusão

- [x] Vocabulário alargado para as formulações reais que falhavam.
- [x] Recuperação de intenção/período por histórico, sem persistência nova.
- [x] Provider nunca confiado como resposta final sem `DATA` real (retrieval direto ou via tool).
- [x] Fallback determinístico, marcado, nunca confundível com uma resposta real.
- [x] `ERROR` nunca tenta o orquestrador nem o provider.
- [x] `AiCompletionProvider` só aditivo — comportamento sem `tools` idêntico ao anterior.
- [x] `organizationId` nunca do modelo — testado.
- [x] Máximo 1 tool call, 2 chamadas ao provider — nunca um loop aberto, e a 2ª só com `DATA` real.
- [x] Texto livre sem tool nunca é a resposta final.
- [x] Mensagem `assistant` reenviada preserva `toolCalls`/`tool_calls` (OpenRouter e Ollama).
- [x] `DELETE /ai/conversations/:id` isolado por organização e utilizador.
- [x] Cascata de mensagens confirmada real.
- [x] Lista atualiza sem refresh completo da página.
- [x] Isolamento multi-tenant preservado (sem alteração às queries Prisma).
- [x] Testes de regressão para as 6 frases reais (unitários + e2e).
- [x] Sem package novo, migration, dependência externa.
- [x] Validação manual real reexecutando a conversa real — respostas corretas confirmadas.
- [x] Tool calling multi-turn validado empiricamente contra OpenRouter real (`get_financial_summary`, `get_top_suppliers`, pergunta não financeira).
- [ ] Tool calling multi-turn validado empiricamente contra Ollama real (não realizado — ver limitações).

## Próximo passo

Por decidir — candidatos naturais: `compare_periods` (fecha a lacuna já
identificada na Fase 8.1); validação manual de tool calling contra
Ollama real; confirmação visual manual das fases com frontend ainda
pendentes.
