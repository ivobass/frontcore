'use client';

import { Typography } from '@frontcore/ui';
import { formatCurrency } from '../../../lib/format';

/**
 * Um único componente de "gráfico" reutilizado por evolução mensal,
 * distribuição por categoria e principais fornecedores (Fase 7) — as
 * três secções são estruturalmente a mesma coisa (rótulo + contagem +
 * montante, barra proporcional ao maior valor do conjunto), por isso
 * um único componente evita 3 ficheiros quase idênticos. Barra HTML/CSS
 * simples (`width: %`), sem dependência gráfica nova — decisão
 * explícita desta fase (ver documento da Fase 7): sem necessidade
 * concreta identificada que justifique uma biblioteca.
 */
export interface ProportionalBarListItem {
  key: string;
  label: string;
  count: number;
  /** String serializável do backend (`Decimal`) — nunca convertida para `number` além do necessário para desenhar a barra (nunca somada/recalculada aqui). */
  totalAmount: string;
}

export function ProportionalBarList({
  items,
  emptyMessage,
}: {
  items: ProportionalBarListItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <Typography variant="muted">{emptyMessage}</Typography>;
  }

  const max = Math.max(...items.map((item) => Number(item.totalAmount)));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const value = Number(item.totalAmount);
        const widthPercent = max > 0 ? Math.max((value / max) * 100, 2) : 0;
        return (
          <div key={item.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{item.label}</span>
              <span className="font-medium whitespace-nowrap">{formatCurrency(item.totalAmount)}</span>
            </div>
            <div className="h-2 w-full rounded bg-muted" role="img" aria-label={`${item.label}: ${formatCurrency(item.totalAmount)}`}>
              <div className="h-2 rounded bg-primary" style={{ width: `${widthPercent}%` }} />
            </div>
            <Typography variant="muted" className="text-xs">
              {item.count} {item.count === 1 ? 'fatura' : 'faturas'}
            </Typography>
          </div>
        );
      })}
    </div>
  );
}
