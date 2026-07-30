import { Card, CardHeader, CardTitle, CardDescription, CardContent, Typography } from '@frontcore/ui';
import type { FinancialAnalysisEngineOutput, FinancialAnalysisOutcome } from '../../../lib/dashboard';

/**
 * Componente próprio da área Reports (Fase 8.12) — não importa nem
 * reutiliza o `FinancialAnalysisSection` do Dashboard (Fase 8.11):
 * decisão explícita do Product Owner, para não acoplar as duas áreas
 * através de um componente partilhado que nunca foi pedido. Os rótulos
 * abaixo são deliberadamente duplicados dos usados no Dashboard e nos
 * serializers de Reports — mesma disciplina já usada para
 * `STATUS_LABELS` entre `csv.serializer.ts`/`pdf.serializer.ts`.
 */
const ANALYSIS_TITLES: Record<FinancialAnalysisOutcome['id'], string> = {
  monthly_trend: 'Tendência mensal',
  relative_concentration: 'Concentração relativa',
};

const CONCLUSION_LABELS: Record<string, string> = {
  increase: 'Aumento face ao mês anterior',
  decrease: 'Redução face ao mês anterior',
  unchanged: 'Sem alteração face ao mês anterior',
  supplier_more_concentrated: 'Fornecedores mais concentrados do que categorias',
  category_more_concentrated: 'Categorias mais concentradas do que fornecedores',
  equally_concentrated: 'Concentração equivalente entre fornecedores e categorias',
};

/** Só apresenta os campos de evidência já devolvidos pela API — nunca recalcula, interpreta ou infere nada a partir deles. */
function describeEvidence(result: FinancialAnalysisOutcome): string {
  if (result.id === 'monthly_trend') {
    const { current, previous, percentageChange } = result.evidence;
    return `Atual ${current} € · Anterior ${previous} €${percentageChange !== null ? ` · ${percentageChange}%` : ''}`;
  }
  const { supplierShare, categoryShare } = result.evidence;
  return `Fornecedores ${supplierShare}% · Categorias ${categoryShare}%`;
}

/**
 * Secção "Análise financeira" do relatório mensal — apresenta só as
 * conclusões já devolvidas por `analysis.results` (o motor já omite o
 * que não é aplicável); `null` quando não há nenhuma, mesmo
 * comportamento já adotado pela secção equivalente do Dashboard.
 */
export function FinancialAnalysisSection({ analysis }: { analysis: FinancialAnalysisEngineOutput }) {
  if (analysis.results.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise financeira</CardTitle>
        <CardDescription>Conclusões determinísticas do Financial Analysis Engine sobre o mês selecionado.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {analysis.results.map((result) => (
          <div key={result.id} className="flex flex-col gap-1">
            <Typography variant="small">{ANALYSIS_TITLES[result.id]}</Typography>
            <Typography variant="muted">{CONCLUSION_LABELS[result.conclusion] ?? result.conclusion}</Typography>
            <Typography variant="muted">{describeEvidence(result)}</Typography>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
