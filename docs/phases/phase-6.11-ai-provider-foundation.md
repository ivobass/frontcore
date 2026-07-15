# Fase 6.11 — AI Provider Foundation

## Objetivo

Transformar `@frontcore/ai` — até aqui um contrato de um único ficheiro,
zero consumidores, nunca implementado — num package genérico, testado e
operacional para completions de IA: contrato normalizado, configuração
via ambiente, seleção centralizada de provider, provider mock e um
provider real. Não implementa nenhum extractor fiscal de IA — prepara o
consumidor futuro, não o cria.

## Âmbito

Só `packages/ai`. Fora do âmbito, explicitamente: extractor fiscal de
IA, prompts de fatura, alteração a `FISCAL_EXTRACTORS`/
`FiscalParsingService`/`DocumentExtractor`/`runDocumentExtractors`,
integração no endpoint `/invoices/drafts/:id/fiscal-parsing`,
alterações ao frontend, ao OCR Worker, a filas, ao Prisma, a
`InvoiceDraft`, persistência de respostas de IA, fallback entre
providers, retries automáticos, streaming, embeddings, chat, RAG,
agentes, function calling, multimodal, gestão de chaves por
organização, billing, quotas, observabilidade avançada, gestão de
modelos/GPUs/deployment do Ollama pela aplicação.

## Estado anterior

`packages/ai/src/index.ts` — um único ficheiro: `AiProvider`,
`AiMessage`, `AiCompletionRequest`, `AiCompletionResponse`, `AiConfig`,
`AiCompletionProvider`. Sem `loadAiConfig()`, sem provider mock, sem
provider real, sem factory de seleção, sem taxonomia de erro, sem
testes. Zero consumidores reais.

## Revisão do primeiro provider — de OpenAI para Ollama

A primeira versão desta fase implementou OpenAI (Responses API) como
primeiro provider real. Revisto antes do commit: o primeiro provider
real do FrontCore passa a ser **Ollama** (execução local) — sem custo
por pedido, sem API key cloud, sem dependência obrigatória de internet,
maior privacidade dos documentos processados. A arquitetura genérica
já construída (`AiCompletionProvider`, `AiMessage`, `AiConfig`,
`AiConfigurationError`, `AiProviderError`, `MockAiProvider`,
`loadAiConfig()`, `createAiProvider()`, organização em `contracts/`/
`config/`/`errors/`/`providers/`, Vitest, testes sem chamadas
externas) foi preservada por inteiro — só o provider cloud (`OpenAiProvider`,
o pacote `openai`, `AI_API_KEY`) foi substituído por
`OllamaAiProvider`. OpenAI (e Anthropic/Azure OpenAI/OpenRouter) ficam
disponíveis para uma fase futura, sobre o mesmo contrato já
estabilizado — a decisão de qual foi o primeiro é operacional e
reversível, não estrutural (sem ADR nova).

## Decisão: API nativa do Ollama, não o endpoint OpenAI-compatible

Confirmado empiricamente contra um servidor Ollama real instalado
localmente (`ollama --version` → `0.31.1`, `ollama list` → modelos
`qwen3:4b`/`qwen2.5:3b`/`deepseek-coder:6.7b`/`codellama:latest`
disponíveis), não assumido a partir de documentação memorizada:

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen3:4b",
  "messages": [{"role":"user","content":"..."}],
  "stream": false
}'
```

devolve `{ model, message: { role, content }, done, prompt_eval_count,
eval_count, ... }` — o mesmo shape de `AiMessage[]` (`{role,content}`),
sem nenhuma tradução para o envelope de outro fornecedor; contagem de
tokens em campos planos (`prompt_eval_count`/`eval_count`), não um
objeto `usage` aninhado. O endpoint OpenAI-compatible
(`/v1/chat/completions`) obrigaria a montar um pedido no formato OpenAI
só para o Ollama o traduzir de volta ao nativo internamente — a
inversão de dependência que este package evita:

```text
contrato FrontCore independente
        ↓
provider adapta para Ollama (API nativa)
```

e não

```text
contrato FrontCore moldado à OpenAI
        ↓
Ollama tenta imitar OpenAI
```

## Decisão: `fetch` nativo, sem SDK

Confirmado: Node `v22.9.0` a correr, `engines.node` do projeto exige
`>=20` — `fetch`/`AbortController` globais confirmados disponíveis
(`node -e "console.log(typeof fetch, typeof AbortController)"` →
`function function`). Ollama expõe uma API HTTP simples; nenhuma
dependência nova foi adicionada a `packages/ai` — o package ficou, de
facto, com **menos** dependências do que a versão OpenAI (sem SDK
nenhum).

## Decisão: timeout e cancelamento via `AbortController`

`OllamaAiProvider` cria um `AbortController` por pedido, passa
`signal` ao `fetch`, e um `setTimeout` chama `controller.abort()` ao
fim de `AiConfig.timeoutMs` — aborta mesmo o pedido HTTP subjacente,
nunca um `Promise.race` que só deixaria de esperar. Sem retries
automáticos (`fetch` nativo nunca reintenta sozinho) e sem streaming
(`stream: false` sempre no corpo do pedido).

## Correção real: `maxOutputTokens` não tinha efeito

A validação manual da primeira versão desta fase revelou um erro
funcional: `AI_MAX_OUTPUT_TOKENS`/`request.maxOutputTokens` eram
calculados mas nunca enviados ao Ollama — a API de chat nativa não tem
nenhum campo de topo `max_tokens`/`max_output_tokens`; o limite só é
respeitado dentro de `options.num_predict`. Confirmado empiricamente
antes de corrigir (`curl .../api/chat` com `options: { num_predict: 10 }`
→ `eval_count: 10`, `done_reason: "length"`), não assumido. Corrigido:
`OllamaAiProvider` envia sempre `options: { num_predict:
request.maxOutputTokens ?? config.maxOutputTokens }`, um único campo,
sem duplicação nem nome alternativo.

**Semântica real observada, não um efeito deste código**: em modelos
com raciocínio interno (`message.thinking`, ex. `qwen3:4b`), um
`num_predict` baixo pode ser inteiramente consumido pela fase de
"thinking" antes de qualquer texto final — `message.content` fica
vazio e `complete()` lança `invalid_response`, corretamente (não há
resposta a devolver). Reproduzido na validação manual real (ver secção
própria, abaixo) e documentado como limitação conhecida — não uma
regressão desta correção.

## Correção real: JSON inválido/corpo vazio (HTTP 200)

`response.json()` lançava `SyntaxError` bruto para HTTP 200 com corpo
vazio, truncado ou não-JSON — nunca apanhado. Corrigido:
`parseOllamaResponseBody()` lê o corpo como texto e faz `JSON.parse()`
dentro de `try/catch`; qualquer falha vira
`AiProviderError('Resposta inválida do provider de IA.', 'invalid_response', { cause })`
— o corpo bruto nunca chega à mensagem pública, só a `cause`.

## Correção real: `AI_BASE_URL` com barra final

`http://localhost:11434/` produzia `http://localhost:11434//api/chat`
(barra dupla). Corrigido em `buildChatUrl()`
(`baseUrl.replace(/\/+$/, '')` antes de concatenar `/api/chat`) — testado
com uma e várias barras finais.

## Contrato público

```ts
type AiProviderName = 'mock' | 'ollama';

interface MockAiConfig { provider: 'mock'; timeoutMs: number; maxOutputTokens: number; }
interface OllamaAiConfig {
  provider: 'ollama';
  baseUrl: string;   // default local seguro — ver loadAiConfig()
  model: string;      // obrigatório — sem default permanente
  timeoutMs: number;
  maxOutputTokens: number;
}
type AiConfig = MockAiConfig | OllamaAiConfig;

interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string; }

interface AiCompletionRequest {
  messages: AiMessage[];
  model?: string;
  maxOutputTokens?: number;
}

interface AiCompletionUsage { inputTokens: number; outputTokens: number; }

interface AiCompletionResponse {
  content: string;
  provider: string;
  model: string;
  usage?: AiCompletionUsage;
}

interface AiCompletionProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}

function loadAiConfig(): AiConfig;
function createAiProvider(config: AiConfig): AiCompletionProvider;
```

Sem `apiKey` em nenhum ramo de `AiConfig` — nenhum provider implementado
hoje precisa de credencial (Ollama corre localmente, sem fronteira de
rede pública a autenticar). `OllamaAiConfig` como parte de uma união
discriminada (não campos opcionais em `AiConfig` genérico) torna
estruturalmente impossível construir uma configuração `ollama` sem
`model`/`baseUrl`.

## Erros — taxonomia revista para o provider real implementado

```ts
class AiConfigurationError extends Error {}

type AiErrorCode = 'timeout' | 'invalid_response' | 'provider_unavailable' | 'model_not_found' | 'unknown';
class AiProviderError extends Error {
  readonly code: AiErrorCode;
}
```

Removidos `authentication`/`rate_limit` — conceitos de fronteira cloud
que Ollama, local e sem API key, não tem; reintroduzir-se-iam quando um
provider cloud real os exigir, não antes. Adicionado `model_not_found`,
confirmado real contra o servidor local: um modelo não descarregado
devolve HTTP `404` com corpo `{"error":"model 'X' not found"}`.
Classificação em `OllamaAiProvider`:

| Situação | `code` | Confirmado |
|---|---|---|
| `fetch` rejeita por abort (timeout) | `timeout` | testado + validado com timers reais |
| `fetch` rejeita por falha de conexão | `provider_unavailable` | testado |
| HTTP 404 com "not found" no corpo | `model_not_found` | **validado contra o Ollama real** |
| HTTP ≥ 500 | `provider_unavailable` | testado |
| resposta sem `message.content` | `invalid_response` | testado |
| resto | `unknown` | testado |

`message` é sempre um texto fixo sanitizado — nunca o corpo bruto do
Ollama, nunca o nome do modelo pedido (confirmado: `err.message`
nunca contém o modelo, mesmo quando o corpo de erro real o inclui). A
causa técnica (incluindo o corpo HTTP) só existe em `cause`.

## Configuração

```text
AI_PROVIDER            omissão: "mock" — "mock" | "ollama"
AI_MODEL               obrigatório só quando AI_PROVIDER=ollama — sem default permanente
AI_BASE_URL             omissão: "http://localhost:11434"
AI_TIMEOUT_MS           omissão: 30000
AI_MAX_OUTPUT_TOKENS    omissão: 1024
```

Sem `AI_API_KEY` — não lida, não exigida, não existe em nenhum ramo de
`AiConfig`. `loadAiConfig()` segue a convenção `load<X>Config()`
(`docs/CODING_STANDARDS.md`).

## `OllamaAiProvider` — comportamento

`POST {baseUrl}/api/chat` (URL normalizado, sem barra dupla mesmo com
`AI_BASE_URL` terminado em `/`), corpo `{ model, messages, stream:
false, options: { num_predict } }` — `messages` é `AiMessage[]`
mapeado 1:1 para `{role, content}` (sem transformação, a API nativa já
aceita este shape); `num_predict` é `request.maxOutputTokens ??
config.maxOutputTokens`, o único campo que a API respeita para limitar
geração (confirmado real, ver "Correção real: `maxOutputTokens`",
acima). Modelo do pedido (`request.model`) sobrepõe o da configuração
quando presente. Resposta normalizada a partir de `message.content`
(nunca `message.thinking` — campo de raciocínio interno presente em
modelos como `qwen3`, nunca exposto como conteúdo); `usage` construído
a partir de `prompt_eval_count`/`eval_count` quando ambos presentes,
`undefined` caso contrário (nunca zeros inventados). Corpo da resposta
lido como texto e só depois `JSON.parse()` dentro de `try/catch` —
nunca deixa um `SyntaxError` bruto escapar para HTTP 200 com corpo
vazio/inválido. Nunca expõe a resposta bruta do Ollama nem conhece
faturas/OCR/`InvoiceDraft`/`FiscalField`.

## Factory

```ts
switch (config.provider) {
  case 'mock': return new MockAiProvider();
  case 'ollama': return new OllamaAiProvider(config);
  default: throw new AiConfigurationError(...); // defesa em profundidade, inalcançável a partir de loadAiConfig()
}
```

## API pública — nada de bruto exposto

`packages/ai/src/index.ts` exporta só `contracts/`, `config/`,
`providers/`, `errors/` — nunca a resposta HTTP bruta do Ollama, nunca
detalhes de transporte.

## Ficheiros criados

```
packages/ai/src/contracts/{ai-message,ai-completion-provider,ai-config}.ts (+index.ts)
packages/ai/src/config/ai-config.ts (+.test.ts, +index.ts)
packages/ai/src/errors/{ai-configuration-error,ai-provider-error}.ts (+.test.ts cada, +index.ts)
packages/ai/src/providers/mock/mock-ai-provider.ts (+.test.ts, +index.ts)
packages/ai/src/providers/ollama/ollama-ai-provider.ts (+.test.ts, +index.ts)
packages/ai/src/providers/create-ai-provider.ts (+.test.ts)
packages/ai/src/providers/index.ts
packages/ai/tsconfig.build.json
packages/ai/vitest.config.ts
docs/phases/phase-6.11-ai-provider-foundation.md
```

## Ficheiros removidos

```
packages/ai/src/providers/openai/  (pasta completa — provider, teste, barrel)
```

## Ficheiros alterados

```
packages/ai/src/index.ts                      — barrel + comentário (mock/Ollama/futuros)
packages/ai/src/contracts/{ai-config,ai-completion-provider}.ts — AiProviderName, OllamaAiConfig sem apiKey
packages/ai/src/config/ai-config.ts            — ollama em vez de openai, sem AI_API_KEY, default local de AI_BASE_URL
packages/ai/src/errors/ai-provider-error.ts    — AiErrorCode revisto (sem authentication/rate_limit, + model_not_found)
packages/ai/src/providers/{index,create-ai-provider}.ts — ollama em vez de openai
packages/ai/package.json                        — dependência "openai" removida (nenhuma dependência nova adicionada)
.env.example                                     — configuração Ollama (AI_MODEL=qwen3:4b, AI_BASE_URL=http://localhost:11434, sem AI_API_KEY)
pnpm-lock.yaml
docs/INDEX.md, docs/PHASES.md, docs/ARCHITECTURE.md
```

Nenhuma alteração a `docs/adr/0007-*.md` — a troca de provider é
operacional, dentro do contrato já estabilizado por essa ADR, não uma
decisão estrutural nova.

## Testes

**43 testes**, 6 ficheiros, todos em `packages/ai`:

- `ai-config.test.ts` (10) — omissão `mock`; `ollama` sem `AI_MODEL`;
  `ollama` com `AI_MODEL` usa `AI_BASE_URL` local por omissão;
  `AI_BASE_URL` sobreposto; provider desconhecido; timeout/max-tokens
  inválidos; confirma que `AI_API_KEY` nunca é lida nem exigida.
- `mock-ai-provider.test.ts` (4) — preservados sem alteração.
- `create-ai-provider.test.ts` (4) — `mock`/`ollama` devolvem a
  instância certa (Ollama sem nenhuma chamada de `fetch` no construtor);
  provider desconhecido lança `AiConfigurationError`; nenhuma
  referência funcional a OpenAI.
- `ollama-ai-provider.test.ts` (22, `global.fetch` mockado por inteiro
  via `vi.stubGlobal`) — endpoint/método/`stream:false`/`options.num_predict`
  corretos; `AiMessage[]` adaptado sem perdas; modelo e limite de
  output da configuração e overrides por pedido (secção dedicada:
  `options.num_predict` a partir de `AiConfig.maxOutputTokens`,
  sobreposto por `request.maxOutputTokens`, nunca duplicado num campo
  de topo alternativo); normalização de conteúdo/provider/model; usage
  a partir de `prompt_eval_count`/`eval_count`, `undefined` quando
  ausente; resposta sem conteúdo (`message` ausente e `content` vazio,
  dois casos distintos); **JSON inválido e corpo vazio em HTTP 200
  nunca deixam escapar `SyntaxError`** — sempre `invalid_response`
  sanitizado; **`AI_BASE_URL` com uma ou várias barras finais nunca
  produz barra dupla no endpoint**; classificação completa de erro (404
  "not found" real → `model_not_found`, 500 → `provider_unavailable`,
  falha de conexão → `provider_unavailable`, timeout real via
  `vi.useFakeTimers()` + `AbortController` → `timeout`, confirmando que
  o `signal` passado ao `fetch` fica `aborted: true`); mensagens de
  erro nunca expõem o corpo bruto nem o nome do modelo.
- `ai-configuration-error.test.ts`/`ai-provider-error.test.ts` (3) —
  preservados, um exemplo de `code` atualizado (`model_not_found`).

Nenhum teste faz uma chamada de rede real — `global.fetch` é sempre
mockado via `vi.stubGlobal('fetch', ...)`.

## Validação (comandos)

- `pnpm install` — remove `openai` do `pnpm-lock.yaml`.
- `pnpm --filter @frontcore/ai typecheck/build/test` — limpos, 43/43.
- `pnpm typecheck` (raiz) — 23/23. `pnpm build` — 14/14. `pnpm test` —
  17/17 tarefas.
- `git diff --check` — limpo.
- Grep de referências residuais a OpenAI (`OpenAI|OpenAiProvider|AI_API_KEY|responses.create|chat.completions`)
  em `packages/ai`/`.env.example`/`docs` — só comentários explícitos
  sobre trabalho futuro ("OpenAI, Anthropic, Azure OpenAI, OpenRouter,
  numa fase própria") e testes que confirmam a **rejeição** de
  `'openai'` como provider desconhecido; nenhum código funcional morto.

## Validação manual real (Ollama local)

Executada — `ollama list` confirmou modelos instalados antes de
validar. Chamadas reais através do `dist/` compilado (não só mocks),
repetidas depois das 3 correções desta revisão:

1. **Sucesso, sem limite ativo**: `AI_MODEL=qwen3:4b`, prompt neutro
   ("Responde apenas com a palavra OK, nada mais."/"Responde apenas com
   a palavra OK.") → `{ content: "OK", provider: "ollama", model:
   "qwen3:4b", usage: { inputTokens: 34, outputTokens: 110 } }`.
   Endpoint testado: `POST http://localhost:11434/api/chat`.
2. **Modelo inexistente**: `AI_MODEL=modelo-inexistente-de-teste:1b` →
   `AiProviderError { code: 'model_not_found', message: 'Modelo de IA
   não encontrado no provider local.' }` — mensagem nunca contém o nome
   do modelo pedido.
3. **Limite de output — corpo efetivamente enviado (correção do bug
   original)**: `AI_MAX_OUTPUT_TOKENS=50`, `AI_MODEL=qwen3:4b`, prompt
   "Conta uma historia longa e detalhada sobre um dragao que aprende a
   voar." Corpo interceptado antes do envio:
   `{"model":"qwen3:4b","messages":[...],"stream":false,"options":{"num_predict":50}}`
   — `options.num_predict` presente e igual à configuração (era o bug:
   antes desta correção, `options` não existia no corpo). Resultado com
   `qwen3:4b` (modelo com raciocínio interno): `message.content` vazio
   — o orçamento de 50 tokens foi inteiramente consumido pela fase de
   "thinking"; `complete()` lançou `invalid_response`, corretamente
   (ver "Correção real: `maxOutputTokens`", acima — semântica real do
   Ollama com modelos de raciocínio, não uma regressão).
4. **Limite de output — confirmação positiva, modelo sem raciocínio
   interno**: mesmo pedido, `AI_MODEL=qwen2.5:3b`,
   `AI_MAX_OUTPUT_TOKENS=50` → `usage.outputTokens: 50` (exatamente o
   limite), `content` genuinamente truncado a meio de uma frase
   ("...Embora Zephyr fos" — corte visível). Confirma, através do
   provider real (não só do `curl` isolado), que o limite configurado é
   efetivamente respeitado pela API.

Nenhum documento real nem dado de InvoiceDraft foi enviado — só os
prompts neutros acima.

## Limitações conhecidas

- Sem `temperature` no contrato — nenhum consumidor real a pede ainda;
  aditivo quando existir necessidade confirmada.
- `usage` do Ollama inclui, no modelo `qwen3:4b` testado, um campo
  `message.thinking` (raciocínio interno do modelo) separado de
  `message.content` — `OllamaAiProvider` usa sempre só `content`;
  `thinking` nunca é lido nem exposto.
- **`AI_MAX_OUTPUT_TOKENS` baixo com um modelo de raciocínio pode
  produzir `invalid_response`** — confirmado real com `qwen3:4b` e
  limite de 50: o orçamento de tokens é consumido pela fase de
  "thinking" antes de qualquer `content` final. Comportamento correto
  do ponto de vista do contrato (sem texto final, não há resposta
  válida a devolver), não uma falha de `OllamaAiProvider` — mas um
  limite muito baixo combinado com um modelo de raciocínio é, na
  prática, inutilizável; documentado aqui para não ser descoberto tarde
  por um futuro consumidor.
- `packages/ai` continua sem nenhum consumidor real — o extractor de
  IA fica para uma fase futura, fora do âmbito desta.
- Validação manual depende de o Ollama estar instalado/a correr
  localmente — não bloqueia o fecho da fase (testes automatizados são
  suficientes e não dependem disso).

## Trabalho futuro

Extractor de IA real (implementa `DocumentExtractor<FiscalField, T>`
sobre `AiCompletionProvider`, regista-se em `FISCAL_EXTRACTORS` — ver
`docs/adr/0007-document-extraction-foundation.md`); segundo provider,
cloud (OpenAI, Anthropic, Azure OpenAI, OpenRouter), só com necessidade
real confirmada, sobre o mesmo `AiCompletionProvider`; gestão de chaves
por organização, se/quando existir um segundo consumidor a justificá-la.

## Critérios de conclusão

- [x] `AiProviderName = 'mock' | 'ollama'`.
- [x] Nenhuma referência funcional a OpenAI em `packages/ai`.
- [x] Dependência `openai` removida.
- [x] `pnpm-lock.yaml` atualizado.
- [x] `MockAiProvider` preservado.
- [x] `OllamaAiProvider` implementado.
- [x] `createAiProvider()` seleciona mock ou Ollama.
- [x] `loadAiConfig()` não exige API key.
- [x] `AI_MODEL` obrigatório apenas para Ollama.
- [x] `AI_BASE_URL` possui default local seguro.
- [x] `AI_BASE_URL` com barra(s) final(is) normalizado — sem barra dupla no endpoint (testado + validado real).
- [x] Timeout cancela realmente o pedido com `AbortController` (validado com timers reais).
- [x] Sem retries automáticos.
- [x] **`AI_MAX_OUTPUT_TOKENS`/`request.maxOutputTokens` efetivamente aplicados** — enviados em `options.num_predict`, único campo respeitado pela API; confirmado real (`usage.outputTokens` igual ao limite configurado, `qwen2.5:3b`) — não apenas presente no contrato sem efeito.
- [x] Resposta normalizada contém conteúdo, provider e modelo.
- [x] Usage normalizado quando disponível.
- [x] Erros sanitizados.
- [x] Nenhuma resposta bruta do Ollama exposta.
- [x] JSON inválido/corpo vazio (HTTP 200) nunca escapa como `SyntaxError` bruto — sempre `AiProviderError{code:'invalid_response'}`.
- [x] Nenhuma chamada externa nos testes.
- [x] Testes cobrem config, mock, factory, provider, limite de output, timeout, JSON inválido, normalização de URL e erros.
- [x] Nenhuma alteração a Prisma, OCR, Worker, InvoiceDraft, parsing ou frontend.
- [x] `.env.example` atualizado.
- [x] Documentação atualizada.
- [x] Sem código morto OpenAI.
- [x] `git diff --check` limpo.
- [x] Git com alterações não commitadas (por instrução explícita — não afirmado como "limpo").

## Próxima fase

Por decidir — candidato natural: extractor fiscal de IA real sobre
`AiCompletionProvider`/`DocumentExtractor` (ver "Trabalho futuro"); ou
validação manual interativa no browser da Fase 6.8, ainda pendente.
