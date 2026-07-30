'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
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
import { getFinancialSummary, getFinancialInsights } from '../../../lib/dashboard';
import type { FinancialDashboardSummary, FinancialInsights, InvoiceStatus } from '../../../lib/dashboard';
import { formatCurrency, formatDate } from '../../../lib/format';
import { FinancialSummaryCards } from './financial-summary-cards';
import { ProportionalBarList } from './proportional-bar-list';

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

/** ISO `YYYY-MM-DD` do primeiro/último dia do mês corrente (hora local do browser) — só para pré-preencher o seletor; o backend usa a mesma regra por omissão, mas o frontend envia sempre `from`/`to` explícitos, nunca depende do omisso do lado do servidor. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: toIso(first), to: toIso(last) };
}

export default function DashboardPage() {
  const { session, me } = useSession();
  const defaultRange = currentMonthRange();

  const [fromInput, setFromInput] = useState(defaultRange.from);
  const [toInput, setToInput] = useState(defaultRange.to);
  const [period, setPeriod] = useState(defaultRange);

  const [summary, setSummary] = useState<FinancialDashboardSummary | null>(null);
  const [insights, setInsights] = useState<FinancialInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodError = fromInput && toInput && fromInput > toInput ? 'A data inicial não pode ser posterior à data final.' : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fase 8.9 — resumo e insights são pedidos independentes (nenhum
    // depende do resultado do outro), por isso em paralelo via
    // Promise.all, nunca sequencialmente. Correção pós-revisão: uma
    // falha em getFinancialInsights() (ex. deploy faseado onde a API
    // ainda não expõe este endpoint) nunca bloqueia o resumo principal
    // — degrada para "sem destaques" (`insights: null`), nunca um erro
    // de página inteira.
    Promise.all([
      getFinancialSummary(session.accessToken, period),
      getFinancialInsights(session.accessToken, period).catch(() => null),
    ])
      .then(([summaryResult, insightsResult]) => {
        if (cancelled) return;
        setSummary(summaryResult);
        setInsights(insightsResult);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar o resumo financeiro.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.accessToken, period]);

  function applyPeriod() {
    if (periodError || !fromInput || !toInput) return;
    setPeriod({ from: fromInput, to: toInput });
  }

  const isEmpty = summary
    ? summary.totals.activeInvoiceCount === 0 && summary.totals.cancelledInvoiceCount === 0
    : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`${me.organization.name} — resumo financeiro do período selecionado.`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="dashboard-from">De</FieldLabel>
            <Input
              id="dashboard-from"
              type="date"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="dashboard-to">Até</FieldLabel>
            <Input
              id="dashboard-to"
              type="date"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              className="w-44"
            />
          </div>
          <Button type="button" onClick={applyPeriod} disabled={!!periodError || !fromInput || !toInput}>
            Aplicar período
          </Button>
          {summary ? (
            <Typography variant="muted">
              A mostrar {formatDate(summary.period.from)} a {formatDate(summary.period.to)}
            </Typography>
          ) : null}
        </CardContent>
        {periodError ? (
          <CardContent className="pt-0">
            <Alert variant="destructive">
              <AlertDescription>{periodError}</AlertDescription>
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
      ) : !summary || isEmpty ? (
        <EmptyState
          title="Sem faturas neste período"
          description="Não existem faturas confirmadas no intervalo selecionado. Experimente alargar o período."
        />
      ) : (
        <>
          <FinancialSummaryCards summary={summary} />

          {insights ? (
            <Card>
              <CardHeader>
                <CardTitle>Destaques</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <Typography variant="small">Maior fornecedor</Typography>
                  <Typography variant="muted">
                    {insights.largestSupplier
                      ? `${insights.largestSupplier.supplierName}${insights.largestSupplier.share !== null ? ` (${insights.largestSupplier.share}% do total)` : ''}`
                      : 'Sem dados'}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small">Maior categoria</Typography>
                  <Typography variant="muted">
                    {insights.largestCategory
                      ? `${insights.largestCategory.categoryName}${insights.largestCategory.share !== null ? ` (${insights.largestCategory.share}% do total)` : ''}`
                      : 'Sem dados'}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small">Por pagar</Typography>
                  <Typography variant="muted">
                    {insights.outstanding.count} fatura(s) · {formatCurrency(insights.outstanding.totalAmount)}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small">Tendência mensal</Typography>
                  <Typography variant="muted">
                    {insights.trend.direction === 'insufficient_data' || !insights.trend.comparison
                      ? 'Dados insuficientes'
                      : `${insights.trend.comparison.percentageChange === null ? 'Sem dados no período anterior' : `${insights.trend.comparison.percentageChange}%`} (${insights.trend.direction === 'increase' ? 'aumento' : insights.trend.direction === 'decrease' ? 'redução' : 'sem alteração'})`}
                  </Typography>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Resumo por estado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {summary.byStatus.map((row) => (
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
              <CardTitle>Evolução mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <ProportionalBarList
                items={summary.monthlyTrend.map((row) => ({
                  key: row.month,
                  label: row.month,
                  count: row.count,
                  totalAmount: row.totalAmount,
                }))}
                emptyMessage="Sem faturas ativas neste período."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribuição por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <ProportionalBarList
                items={summary.byCategory.map((row) => ({
                  key: row.categoryId ?? 'sem-categoria',
                  label: row.categoryName,
                  count: row.count,
                  totalAmount: row.totalAmount,
                }))}
                emptyMessage="Sem faturas ativas neste período."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Principais fornecedores</CardTitle>
            </CardHeader>
            <CardContent>
              <ProportionalBarList
                items={summary.topSuppliers.map((row) => ({
                  key: row.supplierId,
                  label: row.supplierName,
                  count: row.count,
                  totalAmount: row.totalAmount,
                }))}
                emptyMessage="Sem faturas ativas neste período."
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
