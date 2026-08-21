/**
 * Categorias com valor operacional imediato para o(s) provider(s)
 * realmente implementados — nunca a hierarquia integral de erros de um
 * SDK/API. `authentication`/`rate_limit` (Fase 8.2) só existem desde que
 * `OpenRouterAiProvider` — o primeiro provider cloud, com API key e
 * limites de taxa reais — foi implementado; o Ollama local nunca produz
 * nenhum dos dois. `unsupported_capability` (Fase 6.14) é lançado ANTES
 * de qualquer pedido de rede, nunca devolvido pelo provider remoto —
 * cobre um pedido que declara uma capacidade genérica do contrato
 * (`responseFormat`) que este provider concreto não implementa com
 * segurança nesta fase (`OllamaAiProvider`, ver esse ficheiro) — nunca
 * fingir suporte silenciosamente. Sem sistema de negociação de
 * capacidades (YAGNI, Fase 6.14): só este `code`, verificado no início
 * de `complete()` do provider em causa.
 */
export type AiErrorCode =
  | 'timeout'
  | 'invalid_response'
  | 'provider_unavailable'
  | 'model_not_found'
  | 'authentication'
  | 'rate_limit'
  | 'unsupported_capability'
  | 'unknown';

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
