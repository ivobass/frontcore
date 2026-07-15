/**
 * Categorias com valor operacional imediato para o(s) provider(s)
 * realmente implementados — nunca a hierarquia integral de erros de um
 * SDK/API. Sem `authentication`/`rate_limit`: nenhum provider
 * implementado hoje (Ollama, local, sem API key) tem esses conceitos;
 * reintroduzir-se-iam quando um provider cloud real os exigir, não
 * antes.
 */
export type AiErrorCode = 'timeout' | 'invalid_response' | 'provider_unavailable' | 'model_not_found' | 'unknown';

/**
 * Erro operacional de um provider de IA — uma única classe com `code`
 * tipado, não uma subclasse por categoria. As categorias não justificam
 * um ficheiro cada: nenhuma precisa de campos ou comportamento próprios
 * além do `code` (ao contrário, por exemplo, dos erros de PDF em
 * `@frontcore/ocr`, que nascem de gatilhos estruturalmente diferentes
 * do Poppler). `message` é sempre um texto fixo sanitizado por `code` —
 * nunca a mensagem bruta do provider, nunca o corpo do documento
 * enviado, nunca a resposta bruta; a causa original só vive em `cause`
 * (nunca serializada para fora do processo). Ver
 * `providers/ollama/ollama-ai-provider.ts` para a classificação real.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AiErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}
