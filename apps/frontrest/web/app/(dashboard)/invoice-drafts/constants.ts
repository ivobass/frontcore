import type { OcrStatus } from '../../../lib/invoice-drafts';

/** Labels em português de `OcrStatus` — partilhado entre a listagem e a revisão. */
export const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'A processar',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

/** Variante de `Badge` por `OcrStatus` — mesmo padrão de `STATUS_BADGE_VARIANT` em `invoices/page.tsx`. */
export const OCR_STATUS_BADGE_VARIANT: Record<
  OcrStatus,
  'secondary' | 'success' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  PROCESSING: 'outline',
  COMPLETED: 'success',
  FAILED: 'destructive',
};

/** Intervalo de polling do estado OCR enquanto PENDING/PROCESSING. */
export const OCR_POLL_INTERVAL_MS = 3000;
