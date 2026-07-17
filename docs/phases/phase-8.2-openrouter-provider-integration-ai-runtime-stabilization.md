# Fase 8.2 — OpenRouter Provider Integration & AI Runtime Stabilization

## Objetivo

Primeiro provider cloud real (OpenRouter) sobre a arquitetura
provider-agnostic já existente de `@frontcore/ai` (Fase 6.11), e
estabilização mínima do runtime (retries, taxonomia de erro completa,
logging) para as fases seguintes reutilizarem um runtime sólido — sem
alargar o âmbito funcional do Chat IA.

## Âmbito

`OpenRouterAiProvider` (API OpenAI-compatible); `AiErrorCode` estendido
com `authentication`/`rate_limit` (reais desde que existe um provider
com credencial e limites de taxa); retry genérico (`withRetries()`,
aplicado pela `createAiProvider()` a providers reais, nunca a `mock`);
`Logger.error()` no único ponto de `AiChatService` que já sanitiza
erros do provider. Sem RAG, embeddings, agentes, tools, streaming
complexo — confirmado não implementado (ver "Fora do âmbito").

## Estado inicial

`@frontcore/ai` (Fase 6.11): `AiCompletionProvider`, `AiConfig` união
discriminada por `AiProviderName = 'mock' | 'ollama'`, `loadAiConfig()`,
`createAiProvider()` (switch, mesmo padrão de `createOcrProvider()`).
`MockAiProvider` sem I/O; `OllamaAiProvider` sobre `fetch` nativo,
`AbortController` para timeout, sem retries, sem streaming.
`AiProviderError` com 5 códigos (sem `authentication`/`rate_limit` —
nenhum provider tinha credencial nem limite de taxa reais). Zero
dependências além de `@frontcore/config`. Único consumidor real:
`apps/frontrest/api/src/ai/ai.module.ts` (token `AI_COMPLETION_PROVIDER`).
`AiChatService.mapProviderError()` sanitizava mas nunca registava o
erro real do provider — `InvoiceDraftsService` já usava esse padrão
(`Logger` do NestJS) para falhas técnicas equivalentes, sem
`AiChatService` o seguir. `docs/PHASES.md` não tinha nenhuma entrada
"Fase 8.2" — o único registo anterior era uma proposta de *tool
calling* em "Trabalho futuro" da Fase 9, nunca implementada nem
formalmente aprovada; este pedido substitui-a explicitamente.

## Arquitetura implementada

### `OpenRouterAiProvider` — API OpenAI-compatible, sem SDK

`packages/ai/src/providers/openrouter/openrouter-ai-provider.ts` — API
pública do OpenRouter (`POST {baseUrl}/chat/completions`, endpoint
`https://openrouter.ai/api/v1` por omissão), `fetch` nativo (mesma
disciplina do `OllamaAiProvider` — sem SDK, sem dependência nova).
`model` usa a convenção `"<fabricante>/<modelo>"` do OpenRouter (ex.
`openai/gpt-4o-mini`) — string de configuração, nunca uma nova
abstração de seleção de modelo. `Authorization: Bearer ${apiKey}`;
`stream: false` sempre; `max_tokens` (nome de campo OpenAI-compatible,
diferente do `options.num_predict` do Ollama). `usage.prompt_tokens`/
`completion_tokens` mapeados para `AiCompletionUsage`. Adicionar este
provider **não exigiu nenhuma alteração** a `AiCompletionProvider`,
`AiChatService` ou `AiController` — confirma que a arquitetura
provider-agnostic desde a Fase 6.11 cumpre a promessa da Fase 8.2.

### `AiConfig`/`loadAiConfig()` — terceiro provider, mesma disciplina

`AiProviderName` ganha `'openrouter'`; `OpenRouterAiConfig` (`apiKey`,
`model`, `baseUrl`) exige `AI_MODEL`+`OPENROUTER_API_KEY` (sem default
permanente, mesma razão do `model` do Ollama — falhar cedo em vez de um
acoplamento silencioso), com `AI_BASE_URL` a assumir o endpoint público
quando omisso. `mock`/`ollama` nunca leem `OPENROUTER_API_KEY`
(confirmado por teste).

### `AiErrorCode` — `authentication`/`rate_limit`, agora reais

Os 5 códigos da Fase 6.11 mantidos; `authentication` (401/403/**402**)
e `rate_limit` (429) acrescentados — só fazem sentido com um provider
que tem credencial e limite de taxa, nenhum dos dois existia antes
deste provider. **402 (saldo insuficiente) confirmado real** contra o
serviço OpenRouter durante a validação manual desta fase (ver
"Validação manual") — classificado como `authentication` (mesma
categoria operacional de "conta mal configurada, contacta o suporte",
nunca retryable), não um código novo — descoberto e corrigido durante a
implementação, com teste de regressão adicionado.

### `withRetries()` — decorator interno, nunca exportado

`packages/ai/src/providers/with-retries.ts` — reintenta só códigos
transitórios (`timeout`/`provider_unavailable`/`rate_limit`), backoff
exponencial (`retryBackoffMs * 2^tentativa`), nunca
`authentication`/`model_not_found`/`invalid_response`/`unknown`
(reintentar não mudaria o resultado). Aplicado por `createAiProvider()`
a `ollama`/`openrouter`, nunca a `mock` (nunca falha).
`retryAttempts=0` (omissão) devolve o provider original sem qualquer
wrapper — comportamento anterior à Fase 8.2 inalterado por omissão.
Um único ponto de aplicação (a factory), não duplicado por provider —
qualquer provider futuro (OpenAI, Anthropic, ...) ganha retries sem
nenhuma alteração própria.

**Alternativas consideradas e rejeitadas** (YAGNI, `docs/ai/AI_BASE_PROMPT.md`
secção 5):
- **Provider Registry (Map dinâmico)** em vez do `switch` de
  `createAiProvider()` — com 3 providers reais, um `switch` (mesmo
  padrão de `createOcrProvider()`) não tem problema de manutenção que
  uma tabela dinâmica resolva; um registry sugeriria plugins em
  runtime, não pedido aqui.
- **Sistema de negociação de capacidades** — rejeitado; zero
  consumidor real diferencia comportamento por capacidade hoje. A
  união discriminada `AiConfig` já é a forma de "capability detection"
  com consumidor real (o `switch` da factory).
- **Retry dentro de cada provider concreto** — rejeitado; duplicaria a
  lógica entre `OllamaAiProvider`/`OpenRouterAiProvider`.
- **Logging dentro de `packages/ai`** — rejeitado; exigiria uma
  dependência de logging (NestJS `Logger` ou `console`) num package
  deliberadamente agnóstico de framework. O consumidor
  (`apps/frontrest/api`) já tem o padrão certo (`InvoiceDraftsService`)
  — só faltava `AiChatService` o seguir.

### Logging — um único ponto, mesmo padrão já usado no monorepo

`AiChatService.mapProviderError()` regista agora `Logger.error()`
(NestJS, `apps/frontrest/api`) com o `code`/`message` reais do provider
(e `error.cause.stack` quando existe) **antes** de devolver a exceção
HTTP sanitizada — mesmo padrão de `InvoiceDraftsService`. O detalhe
real nunca chega ao cliente; só ao log do servidor.

## Ficheiros criados

```
packages/ai/src/providers/openrouter/openrouter-ai-provider.ts (+ .test.ts)
packages/ai/src/providers/openrouter/index.ts
packages/ai/src/providers/with-retries.ts (+ .test.ts)
docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md
```

## Ficheiros alterados

```
packages/ai/src/contracts/ai-config.ts        — 'openrouter', OpenRouterAiConfig, retryAttempts/retryBackoffMs
packages/ai/src/config/ai-config.ts            — loadAiConfig() estendido (+ .test.ts)
packages/ai/src/providers/create-ai-provider.ts — case 'openrouter' + withRetries() (+ .test.ts)
packages/ai/src/providers/index.ts              — exporta OpenRouterAiProvider
packages/ai/src/providers/ollama/ollama-ai-provider.test.ts — config de teste com retryAttempts/retryBackoffMs
packages/ai/src/errors/ai-provider-error.ts     — AiErrorCode + authentication/rate_limit
apps/frontrest/api/src/ai/ai-chat.service.ts    — Logger.error(), 2 novos casos no mapeamento (+ .spec.ts)
docker-compose.yml                              — AI_RETRY_ATTEMPTS/AI_RETRY_BACKOFF_MS/OPENROUTER_API_KEY
.env.example                                    — idem, documentado
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

`AiCompletionProvider`, `AiController`, DTOs do chat, schema Prisma —
confirmados inalterados. Nenhum package novo, nenhuma migration,
nenhuma dependência externa nova, nenhuma alteração ao frontend.

## Testes

- `openrouter-ai-provider.test.ts` (22 testes, Vitest, `fetch` mockado):
  endpoint/método/`stream:false`/`max_tokens`; API key só no cabeçalho
  `Authorization`, nunca no corpo; overrides de modelo/limite;
  normalização de `content`/`usage`; JSON inválido/corpo vazio →
  `invalid_response`; 401/403/**402** → `authentication`; 429 →
  `rate_limit`; 404 → `model_not_found`; 5xx/falha de rede →
  `provider_unavailable`; timeout real via `AbortController`;
  normalização de `baseUrl` com barra(s) finais.
- `with-retries.test.ts` (14 testes): `retryAttempts=0` devolve o
  provider original; sucesso sem retry; erro transitório reintenta e
  sucede; os 3 códigos retryable testados individualmente; os 4 códigos
  não-retryable nunca reintentam; esgotamento lança o último erro real;
  erro não-`AiProviderError` nunca reintenta; backoff exponencial
  medido com temporizadores falsos; nome do provider preservado.
- `ai-config.test.ts` (22 testes, 13 novos): `openrouter` sem
  `AI_MODEL`/sem `OPENROUTER_API_KEY` → `AiConfigurationError`;
  configuração completa correta; `AI_BASE_URL` sobrepõe o endpoint
  público; `ollama` nunca lê `OPENROUTER_API_KEY`;
  `AI_RETRY_ATTEMPTS`/`AI_RETRY_BACKOFF_MS` (omissos, `0` explícito,
  overrides válidos, valores inválidos).
- `create-ai-provider.test.ts` (9 testes, 5 novos): seleção de
  `OpenRouterAiProvider`; `mock` nunca envolvido em `withRetries`;
  `retryAttempts=0` devolve a instância original (não um wrapper);
  `ollama`/`openrouter` com `retryAttempts>0` reintentam
  transparentemente e continuam a lançar `AiProviderError` sanitizada
  quando esgotam as tentativas.
- `ai-chat.service.spec.ts` (20 testes, 2 novos): `authentication` →
  503; `rate_limit` → 429 (`HttpStatus.TOO_MANY_REQUESTS`); os 18
  testes pré-existentes da Fase 8/8.1 continuam a passar sem alteração
  de comportamento.

## Validações executadas

| Comando | Resultado |
|---|---|
| `@frontcore/ai` — `typecheck`/`build`/`test` | limpo; 96/96 testes |
| `pnpm typecheck` | 24/24 |
| `pnpm build` | 14/14 |
| `pnpm test` | 18/18 tarefas — `@frontrest/api` 544/544 (542 pré-existentes + 2 novos), `@frontcore/ai` 96/96, `@frontrest/web` 57/57 (inalterado), `@frontrest/workers` 27/27 (inalterado) |
| `pnpm --filter @frontrest/api test:e2e` | 123/123 (inalterado — nenhum teste e2e novo, âmbito desta fase é `packages/ai`) |

## Validação manual (Docker + serviço OpenRouter real)

Imagem `frontcore-api` reconstruída (`docker compose build api`);
arranque confirmado sem erros com `AI_PROVIDER=openrouter` e
`OPENROUTER_API_KEY` real já presente no `.env` local do utilizador
(nunca impressa em nenhum resultado — só verificada como presente).
Ao contrário da Ollama (Fase 6.11), esta validação usa um serviço cloud
real de terceiros — autorização explícita do utilizador pedida e
obtida antes de qualquer pedido com custo real.

**Modelos gratuitos** (`google/gemma-4-26b-a4b-it:free`,
`meta-llama/llama-3.2-3b-instruct:free`, `qwen/qwen3-next-80b-a3b-instruct:free`):
- Um pedido devolveu HTTP 402 real (saldo insuficiente do provider
  upstream para o qual o OpenRouter encaminhou o pedido) — descoberto
  em produção da validação, corrigido no código (`authentication`) e
  coberto por teste de regressão, ver "Arquitetura implementada".
- Vários pedidos devolveram HTTP 429 real (congestionamento genuíno do
  nível gratuito, não um bug) — classificados corretamente como
  `rate_limit`, sanitizados para `429` no cliente.
- Com `AI_RETRY_ATTEMPTS=3`/`AI_RETRY_BACKOFF_MS=2000`, um pedido contra
  o modelo gratuito reintentou de facto 4 vezes (1 inicial + 3 retries,
  confirmado pela duração real do pedido, ~15,7s, consistente com
  backoff 2s+4s+8s) antes de esgotar as tentativas e devolver `429`
  sanitizado — confirma `withRetries()` a funcionar corretamente contra
  falhas reais, não só simuladas.

**Modelo pago** (`openai/gpt-4o-mini`, custo real mínimo, autorizado):
pergunta "Responde só com a palavra: confirmado." → resposta real do
modelo em 1,3s, respeitando corretamente as regras do assistente (não
respondeu com uma só palavra fora de contexto — manteve-se no papel de
assistente financeiro). Persistência confirmada por `SELECT` direto:
`role=ASSISTANT`, `provider=openrouter`, `model=openai/gpt-4o-mini`,
`inputTokens=447`, `outputTokens=40` — mapeamento de `usage` real
confirmado byte-a-byte; mensagem `USER` correspondente sem
`provider`/`model`/tokens, como desenhado.

Container restaurado ao fim da validação ao estado do `.env` local do
utilizador (que já usa `AI_PROVIDER=openrouter`/`AI_MODEL=google/gemini-2.5-flash`
como configuração real, não uma omissão de desenvolvimento) — nenhuma
alteração feita a esse ficheiro por esta fase.

## Limitações conhecidas

- Congestionamento do nível gratuito do OpenRouter observado
  diretamente durante a validação (múltiplos 429 reais) — característica
  do serviço de terceiros, não do código desta fase; o comportamento
  correto (classificação + sanitização + retry configurável) foi
  confirmado precisamente por causa dessa instabilidade real.
- `withRetries()` não distingue entre "vale a pena reintentar
  imediatamente" e "o provider está globalmente sobrecarregado" (ex.
  todos os utilizadores do nível gratuito) — um backoff maior ou um
  circuit breaker ficam fora do âmbito desta foundation, só com
  necessidade real confirmada.
- Sem métrica/telemetria persistida — `usage` (tokens) já é devolvido e
  persistido por mensagem `ASSISTANT` (Fase 8), suficiente para a
  fase; um pipeline de métricas agregadas fica para trabalho futuro,
  sem consumidor real hoje.
- Confirmação visual manual no browser não é aplicável a esta fase
  (sem alteração ao frontend).

## Fora do âmbito (confirmado, não implementado)

RAG, embeddings, agentes, tools/function calling, streaming complexo,
provider registry dinâmico, sistema de negociação de capacidades,
métricas/telemetria persistida, novo package, migration, dependência
externa, alteração ao frontend, alteração ao contrato de
`AiCompletionProvider`.

## Critérios de conclusão

- [x] `OpenRouterAiProvider` implementado sobre `AiCompletionProvider`, sem alterar o contrato.
- [x] `AiConfig`/`loadAiConfig()` suportam `openrouter` com a mesma disciplina de `ollama`.
- [x] `AiErrorCode` cobre `authentication`/`rate_limit`, confirmados reais.
- [x] Retry genérico (`withRetries()`), nunca aplicado a `mock`, omissão sem alteração de comportamento.
- [x] `AiChatService`/`AiController` inalterados exceto o log server-side.
- [x] Mock/Ollama continuam idênticos por omissão (`retryAttempts=0`).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos.
- [x] Validação manual real contra o OpenRouter (autorizada explicitamente pelo utilizador) — sucesso, 402 e 429 reais tratados corretamente.
- [x] Nenhum RAG/embeddings/agentes/tools/streaming/package novo/migration/dependência nova/alteração ao frontend.
- [x] Documentação coerente (`docs/PHASES.md`/`docs/INDEX.md`/`docs/ARCHITECTURE.md`/este documento).

## Próxima fase

Por decidir — candidatos naturais: um segundo provider cloud (Anthropic/
OpenAI direto/Azure OpenAI) sobre a mesma arquitetura, só com
necessidade real; tool calling sobre `AiCompletionProvider` (Fase 8.1,
"Observações para fases futuras"); confirmação visual manual das fases
com frontend ainda pendente (5.4/6.8/8/9).
