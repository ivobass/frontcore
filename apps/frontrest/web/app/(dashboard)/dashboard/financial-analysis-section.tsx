import { Card, CardHeader, CardTitle, CardContent, Typography } from '@frontcore/ui';
import type { FinancialAnalysisEngineOutput, FinancialAnalysisOutcome } from '../../../lib/dashboard';

const ANALYSIS_TITLES: Record<FinancialAnalysisOutcome['id'], string> = {
  monthly_trend: 'Tendência mensal',
  relative_concentration: 'Concentração relativa',
};

/** Tradução pt-PT dos discriminadores estáveis devolvidos pelo backend (Fase 8.11) — nunca gerada nem inferida aqui, só rotulada. */
const CONCLUSION_LABELS: Record<string, string> = {
  increase: 'Aumento face ao mês anterior',
  decrease: 'Redução face ao mês anterior',
  unchanged: 'Sem alteração face ao mês anterior',
  supplier_more_concentrated: 'Fornecedores mais concentrados do que categorias',
  category_more_concentrated: 'Categorias mais concentradas do que fornecedores',
  equally_concentrated: 'Concentração equivalente entre fornecedores e categorias',
};

/** Só apresenta os campos numéricos já devolvidos como evidência — nunca recalcula nem infere nada a partir deles. */
function describeEvidence(result: FinancialAnalysisOutcome): string {
  if (result.id === 'monthly_trend') {
    const { current, previous, percentageChange } = result.evidence;
    return `Atual ${current} € · Anterior ${previous} €${percentageChange !== null ? ` · ${percentageChange}%` : ''}`;
  }
  const { supplierShare, categoryShare } = result.evidence;
  return `Fornecedores ${supplierShare}% · Categorias ${categoryShare}%`;
}

/**
 * Secção "Análise financeira" (Fase 8.11) — apresenta só as conclusões
 * já devolvidas por `analysis.results` (o motor já omite o que não é
 * aplicável, Fase 8.10); `null` quando nenhuma conclusão existe, nunca
 * um card vazio.
 */
export function FinancialAnalysisSection({ analysis }: { analysis: FinancialAnalysisEngineOutput }) {
  if (analysis.results.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise financeira</CardTitle>
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
