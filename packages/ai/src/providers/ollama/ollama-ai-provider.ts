import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResponse,
  AiToolCall,
  AiToolDefinition,
  OllamaAiConfig,
} from '../../contracts';
import { AiProviderError } from '../../errors';

interface OllamaChatMessage {
  role: string;
  content: string;
  /** Só em mensagens `role: 'tool'` — formato nativo do Ollama usa `tool_name`, nunca `tool_call_id` (a API nativa não tem IDs de tool call, ao contrário do OpenAI-compatible). */
  tool_name?: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
}

interface OllamaToolCall {
  function?: { name: string; arguments?: unknown };
}

interface OllamaChatResponse {
  model?: string;
  message?: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Provider real sobre a API HTTP **nativa** do Ollama (`POST /api/chat`)
 * — nunca o endpoint OpenAI-compatible (`/v1/chat/completions`).
 * Confirmado empiricamente contra um servidor Ollama local real
 * (v0.31.1, modelo `qwen3:4b`) antes de escrever este ficheiro, não
 * assumido a partir de documentação memorizada: `/api/chat` aceita
 * `{ model, messages: [{ role, content }], stream, options }` — o mesmo
 * shape de `AiMessage[]`, sem nenhuma tradução para o envelope de outro
 * fornecedor — e devolve `message.content` já pronto, com contagem de
 * tokens em `prompt_eval_count`/`eval_count` (campos planos, não um
 * objeto `usage` aninhado). Usar o endpoint OpenAI-compatible obrigaria
 * a montar um pedido no formato OpenAI só para o Ollama o traduzir de
 * volta ao formato nativo internamente — a inversão de dependência que
 * este package evita (contrato do FrontCore independente primeiro,
 * cada provider adapta-se a ele, nunca o inverso).
 *
 * `fetch` nativo do Node (>=18; o projeto exige >=20) — sem SDK, sem
 * dependência nova. Timeout via `AbortController` real: `signal` é
 * passado ao `fetch`, por isso abortar cancela mesmo o pedido HTTP
 * subjacente, nunca um `Promise.race` que só deixa de esperar. Sem
 * streaming (`stream: false` sempre) e sem retries automáticos — `fetch`
 * nativo nunca reintenta sozinho.
 *
 * **Limite de output — `options.num_predict`, não um campo de topo.**
 * Confirmado empiricamente (`curl .../api/chat` com
 * `options: { num_predict: 10 }`): `eval_count` na resposta respeita
 * exatamente o valor pedido e `done_reason` passa a `"length"`. Não
 * existe um campo `max_tokens`/`max_output_tokens` de topo na API de
 * chat do Ollama — só dentro de `options`. Nota de semântica real,
 * observada na mesma validação, não uma decisão deste código: em
 * modelos com raciocínio interno (ex. `qwen3`, campo `message.thinking`),
 * um `num_predict` baixo pode ser inteiramente consumido pela fase de
 * "thinking", deixando `message.content` vazio — nesse caso
 * `complete()` já lança `invalid_response`, corretamente (não há texto
 * final a devolver), não um efeito deste provider.
 *
 * **Tools (Fase 8.3)** — `tools`/`message.tool_calls` seguem o mesmo
 * formato JSON Schema-based documentado pelo Ollama
 * (`{type:'function', function:{name,description,parameters}}`), com
 * `function.arguments` devolvido como **objeto**, não como string JSON
 * (diferença real face ao formato OpenAI-compatible do OpenRouter) —
 * normalizado aqui para `AiToolCall.arguments: string` via
 * `JSON.stringify()`. Ao reenviar a mensagem `assistant` que originou a
 * tool call, o formato nativo **não tem `id`** (só `function.name`/
 * `function.arguments` como objeto, convertido de volta de string JSON);
 * a mensagem `tool` correspondente usa `tool_name`, nunca um id de
 * correlação — diferença estrutural face ao `tool_call_id` do
 * OpenAI-compatible, documentada aqui para não ser assumida por engano.
 * **Não confirmado empiricamente contra um servidor Ollama real com um
 * modelo `tools`-capable** (ao contrário do resto deste provider) — só
 * nem todos os modelos locais anunciam a capacidade `tools`; ver
 * validação manual da Fase 8.3.
 */
export class OllamaAiProvider implements AiCompletionProvider {
  readonly name = 'ollama';

  constructor(private readonly config: OllamaAiConfig) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const model = request.model ?? this.config.model;
    const maxOutputTokens = request.maxOutputTokens ?? this.config.maxOutputTokens;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(buildChatUrl(this.config.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages.map((message): OllamaChatMessage => ({
            role: message.role,
            content: message.content,
            // Formato nativo do Ollama para o resultado de uma tool usa
            // `tool_name`, nunca um id de correlação (a API não tem IDs de
            // tool call) — perder `name` aqui quebraria a mensagem `tool`.
            ...(message.role === 'tool' && message.name ? { tool_name: message.name } : {}),
            // A mensagem `assistant` que originou a(s) tool call(s) tem de
            // preservar `tool_calls` ao ser reenviada — formato nativo não
            // inclui `id` (só `function.name`/`function.arguments`, como
            // objeto, nunca string JSON).
            ...(message.toolCalls && message.toolCalls.length > 0
              ? { tool_calls: buildOllamaToolCallsForRequest(message.toolCalls) }
              : {}),
          })),
          stream: false,
          options: { num_predict: maxOutputTokens },
          ...(request.tools && request.tools.length > 0 ? { tools: buildOllamaTools(request.tools) } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AiProviderError('Tempo limite excedido ao contactar o provider de IA.', 'timeout', {
          cause: error,
        });
      }
      throw new AiProviderError('Provider de IA indisponível.', 'provider_unavailable', { cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await classifyOllamaHttpError(response);
    }

    const body = await parseOllamaResponseBody(response);
    const toolCalls = normalizeOllamaToolCalls(body.message?.tool_calls);
    const content = body.message?.content ?? '';
    if (!content && !toolCalls) {
      throw new AiProviderError('Resposta inválida do provider de IA — sem conteúdo de texto.', 'invalid_response');
    }

    return {
      content,
      provider: this.name,
      model: body.model ?? model,
      usage:
        body.prompt_eval_count !== undefined && body.eval_count !== undefined
          ? { inputTokens: body.prompt_eval_count, outputTokens: body.eval_count }
          : undefined,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }
}

function buildOllamaTools(tools: AiToolDefinition[]): Array<{ type: 'function'; function: AiToolDefinition }> {
  return tools.map((tool) => ({ type: 'function' as const, function: tool }));
}

/**
 * Converte `AiToolCall.arguments` (string JSON, forma do contrato) de
 * volta a objeto — assimétrico do lado da normalização de entrada
 * (`normalizeOllamaToolCalls`, objeto → string), porque o formato nativo
 * do Ollama espera sempre `function.arguments` como objeto, nunca string.
 * `JSON.parse` nunca deve falhar aqui (a string só pode ter vindo de um
 * `JSON.stringify` anterior, no mesmo provider ou no OpenRouter), mas um
 * `catch` evita propagar um erro de parsing para dentro da serialização
 * do pedido — preferível `{}` a uma exceção não tratada nesse ponto.
 */
function buildOllamaToolCallsForRequest(toolCalls: AiToolCall[]): Array<{ function: { name: string; arguments: unknown } }> {
  return toolCalls.map((call) => ({
    function: {
      name: call.name,
      arguments: parseToolCallArguments(call.arguments),
    },
  }));
}

function parseToolCallArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeOllamaToolCalls(toolCalls: OllamaToolCall[] | undefined): AiToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls
    .filter((call): call is Required<OllamaToolCall> => Boolean(call.function?.name))
    .map((call, index) => ({
      id: `ollama-tool-call-${index}`,
      name: call.function.name,
      arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}),
    }));
}

/** Remove barra(s) finais de `baseUrl` antes de anexar `/api/chat` — evita `http://host//api/chat`. */
function buildChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/chat`;
}

/**
 * `response.json()` lança `SyntaxError` bruto para HTTP 200 com corpo
 * vazio, truncado, HTML ou de outra forma não-JSON — nunca deixado
 * escapar tal e qual; convertido para `AiProviderError` sanitizada, sem
 * o corpo bruto na mensagem pública (só em `cause`).
 */
async function parseOllamaResponseBody(response: Response): Promise<OllamaChatResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as OllamaChatResponse;
  } catch (error) {
    throw new AiProviderError('Resposta inválida do provider de IA.', 'invalid_response', { cause: error });
  }
}

/**
 * Classifica uma resposta HTTP não-`ok` do Ollama. `body` (que pode
 * conter o nome do modelo pedido) só é preservado em `cause` — nunca na
 * mensagem pública sanitizada.
 */
async function classifyOllamaHttpError(response: Response): Promise<AiProviderError> {
  const body = await response.text().catch(() => '');
  const cause = new Error(`HTTP ${response.status}: ${body}`);

  if (response.status === 404 && /not found/i.test(body)) {
    return new AiProviderError('Modelo de IA não encontrado no provider local.', 'model_not_found', { cause });
  }
  if (response.status >= 500) {
    return new AiProviderError('Provider de IA indisponível.', 'provider_unavailable', { cause });
  }
  return new AiProviderError('Falha ao comunicar com o provider de IA.', 'unknown', { cause });
}
