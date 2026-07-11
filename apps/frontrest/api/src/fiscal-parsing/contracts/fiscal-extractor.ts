import type { ExtractionMatch, FiscalField } from '../types';

/**
 * Contrato de um extractor especializado — genérico o suficiente para
 * qualquer campo fiscal, sem conhecimento de OCR, storage ou dos outros
 * extractors. Cada extractor é independente: recebe o texto OCR
 * completo, devolve `null` quando não encontra nada, nunca lança para
 * "não encontrado" (só para erros de programação reais). Novo extractor
 * = nova classe que implementa isto + um valor novo em `FiscalField`
 * (dois extractors podem partilhar o mesmo `field` — `FiscalParsingService`
 * fica com o de maior confiança, nunca "o último a correr"; é assim que
 * um extractor por país conviveria com um genérico para o mesmo campo).
 *
 * Limitação conhecida, deliberada: `extract()` é síncrono. Cobre regex/
 * heurísticas (esta fase) e continuaria a cobrir um extractor de
 * machine learning local sem I/O de rede. Não cobre um extractor de IA
 * que chame um serviço externo (`@frontcore/ai`) — isso exige
 * `Promise<ExtractionMatch<T> | null>`, uma mudança breaking a este
 * contrato e a `FiscalParsingService.parse()` (que passaria a `async`).
 * Não implementada agora — sem IA nesta fase — mas fica registada aqui
 * para não ser descoberta tarde: quando existir o primeiro extractor
 * assíncrono, este contrato muda primeiro, arrastando os restantes 9
 * extractors só na assinatura (`extract` ganha `async`), sem lhes tocar
 * na lógica.
 */
export interface FiscalExtractor<T> {
  /** Campo que este extractor cobre — usado pelo pipeline para montar `FiscalExtractionResult`. */
  readonly field: FiscalField;

  /** Analisa `ocrText` e devolve o melhor match, ou `null` se não encontrar nada. */
  extract(ocrText: string): ExtractionMatch<T> | null;
}
