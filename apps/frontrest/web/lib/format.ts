/**
 * Formatação partilhada por qualquer página do FrontRest — extraída de
 * `invoices/page.tsx` (Fase 6.8) para ser reutilizada por
 * `invoice-drafts/page.tsx` sem duplicar as mesmas duas funções.
 */

export function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT');
}
