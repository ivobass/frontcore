/**
 * Contrato partilhado da fila `ocr-processing` — a única fila do FrontRest
 * que já tem produtor (`apps/frontrest/api`) e consumidor (`apps/frontrest/workers`)
 * reais, ambos importando exatamente este contrato (Fase 6.4).
 *
 * Exceção arquitetural deliberada: `invoiceDraftId` é um conceito de
 * domínio FrontRest (`InvoiceDraft`), o que normalmente pertenceria a
 * `apps/frontrest/*`, não a `packages/queue` — ver a "Regra de ouro" em
 * `docs/ARCHITECTURE.md` ("packages/* = FrontCore, zero lógica de
 * domínio"). Vive aqui porque é o único ponto que a API e o Worker já
 * partilham sem duplicar a interface nem criar uma dependência direta
 * entre as duas apps (nenhum package do FrontCore importa de `apps/`, e
 * as apps não se importam entre si). Justificação completa em
 * `docs/phases/phase-6.4-ocr-draft-integration-foundation.md`, secção
 * "Decisões arquiteturais". Não generalizar mais: se surgir um segundo
 * contrato de job com a mesma necessidade, revisitar esta decisão (ex.
 * um package de contratos partilhados do produto).
 */
export const OCR_PROCESSING_QUEUE = 'ocr-processing';

/** Payload da fila `ocr-processing`. */
export interface OcrProcessingJob {
  invoiceDraftId: string;
  storageObjectId: string;
  organizationId: string;
}
