import type { InvoiceStatus } from '../../../lib/invoices';

/** Labels em português de `InvoiceStatus` — partilhado entre a listagem e o formulário. */
export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** Classe partilhada pelos `<select>` nativos deste módulo — visualmente alinhada com `Input`. */
export const selectClassName =
  'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Variante `w-full` — usada dentro de `FormField` (formulário), ao contrário dos filtros em linha da listagem. */
export const fullWidthSelectClassName = `${selectClassName} w-full`;
