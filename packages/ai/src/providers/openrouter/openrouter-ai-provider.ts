import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse, OpenRouterAiConfig } from '../../contracts';
import { AiProviderError } from '../../errors';

interface OpenRouterChatMessage {
  role: string;
  content: string;
}

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{ message?: { role: string; content: string }; finish_reason?: string }>;
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
 * Sem validação empírica contra o serviço real do OpenRouter nesta fase
 * (sem API key disponível no ambiente de implementação) — validado por
 * testes unitários com `fetch` mockado, reproduzindo o formato de
 * pedido/resposta documentado da API OpenAI-compatible. Ver
 * `docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md`,
 * secção "Limitações conhecidas".
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
            (message): OpenRouterChatMessage => ({ role: message.role, content: message.content }),
          ),
          stream: false,
          max_tokens: maxOutputTokens,
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
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
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
    };
  }
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
