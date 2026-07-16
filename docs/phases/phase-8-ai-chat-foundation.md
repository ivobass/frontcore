# Fase 8 — AI Chat Foundation

## Objetivo

Primeiro consumidor real de `@frontcore/ai` (Fase 6.11) — fundação de
chat com IA, persistente, autenticado e isolado por organização e
utilizador, com providers atrás de injeção e arquitetura extensível.
Vertical slice pequeno e funcional: conversas, mensagens, `POST
/ai/chat`, histórico, `/ai/chat` no frontend — não uma plataforma
genérica de agentes, nem ainda um assistente financeiro especializado.

## Âmbito

Fundação de chat de consulta — persistência, histórico, isolamento por
tenant e por utilizador, providers atrás de injeção. A integração com
`DashboardService` (Fase 7) existe como mecanismo de contexto
arquitetural — não expande o âmbito funcional desta fase para um
assistente financeiro dedicado. Sem escrita sobre o domínio financeiro,
sem streaming, tools, function calling, RAG, embeddings, vector
database, providers cloud (OpenAI/Anthropic/Azure/OpenRouter), agentes
autónomos, partilha de conversas, edição manual de mensagens, título de
conversa, eliminação de conversa, ou alteração ao pipeline Upload →
Draft → OCR → Parsing → Review → Promote.

## Estado anterior

`@frontcore/ai` (Fase 6.11) expunha `AiCompletionProvider`, `AiConfig`,
`loadAiConfig()`, `createAiProvider()`, `MockAiProvider`,
`OllamaAiProvider`, `AiProviderError` — zero consumidores reais.
`DashboardService`/`GET /dashboard/financial-summary` (Fase 7) já
agregava `Invoice` confirmadas, isoladas por organização, com
`CANCELLED` tratado à parte e montantes sem perda de precisão. Nenhum
modelo de conversa existia no schema.

## Decisões arquiteturais

### Propriedade da conversa — organização E utilizador, sempre os dois

`AiConversation` guarda `organizationId` e `userId` explícitos (nunca
inferidos a partir de uma relação indireta). Toda a query de leitura ou
continuação usa `findFirst({ where: { id, organizationId, userId } })`
— o mesmo padrão já usado por `InvoiceDraftsService.findOne()` (Fase
6.3) — e devolve `NotFoundException` genérica quando não encontra, nunca
distinguível de "conversa de outro tenant" ou "conversa de outro
utilizador da mesma organização". Nesta foundation as conversas são
estritamente privadas ao par organização+utilizador; partilha entre
utilizadores da mesma organização fica fora do âmbito.

### Sem `title`, sem eliminação — só o essencial desta foundation

`AiConversation` não tem campo `title`: um campo permanentemente `null`
aumentaria a complexidade do modelo sem nenhum benefício nesta fase — a
lista de conversas usa só `createdAt`/`updatedAt`/`lastMessagePreview`
(este último derivado da mensagem mais recente, nunca persistido).
Geração de título por segunda completion fica para uma fase futura, só
com necessidade real confirmada.

Não existe `DELETE /ai/conversations/:id` nesta fase — eliminação
envolve decisões ainda por tomar (soft delete, auditoria, retenção,
cascade, recuperação) que pertencem a uma fase posterior, não a esta
foundation. As operações desta fase são exclusivamente: criar conversa
(implícito no primeiro `POST /ai/chat` sem `conversationId`), listar,
obter detalhe, enviar mensagem.

### Fronteira de isolamento — nunca o modelo

Todo o isolamento multi-tenant acontece nas queries Prisma, antes de
qualquer dado ser construído para o provider — `organizationId`/`userId`
vêm sempre de `CurrentUser()` (identidade autenticada), nunca do corpo,
query ou path do pedido. O `system prompt` (`AiTenantContextService`)
declara explicitamente que o modelo não é fronteira de autorização, mas
essa declaração é reforço, não o mecanismo de segurança real — mesmo que
o modelo ignorasse a instrução, nunca teria acesso a dados de outra
organização, porque nunca lhos foi enviado.

### Registo do provider — dentro de `AiModule`, sem módulo próprio

`AiCompletionProvider` fica atrás do token `AI_COMPLETION_PROVIDER`,
registado dentro de `ai.module.ts` (não um `ai-provider.module.ts`
separado). Mesma justificação que `UploadsModule`/`OBJECT_STORAGE`:
único consumidor real hoje (`AiChatService`), sem ciclo de vida a fechar
no shutdown — `OllamaAiProvider` usa `fetch` por pedido, sem ligação
persistente, ao contrário de `QueueProducer` (que por isso vive no seu
próprio `QueueModule` com `OnModuleDestroy`). Controllers/services só
conhecem o tipo `AiCompletionProvider`; nenhum ficheiro fora de
`ai.module.ts` importa `createAiProvider`/`loadAiConfig`/`OllamaAiProvider`
diretamente — trocar o provider (streaming, outro modelo, um segundo
provider cloud) não obriga a tocar em `AiChatService`/`AiController`.

### Estratégia de contexto — reutilização direta de `DashboardService`, como mecanismo arquitetural

`AiTenantContextService.buildSystemMessage(organizationId)` chama
`DashboardService.getFinancialSummary(organizationId, {})` diretamente
(injeção normal, mesmo processo — nunca um pedido HTTP interno) e
formata um resumo textual compacto para a mensagem `system`. Este reuso
existe como demonstração do mecanismo de contexto por tenant que a
arquitetura precisa de suportar — não como o início de um produto de
"assistente financeiro"; um consumidor de contexto futuro e diferente
(ex. um resumo operacional, não financeiro) reutilizaria a mesma forma
(`AiTenantContextService` → serviço de domínio já existente → texto para
o `system prompt`), sem alterar `AiChatService`/`AiController`/o
contrato do chat.

Alternativas consideradas: (1) pedido HTTP interno a
`/dashboard/financial-summary` — explicitamente fora do âmbito, e um
round-trip desnecessário dentro do mesmo processo; (2) duplicar as
queries de agregação num novo serviço — rejeitada por duplicação sem
necessidade real. A opção escolhida (chamada direta ao serviço já
existente) é a única das três sem duplicação nem I/O evitável.

**Trade-off assumido**: o contexto usa sempre o período por omissão do
dashboard (mês atual, UTC) — nunca um período pedido pelo utilizador
dentro do chat. Uma pergunta sobre um mês anterior fica sem dados; o
`system prompt` instrui o modelo a admitir isso explicitamente em vez de
inventar um valor (confirmado real, ver "Validação manual", abaixo).

### Contexto reconstruído em cada pedido, nunca cacheado

`buildSystemMessage()` corre do zero em cada `POST /ai/chat` — nenhum
resumo é persistido nem reutilizado entre pedidos. Garante que o
contexto reflete sempre o estado mais recente e que uma alteração de
organização/permissões nunca deixa dados desatualizados visíveis a um
utilizador.

### Histórico — últimas N mensagens, ordem cronológica garantida

A mensagem `USER` do pedido atual é persistida antes de qualquer chamada
ao provider; o histórico enviado (`AI_CHAT_HISTORY_LIMIT`, omissão 20)
é depois carregado com essa mensagem já incluída como a mais recente —
não há duplicação manual da mensagem atual no pedido ao provider.
Carregado da base de dados em ordem descendente (`orderBy: { createdAt:
'desc' }, take: N`, eficiente pelo índice
`AiMessage_conversationId_createdAt_idx`) e invertido em memória para
ordem cronológica ascendente antes de `provider.complete()` — exigido
explicitamente, confirmado por teste dedicado. Sem resumo automático,
sem memória de longo prazo, sem cálculo próprio de tokens — os únicos
limites são `AI_CHAT_HISTORY_LIMIT` (mensagens) e
`AI_CHAT_MAX_MESSAGE_LENGTH` (caracteres por mensagem).

### Falhas do provider — mensagem do utilizador preservada, nunca uma resposta falsa

Sequência: validar conversa/autorização → persistir `USER` → construir
contexto → chamar o provider → só depois persistir `ASSISTANT`. Uma
falha do provider nunca apaga a mensagem `USER` já persistida (commit
independente, antes da chamada de rede) e nunca cria uma mensagem
`ASSISTANT` falsa. `AiProviderError.code` mapeado para HTTP sanitizado,
nunca a mensagem bruta do Ollama nem o nome do modelo:

| `code` | HTTP | Razão |
|---|---|---|
| `timeout` | 504 `GatewayTimeoutException` | Provider não respondeu a tempo |
| `provider_unavailable` | 503 `ServiceUnavailableException` | Servidor de IA inacessível |
| `model_not_found` | 503 `ServiceUnavailableException` | Erro de configuração do servidor, não do pedido do cliente |
| `invalid_response` | 502 `BadGatewayException` | Resposta do provider não utilizável |
| `unknown` | 502 `BadGatewayException` | Classificação residual, mesmo tratamento de `invalid_response` |

Confirmado real contra um servidor Ollama local com um modelo
inexistente: HTTP `503`, mensagem fixa em pt-PT, mensagem `USER`
persistida, nenhuma `ASSISTANT` criada (ver "Validação manual", abaixo).

### Frontend — vertical slice completo, sem componente novo no Design System

`/ai/chat` (`apps/frontrest/web/app/(dashboard)/ai/chat/`): lista de
conversas + thread ativa, lado a lado (`grid`, coluna única em ecrãs
pequenos). `ConversationList`/`ChatThread` são componentes locais da
página (não movidos para `@frontcore/ui`) — sem segundo consumidor real
hoje. Reutiliza `Card`/`Alert`/`Button`/`Textarea`/`Spinner`/`PageHeader`/
`Typography` já existentes; `Textarea` (existia desde a Fase 3.4, nunca
usado até agora) é o primeiro consumidor real. Enter envia (Shift+Enter
para nova linha), sem quebrar a navegação por teclado do `textarea`.
Aviso fixo, visível em todas as conversas, de que a resposta pode
necessitar de confirmação humana — nunca escondido atrás de um estado
condicional. Sem ação de eliminar na lista de conversas, consistente com
a ausência do endpoint.

## Contrato final

```http
POST   /ai/chat                    { conversationId?: string; message: string }
GET    /ai/conversations           ?page&pageSize → Paginated<ConversationSummary>
GET    /ai/conversations/:id       → ConversationDetail
```

```ts
interface ChatMessage { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string; }
interface ConversationSummary { id: string; createdAt: string; updatedAt: string; lastMessagePreview: string | null; }
interface ConversationDetail extends ConversationSummary { messages: ChatMessage[]; }
interface SendChatMessageResult { conversationId: string; message: ChatMessage; }
```

`lastMessagePreview` (últimos ~120 caracteres da mensagem mais recente,
derivado em cada resposta, nunca persistido) é a única informação que a
lista mostra sobre o conteúdo de uma conversa — sem `title`. Sem
`@Roles` em nenhuma rota — mesmo alcance de `GET /invoices`/`GET
/dashboard/financial-summary`.

## Modelos Prisma

```prisma
enum AiMessageRole {
  USER
  ASSISTANT
}

model AiConversation {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages     AiMessage[]

  @@index([organizationId, userId, updatedAt])
}

model AiMessage {
  id             String        @id @default(cuid())
  conversationId String
  role           AiMessageRole
  content        String
  provider       String?
  model          String?
  inputTokens    Int?
  outputTokens   Int?
  createdAt      DateTime      @default(now())

  conversation AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

`onDelete: Cascade` em todas as FKs (eliminar uma conversa por via da
organização/utilizador elimina as mensagens; eliminar user/org segue o
mesmo padrão já usado em todo o schema — não há endpoint de eliminação
direta de conversa nesta fase, ver "Sem `title`, sem eliminação",
acima). Índice composto único em `AiConversation`
(`[organizationId, userId, updatedAt]`) em vez de dois separados — cobre
exatamente a query real de listagem (`findMany({ where: {
organizationId, userId }, orderBy: { updatedAt: 'desc' } })`).
`provider`/`model`/`inputTokens`/`outputTokens` só preenchidos em
mensagens `ASSISTANT` — confirmado por teste unitário e por inspeção
direta da base de dados real (ver "Validação manual"). Mensagens
`system` (construídas em cada pedido a partir de
`AiTenantContextService`) nunca são persistidas.

## Migrations

```
packages/database/prisma/migrations/20260716142607_add_ai_chat/
packages/database/prisma/migrations/20260716150000_remove_ai_conversation_title/
```

A primeira cria `AiConversation`/`AiMessage`/`AiMessageRole`; a segunda
remove `AiConversation.title` (decisão tomada ainda dentro desta mesma
fase, antes de qualquer publicação — mantida como uma migration
incremental própria, `ALTER TABLE ... DROP COLUMN`, em vez de reescrever
a primeira, pela mesma disciplina que se aplicaria a uma migration já
publicada). Ambas geradas/aplicadas contra PostgreSQL real (Docker,
`frontcore-postgres`), confirmadas com `prisma migrate status`
(`Database schema is up to date!`).

## Ficheiros criados

```
apps/frontrest/api/src/ai/ai.module.ts
apps/frontrest/api/src/ai/ai.controller.ts
apps/frontrest/api/src/ai/ai-chat.service.ts
apps/frontrest/api/src/ai/ai-tenant-context.service.ts
apps/frontrest/api/src/ai/ai-chat.config.ts
apps/frontrest/api/src/ai/ai-completion-provider.token.ts
apps/frontrest/api/src/ai/dto/send-chat-message.dto.ts
apps/frontrest/api/src/ai/dto/list-conversations.dto.ts
apps/frontrest/api/src/ai/ai-chat.service.spec.ts
apps/frontrest/api/src/ai/ai-tenant-context.service.spec.ts
apps/frontrest/api/test/ai-chat.e2e-spec.ts

apps/frontrest/web/lib/ai-chat.ts
apps/frontrest/web/app/(dashboard)/ai/chat/page.tsx
apps/frontrest/web/app/(dashboard)/ai/chat/conversation-list.tsx
apps/frontrest/web/app/(dashboard)/ai/chat/chat-thread.tsx
apps/frontrest/web/app/(dashboard)/ai/chat/ai-chat.test.tsx

docs/phases/phase-8-ai-chat-foundation.md
```

## Ficheiros alterados

```
packages/database/prisma/schema.prisma            — AiConversation, AiMessage, AiMessageRole, relações inversas
packages/database/prisma/migrations/20260716142607_add_ai_chat/
packages/database/prisma/migrations/20260716150000_remove_ai_conversation_title/

apps/frontrest/api/src/app.module.ts               — regista AiModule
apps/frontrest/api/src/dashboard/dashboard.module.ts — exporta DashboardService (reuso pelo chat)
apps/frontrest/api/package.json                    — dependência @frontcore/ai
apps/frontrest/api/test/utils/mock-prisma.ts        — + aiConversation/aiMessage (aditivo)
apps/frontrest/api/test/setup-env.ts                — AI_PROVIDER=mock explícito para e2e

apps/frontrest/web/lib/nav-config.ts                — item "Assistente IA" (/ai/chat)

docker-compose.yml                                  — variáveis AI_*/AI_CHAT_* no serviço api (omissos → mock, sem custo)
.env.example                                        — AI_CHAT_HISTORY_LIMIT/AI_CHAT_MAX_MESSAGE_LENGTH
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`packages/ai` **não foi alterado** — o contrato de Fase 6.11
(`AiCompletionProvider`/`AiConfig`/`AiMessage`/`loadAiConfig`/
`createAiProvider`) foi suficiente sem nenhuma mudança; nenhum bloqueio
real que justificasse streaming/tools/RAG foi encontrado.

## Testes adicionados

- **Backend, `ai-tenant-context.service.spec.ts`** (6 testes): chama
  `DashboardService.getFinancialSummary` com a organização autenticada e
  período omisso; mensagem `system` inclui as regras obrigatórias
  (só responder com os dados, admitir insuficiência, nunca inventar,
  nunca escrever); período sem faturas produz nota explícita; inclui
  totais/estado/tendência/categoria/fornecedores quando existem dados;
  nunca inclui dados de outra organização.
- **Backend, `ai-chat.service.spec.ts`** (23 testes): criação/continuação
  de conversa; conversa de outro tenant/utilizador tratada como
  inexistente; ordem USER→provider→ASSISTANT; provider/model/usage
  persistidos quando disponíveis; mensagens USER nunca têm
  provider/model/usage; histórico carregado com o limite configurado e
  reordenado cronologicamente antes do provider; contexto construído só
  com a organização autenticada; validação de mensagem vazia/acima do
  limite (sem chamar o provider); os 5 códigos de erro do provider
  mapeados para o HTTP sanitizado correto, mensagem USER preservada,
  nenhuma transação de ASSISTANT executada; isolamento por organização e
  por utilizador em `listConversations`/`getConversation`.
- **Backend e2e, `ai-chat.e2e-spec.ts`** (15 testes, store em memória que
  filtra genuinamente por `organizationId`/`userId` — não mocks
  superficiais): 401 sem token; MEMBER consegue usar o chat; criação e
  continuação (histórico cresce); listagem e detalhe; conversa
  inexistente → 404; **organização A não lê nem continua conversas da
  organização B**; **alterar manualmente o `conversationId` não
  contorna o isolamento**; **utilizador A não lê nem continua conversas
  do utilizador B da mesma organização**; listagem do utilizador B nunca
  inclui conversas do utilizador A; corpo inválido/mensagem vazia → 400;
  resposta nunca expõe `organizationId` em bruto.
- **Frontend, `ai-chat.test.tsx`** (8 testes): loading inicial; estado
  vazio (sem conversas); listagem e troca entre conversas; envio numa
  conversa nova com resposta do assistente visível; erro de envio
  mostrado; envio vazio bloqueado (botão desabilitado, sem chamar a
  API); conversa inacessível (404) nunca mostra conteúdo de outra
  conversa; campo de texto e botão desabilitados durante o pedido em
  curso.

## Resultados dos testes

- `pnpm typecheck` — 24/24.
- `pnpm build` — 14/14; rota `/ai/chat` gerada (2.53 kB).
- `pnpm test` (raiz) — 18/18 tarefas: `@frontrest/api` 434/434 (411
  pré-existentes + 23 novos), `@frontrest/web` 40/40 (32 pré-existentes +
  8 novos), `@frontrest/workers` 27/27 (inalterado).
- `pnpm --filter @frontrest/api test:e2e` — 107/107 (92 pré-existentes +
  15 novos).

## Validação manual (Docker + dados reais)

Stack completa reconstruída (`docker compose build api web && docker
compose up -d`); migrations confirmadas via `prisma migrate status`
(`Database schema is up to date!`) contra o mesmo PostgreSQL do Docker.
Token assinado dentro do container (`JWT_ACCESS_SECRET` nunca impresso —
só o token resultante), para a organização real "ivoaovivo"
(5 faturas: 2 PENDING/1 PAID/2 OVERDUE, `totalAmount` real 450.00 EUR).

**Com `AI_PROVIDER=mock`** (omissão): conversa criada, mensagens
persistidas em ordem correta (`USER`→`ASSISTANT`→`USER`→`ASSISTANT`),
`provider`/`model` = `mock`/`mock-echo-1` só nas mensagens `ASSISTANT`
(confirmado por `SELECT` direto à base de dados), `updatedAt` da
conversa atualizado a cada mensagem, listagem devolve
`lastMessagePreview` correto, sem `title` em nenhuma resposta. Isolamento:
pedido com token de outra organização real ("Isolation Test Org") a uma
conversa de "ivoaovivo" → `404`. Mensagem vazia → `400`. `DELETE
/ai/conversations/:id` confirmado como rota inexistente (`404`) após os
ajustes desta fase, com um utilizador de teste real registado via
`POST /auth/register`.

**Com `AI_PROVIDER=ollama`, `AI_MODEL=qwen2.5:3b`** (servidor Ollama
local real, `host.docker.internal:11434`): pergunta "Quantas faturas
ativas tenho este mês e qual é o total?" → resposta real do modelo
**"5 faturas ativas, total de 450.00 EUR."** — confirmado
byte-a-byte contra `GET /dashboard/financial-summary` da mesma
organização (`activeInvoiceCount: 5`, `totalAmount: "450.00"`): o
modelo raciocinou corretamente sobre dados reais injetados no contexto,
sem inventar nenhum valor. Pergunta fora do período disponível ("Quanto
gastei em 2019?") → **"Não há dados financeiros para o ano de 2019."**
— confirma a regra anti-invenção do `system prompt` com um modelo real,
não só nos testes automatizados. `AI_MODEL` inexistente → `503`
sanitizado (`"O assistente de IA não está configurado corretamente.
Contacta o suporte."`), mensagem `USER` "Olá" preservada na base de
dados, nenhuma `ASSISTANT` falsa criada (confirmado por `SELECT`
direto). Container restaurado a `AI_PROVIDER=mock` no final — nenhuma
dependência de Ollama fica ativa por omissão.

`docker-compose.yml` não passava nenhuma variável `AI_*`/`AI_CHAT_*` ao
serviço `api` antes desta fase (`packages/ai` não tinha consumidor
real) — corrigido nesta fase (ver "Ficheiros alterados"), com omissão
segura (`mock`) para não introduzir uma dependência nova por omissão.
No processo, corrigida também uma inconsistência pré-existente no `.env`
local (não versionado — `.gitignore`) que ainda tinha
`AI_PROVIDER=anthropic`/`ANTHROPIC_API_KEY` de antes da Fase 6.11 —
inofensiva até agora (nunca chegava ao container), passaria a quebrar o
arranque assim que `docker-compose.yml` a reencaminhasse.

## Limitações conhecidas

- Confirmação visual no browser não foi tecnicamente possível neste
  ambiente (sem ferramenta de automação de browser instalada) —
  substituída pela validação mais forte disponível: chamadas HTTP reais
  contra Docker+Postgres+Ollama reais, com um utilizador de teste real
  registado via `POST /auth/register`, mais a suite de testes
  automatizados do frontend. Recomenda-se uma confirmação visual manual
  antes de dar esta fase por definitivamente fechada.
- O contexto do chat usa sempre o mês atual (mesma omissão do
  dashboard) — sem seletor de período dentro do chat nesta fase.
- Sem eliminação de conversa nesta fase — decisão explícita (ver "Sem
  `title`, sem eliminação"), não uma omissão a corrigir na próxima
  iteração desta mesma fase.

## Fora do âmbito (confirmado, não implementado)

Providers cloud (OpenAI/Anthropic/Azure OpenAI/OpenRouter), streaming,
WebSockets/SSE, tools/function calling, agentes autónomos, RAG,
embeddings, vector database, pesquisa semântica, escrita sobre
faturas/fornecedores/categorias, SQL gerado pelo modelo, inclusão
automática de `ocrText`, upload dentro do chat, voz, partilha de
conversas, edição manual de mensagens, título de conversa, eliminação
de conversa, resumo automático de conversas, geração de título por
segunda completion, quotas/billing/analytics de tokens, exportação
PDF/CSV, alterações ao pipeline Upload→Draft→OCR→Parsing→Review→Promote,
package novo em `packages/*`.

## Critérios de conclusão

- [x] Modelos e migrations Prisma criados e aplicados (real, Docker).
- [x] Conversas isoladas por `organizationId` e `userId`.
- [x] `AiModule` registado em `AppModule`.
- [x] Primeiro consumidor real de `AiCompletionProvider`.
- [x] Provider concreto escondido atrás de injeção (`AI_COMPLETION_PROVIDER`).
- [x] `POST /ai/chat` funcional (mock e Ollama real).
- [x] Histórico recuperável (`GET /ai/conversations`, `GET /ai/conversations/:id`).
- [x] Contexto exclusivamente do tenant autenticado, como mecanismo arquitetural (sem expandir o âmbito funcional).
- [x] Contexto reconstruído em cada pedido.
- [x] Histórico limitado (`AI_CHAT_HISTORY_LIMIT`).
- [x] Erros do provider sanitizados (5 códigos mapeados, validado real).
- [x] Sem escrita sobre o domínio financeiro.
- [x] Sem `title`, sem `DELETE /ai/conversations/:id` — fora do âmbito desta foundation.
- [x] Testes unitários e e2e de isolamento passam (23+15, isolamento real, não só mocks).
- [x] Mock provider usado para testes determinísticos.
- [x] Ollama validado contra servidor real (respostas corretas sobre dados reais).
- [x] Frontend validado — automatizado (8/8); visual manual pendente (limitação de ambiente).
- [x] Sem streaming, tools, RAG, provider cloud ou package novo.
- [x] `pnpm typecheck` limpo (24/24).
- [x] `pnpm build` limpo (14/14).
- [x] `pnpm test` limpo (18/18 tarefas, 434+40+27).
- [x] `pnpm --filter @frontrest/api test:e2e` limpo (107/107).
- [x] Migrations e Docker validados contra PostgreSQL real.
- [x] Comportamento manual validado (mock + Ollama real).
- [x] Comportamento fora do âmbito inalterado (411 testes pré-existentes da API continuam a passar).
- [x] Nome oficial da fase mantido — "Fase 8 — AI Chat Foundation" (`docs/PHASES.md`).

## Trabalho futuro

Eliminação de conversa (soft delete, auditoria, retenção, cascade,
recuperação — decisões próprias de uma fase dedicada); seletor de
período dentro do chat (reutilizando `resolvePeriod()`, Fase 7); título
de conversa, gerado por segunda completion barata; Token Refresh (já
identificado como prioridade Alta na Fase 6.12); Regression Test Suite
para o chat, se crescer em complexidade equivalente ao parsing fiscal;
segundo provider cloud sobre o mesmo `AiCompletionProvider`, streaming,
só com necessidade real confirmada.

## Próxima fase

Por decidir — candidatos naturais: Fase 9 (Relatórios: mensal, export
PDF/CSV, comparação, `docs/PHASES.md`); confirmação visual manual desta
fase e da Fase 5.4/6.8, ainda pendentes.
