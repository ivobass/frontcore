import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse, OllamaAiConfig } from '../../contracts';
import { AiProviderError } from '../../errors';

interface OllamaChatMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  model?: string;
  message?: { role: string; content: string };
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
          messages: request.messages.map(
            (message): OllamaChatMessage => ({ role: message.role, content: message.content }),
          ),
          stream: false,
          options: { num_predict: maxOutputTokens },
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
    const content = body.message?.content;
    if (!content) {
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
    };
  }
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
