'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Input,
  FieldLabel,
  Spinner,
  Alert,
  AlertDescription,
  EmptyState,
  Typography,
  Button,
} from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { getMonthlyReport, downloadMonthlyReportCsv, downloadMonthlyReportPdf } from '../../../lib/reports';
import type { InvoiceStatus, MonthlyFinancialReport, PeriodComparisonValue } from '../../../lib/reports';
import { formatCurrency, formatDate } from '../../../lib/format';
import { FinancialAnalysisSection } from './financial-analysis-section';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  PAID: 'success',
  OVERDUE: 'destructive',
  CANCELLED: 'outline',
};

/** `YYYY-MM` do mês corrente (hora local do browser) — só para pré-preencher o seletor; o pedido ao backend usa sempre o valor explícito do campo, nunca uma omissão do lado do servidor. */
function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Tipo estrutural mínimo — aceita `PeriodComparisonValue` (Fase 9, `percentageChange: number`) e `TrendComparison` dos Financial Insights (Fase 8.9, `percentageChange: string`), nunca precisa de mais do que `direction`/`percentageChange`. */
function DirectionBadge({ value }: { value: { direction: PeriodComparisonValue['direction']; percentageChange: number | string | null } }) {
  const label = value.direction === 'increase' ? 'Aumento' : value.direction === 'decrease' ? 'Redução' : 'Sem alteração';
  // Aumento de despesa é desfavorável (destructive); redução é favorável (success) — leitura financeira, não genérica.
  const variant = value.direction === 'increase' ? 'destructive' : value.direction === 'decrease' ? 'success' : 'outline';
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>{label}</Badge>
      <Typography variant="muted">
        {value.percentageChange === null ? 'Sem dados no período anterior' : `${value.percentageChange}%`}
      </Typography>
    </div>
  );
}

export default function ReportsPage() {
  const { session } = useSession();

  const [month, setMonth] = useState(currentMonthValue());
  const [appliedMonth, setAppliedMonth] = useState(currentMonthValue());

  const [report, setReport] = useState<MonthlyFinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getMonthlyReport(session.accessToken, appliedMonth)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar o relatório.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.accessToken, appliedMonth]);

  function applyMonth() {
    if (!month) return;
    setAppliedMonth(month);
  }

  async function handleExport(format: 'csv' | 'pdf') {
    setExporting(format);
    setExportError(null);
    try {
      if (format === 'csv') {
        await downloadMonthlyReportCsv(session.accessToken, appliedMonth);
      } else {
        await downloadMonthlyReportPdf(session.accessToken, appliedMonth);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Não foi possível exportar o relatório.');
    } finally {
      setExporting(null);
    }
  }

  const isEmpty = report ? report.totals.activeInvoiceCount === 0 && report.totals.cancelledInvoiceCount === 0 : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Relatórios" description="Relatório financeiro mensal, com comparação face ao mês anterior." />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="report-month">Mês</FieldLabel>
            <Input
              id="report-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-44"
            />
          </div>
          <Button type="button" onClick={applyMonth} disabled={!month}>
            Aplicar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleExport('csv')}
            disabled={!report || exporting !== null}
          >
            {exporting === 'csv' ? <Spinner className="h-4 w-4" /> : 'Exportar CSV'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleExport('pdf')}
            disabled={!report || exporting !== null}
          >
            {exporting === 'pdf' ? <Spinner className="h-4 w-4" /> : 'Exportar PDF'}
          </Button>
        </CardContent>
        {exportError ? (
          <CardContent className="pt-0">
            <Alert variant="destructive">
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !report || isEmpty ? (
        <EmptyState
          title="Sem faturas neste período"
          description="Não existem faturas confirmadas no mês selecionado."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Total de despesas</CardDescription>
              </CardHeader>
              <CardContent>
                <Typography variant="h3">{formatCurrency(report.totals.totalAmount)}</Typography>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Número de faturas</CardDescription>
              </CardHeader>
              <CardContent>
                <Typography variant="h3">{report.totals.activeInvoiceCount}</Typography>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Média por fatura</CardDescription>
              </CardHeader>
              <CardContent>
                <Typography variant="h3">{formatCurrency(report.totals.averageAmount)}</Typography>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Faturas canceladas</CardDescription>
              </CardHeader>
              <CardContent>
                <Typography variant="h3">{report.totals.cancelledInvoiceCount}</Typography>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Resumo por estado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {report.byStatus.map((row) => (
                <div key={row.status} className="flex flex-col gap-1">
                  <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  <Typography variant="muted">
                    {row.count} · {formatCurrency(row.totalAmount)}
                  </Typography>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comparação com {formatDate(report.previousPeriod.from)} a {formatDate(report.previousPeriod.to)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:gap-8">
              <div className="flex flex-col gap-1">
                <Typography variant="small">Variação do total de despesas</Typography>
                <Typography variant="h4">{formatCurrency(report.comparison.totalAmount.current)}</Typography>
                <Typography variant="muted">Anterior: {formatCurrency(report.comparison.totalAmount.previous)}</Typography>
                <DirectionBadge value={report.comparison.totalAmount} />
              </div>
              <div className="flex flex-col gap-1">
                <Typography variant="small">Número de faturas ativas</Typography>
                <Typography variant="h4">{report.comparison.activeInvoiceCount.current}</Typography>
                <Typography variant="muted">Anterior: {report.comparison.activeInvoiceCount.previous}</Typography>
                <DirectionBadge value={report.comparison.activeInvoiceCount} />
              </div>
            </CardContent>
          </Card>

          {report.insights ? (
            <Card>
              <CardHeader>
                <CardTitle>Destaques</CardTitle>
                <CardDescription>Conclusões determinísticas (Financial Insights) sobre o período selecionado.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Typography variant="small">Maior fornecedor</Typography>
                    {report.insights.largestSupplier ? (
                      <Typography variant="muted">
                        {report.insights.largestSupplier.supplierName}
                        {report.insights.largestSupplier.share !== null ? ` (${report.insights.largestSupplier.share}% do total)` : ''}
                      </Typography>
                    ) : (
                      <Typography variant="muted">Sem dados</Typography>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small">Maior categoria</Typography>
                    {report.insights.largestCategory ? (
                      <Typography variant="muted">
                        {report.insights.largestCategory.categoryName}
                        {report.insights.largestCategory.share !== null ? ` (${report.insights.largestCategory.share}% do total)` : ''}
                      </Typography>
                    ) : (
                      <Typography variant="muted">Sem dados</Typography>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small">Por pagar (Pendente + Vencida)</Typography>
                    <Typography variant="muted">
                      {report.insights.outstanding.count} fatura(s) · {formatCurrency(report.insights.outstanding.totalAmount)}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small">Maior fatura</Typography>
                    {report.insights.largestExpense.invoice ? (
                      <Typography variant="muted">
                        {report.insights.largestExpense.invoice.supplierName} — {formatCurrency(report.insights.largestExpense.invoice.totalAmount)}
                      </Typography>
                    ) : (
                      <Typography variant="muted">Sem dados</Typography>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small">Tendência mensal</Typography>
                  {report.insights.trend.direction === 'insufficient_data' || !report.insights.trend.comparison ? (
                    <Typography variant="muted">Dados insuficientes para uma conclusão.</Typography>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Typography variant="muted">
                        {report.insights.trend.previousMonth} → {report.insights.trend.latestMonth}:{' '}
                        {formatCurrency(report.insights.trend.comparison.previous)} → {formatCurrency(report.insights.trend.comparison.current)}
                      </Typography>
                      <DirectionBadge value={report.insights.trend.comparison} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <FinancialAnalysisSection analysis={report.analysis} />

          <Card>
            <CardHeader>
              <CardTitle>Faturas do período</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Número</th>
                    <th className="px-3 py-2 text-left">Fornecedor</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-left">Emissão</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-right">Montante</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t border-border">
                      <td className="px-3 py-2">{invoice.number ?? '—'}</td>
                      <td className="px-3 py-2">{invoice.supplierName}</td>
                      <td className="px-3 py-2">{invoice.categoryName}</td>
                      <td className="px-3 py-2">{formatDate(invoice.issueDate)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(invoice.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
