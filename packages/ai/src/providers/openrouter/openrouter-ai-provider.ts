import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResponse,
  AiStructuredOutputDefinition,
  AiToolCall,
  AiToolDefinition,
  OpenRouterAiConfig,
} from '../../contracts';
import { AiProviderError } from '../../errors';

interface OpenRouterChatMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

interface OpenRouterResponseFormat {
  type: 'json_schema';
  json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
}

interface OpenRouterToolCall {
  id?: string;
  function?: { name: string; arguments?: string };
}

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{ message?: { role: string; content: string; tool_calls?: OpenRouterToolCall[] }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Primeiro provider cloud real (Fase 8.2) — API **OpenAI-compatible** do
 * OpenRouter (`POST {baseUrl}/chat/completions`, endpoint público
 * `https://openrouter.ai/api/v1`), que dá acesso a dezenas de modelos
 * (OpenAI, Anthropic, Google, Mistral, DeepSeek, ...) atrás de uma única
 * API e uma única credencial — a mesma razão por que a arquitetura deste
 * package já era provider-agnostic desde a Fase 6.11: adicionar este
 * provider não exigiu nenhuma alteração a `AiCompletionProvider`,
 * `AiChatService` ou `AiController`.
 *
 * `fetch` nativo (sem SDK — mesma disciplina do `OllamaAiProvider`).
 * `model` usa a convenção de nomes do OpenRouter (`"<fabricante>/<modelo>"`,
 * ex. `"openai/gpt-4o-mini"`, `"anthropic/claude-3.5-sonnet"`) — uma
 * string de configuração, nunca uma nova abstração de seleção de modelo
 * (o mesmo campo `model`/`AiConfig.model` já existente serve).
 *
 * Completions simples validadas empiricamente contra o serviço real do
 * OpenRouter (Fase 8.2) — ver
 * `docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md`.
 * **Tools (Fase 8.3)** — `tools`/`tool_calls` seguem exatamente o
 * formato OpenAI-compatible documentado (`function.arguments` já é uma
 * string JSON, ao contrário do Ollama nativo); a mensagem `assistant`
 * que originou uma tool call preserva `tool_calls` ao ser reenviada no
 * pedido seguinte (obrigatório para o OpenRouter correlacionar com a
 * mensagem `tool` seguinte — nunca só `role`/`content`); validado por
 * testes unitários com `fetch` mockado — ver validação manual da Fase
 * 8.3 para confirmação (ou não) contra o serviço real com um modelo
 * tools-capable.
 *
 * Structured output (Fase 6.14) — `responseFormat` traduzido para
 * `response_format: { type: 'json_schema', json_schema: {name, strict,
 * schema} }`, o formato OpenAI-compatible documentado (suportado pela
 * maioria dos modelos atrás do OpenRouter que anunciam a capacidade;
 * modelos sem suporte devolvem o próprio erro do upstream, classificado
 * pela taxonomia HTTP já existente — sem lógica nova de deteção de
 * capacidade, YAGNI). `strict` por omissão `true` quando
 * `AiStructuredOutputDefinition.strict` não é indicado. A resposta
 * continua normalizada da mesma forma (`choices[0].message.content`) —
 * chega como uma string JSON quando o pedido é satisfeito, nunca
 * pré-parseada aqui.
 */
export class OpenRouterAiProvider implements AiCompletionProvider {
  readonly name = 'openrouter';

  constructor(private readonly config: OpenRouterAiConfig) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const model = request.model ?? this.config.model;
    const maxOutputTokens = request.maxOutputTokens ?? this.config.maxOutputTokens;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(buildChatUrl(this.config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map(
            (message): OpenRouterChatMessage => ({
              role: message.role,
              content: message.content,
              ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
              // A mensagem `assistant` que originou a(s) tool call(s) tem de
              // preservar `tool_calls` ao ser reenviada — a API
              // OpenAI-compatible usa isto para correlacionar com a mensagem
              // `tool` seguinte; só `role`/`content` nunca é suficiente.
              ...(message.toolCalls && message.toolCalls.length > 0
                ? { tool_calls: buildOpenRouterToolCalls(message.toolCalls) }
                : {}),
            }),
          ),
          stream: false,
          max_tokens: maxOutputTokens,
          ...(request.tools && request.tools.length > 0 ? { tools: buildOpenRouterTools(request.tools) } : {}),
          ...(request.responseFormat
            ? { response_format: buildOpenRouterResponseFormat(request.responseFormat) }
            : {}),
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
      throw await classifyOpenRouterHttpError(response);
    }

    const body = await parseOpenRouterResponseBody(response);
    const toolCalls = normalizeOpenRouterToolCalls(body.choices?.[0]?.message?.tool_calls);
    const content = body.choices?.[0]?.message?.content ?? '';
    if (!content && !toolCalls) {
      throw new AiProviderError('Resposta inválida do provider de IA — sem conteúdo de texto.', 'invalid_response');
    }

    return {
      content,
      provider: this.name,
      model: body.model ?? model,
      usage:
        body.usage?.prompt_tokens !== undefined && body.usage?.completion_tokens !== undefined
          ? { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens }
          : undefined,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }
}

function buildOpenRouterTools(tools: AiToolDefinition[]): Array<{ type: 'function'; function: AiToolDefinition }> {
  return tools.map((tool) => ({ type: 'function' as const, function: tool }));
}

function buildOpenRouterResponseFormat(definition: AiStructuredOutputDefinition): OpenRouterResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: definition.name,
      strict: definition.strict ?? true,
      schema: definition.schema,
    },
  };
}

function buildOpenRouterToolCalls(
  toolCalls: AiToolCall[],
): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> {
  return toolCalls.map((call) => ({
    id: call.id,
    type: 'function' as const,
    function: { name: call.name, arguments: call.arguments },
  }));
}

function normalizeOpenRouterToolCalls(toolCalls: OpenRouterToolCall[] | undefined): AiToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls
    .filter((call): call is Required<OpenRouterToolCall> => Boolean(call.function?.name))
    .map((call, index) => ({
      id: call.id ?? `openrouter-tool-call-${index}`,
      name: call.function.name,
      arguments: call.function.arguments ?? '{}',
    }));
}

/** Remove barra(s) finais de `baseUrl` antes de anexar `/chat/completions` — evita `https://host//chat/completions`. */
function buildChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/**
 * `response.json()` lança `SyntaxError` bruto para HTTP 200 com corpo
 * vazio, truncado, HTML ou de outra forma não-JSON — nunca deixado
 * escapar tal e qual; convertido para `AiProviderError` sanitizada, sem
 * o corpo bruto na mensagem pública (só em `cause`).
 */
async function parseOpenRouterResponseBody(response: Response): Promise<OpenRouterChatResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as OpenRouterChatResponse;
  } catch (error) {
    throw new AiProviderError('Resposta inválida do provider de IA.', 'invalid_response', { cause: error });
  }
}

/**
 * Classifica uma resposta HTTP não-`ok` do OpenRouter pelo código HTTP
 * (API OpenAI-compatible, códigos estáveis e documentados — nunca
 * inferidos do corpo, ao contrário do Ollama, que não distingue
 * "modelo não encontrado" por código HTTP próprio). `body` só é
 * preservado em `cause` — nunca na mensagem pública sanitizada.
 */
async function classifyOpenRouterHttpError(response: Response): Promise<AiProviderError> {
  const body = await response.text().catch(() => '');
  const cause = new Error(`HTTP ${response.status}: ${body}`);

  if (response.status === 401 || response.status === 403) {
    return new AiProviderError('Autenticação com o provider de IA falhou.', 'authentication', { cause });
  }
  if (response.status === 402) {
    // Confirmado empiricamente contra o serviço real (Fase 8.2, validação
    // manual): 402 é devolvido pelo OpenRouter quando a conta (ou o
    // provider upstream para o qual o pedido foi encaminhado) não tem
    // saldo suficiente — não é um erro do pedido em si, mesma categoria
    // operacional de `authentication` (configuração da conta, "contacta o
    // suporte", nunca retryable).
    return new AiProviderError('Saldo insuficiente na conta do provider de IA.', 'authentication', { cause });
  }
  if (response.status === 429) {
    return new AiProviderError('Limite de pedidos ao provider de IA excedido.', 'rate_limit', { cause });
  }
  if (response.status === 404) {
    return new AiProviderError('Modelo de IA não encontrado no provider.', 'model_not_found', { cause });
  }
  if (response.status >= 500) {
    return new AiProviderError('Provider de IA indisponível.', 'provider_unavailable', { cause });
  }
  return new AiProviderError('Falha ao comunicar com o provider de IA.', 'unknown', { cause });
}
