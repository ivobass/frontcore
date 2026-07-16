'use client';

import { Card, CardHeader, CardDescription, CardContent, Typography } from '@frontcore/ui';
import { formatCurrency } from '../../../lib/format';
import type { FinancialDashboardSummary } from '../../../lib/dashboard';

/** Os 4 cards principais do dashboard financeiro (Fase 7) — nenhum cálculo aqui, só apresentação do que o backend já agregou. */
export function FinancialSummaryCards({ summary }: { summary: FinancialDashboardSummary }) {
  const overdueCount = summary.byStatus.find((row) => row.status === 'OVERDUE')?.count ?? 0;

  const cards = [
    { title: 'Total de despesas', value: formatCurrency(summary.totals.totalAmount) },
    { title: 'Número de faturas', value: String(summary.totals.activeInvoiceCount) },
    { title: 'Média por fatura', value: formatCurrency(summary.totals.averageAmount) },
    { title: 'Faturas vencidas', value: String(overdueCount) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
          </CardHeader>
          <CardContent>
            <Typography variant="h3">{card.value}</Typography>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
