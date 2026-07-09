/**
 * @frontcore/ocr
 * Motor de OCR extensível — contrato genérico (`OCRProvider`), resultado
 * normalizado (`OCRResult`) e providers concretos. Sem lógica de
 * domínio: nenhum parsing de campos, nenhuma extração fiscal, nenhuma
 * classificação de documentos. Ver `docs/phases/phase-6.2-ocr-pipeline-foundation.md`.
 */
export * from './contracts';
export * from './types';
export * from './providers';
export * from './services';
export * from './errors';
export * from './utils';
