/**
 * Resultado normalizado de uma extração OCR — forma única que todos os
 * providers (presentes e futuros) devolvem, independentemente do motor
 * subjacente. Só texto bruto e metadados de extração — nenhum campo de
 * domínio (fornecedor, NIF, totais, ...): isso pertence a uma fase
 * futura de parsing, fora do âmbito deste package.
 */
export interface OCRResult {
  provider: string;
  language: string;
  confidence: number;
  processingTimeMs: number;
  pages: number;
  text: string;
  metadata?: Record<string, unknown>;
}
