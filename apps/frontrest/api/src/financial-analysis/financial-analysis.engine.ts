import type { FinancialInsights } from '../financial-insights/financial-insights.types';
import type { FinancialAnalysisEngineOutput, FinancialAnalysisOutcome, RegisteredFinancialAnalysis } from './types';

/**
 * Motor de composição (Fase 8.10) — corre cada análise de forma
 * independente sobre o mesmo `FinancialInsights` e agrega só as que
 * produziram conclusão (`analyze()` não-nulo). Síncrono e
 * determinístico: sem I/O, sem resolução de conflitos — cada análise
 * tem o seu próprio `id`, nunca compete com outra pelo mesmo resultado
 * (ao contrário de `runDocumentExtractors()`, `document-extraction/`,
 * ADR-0007) — e sem `processingTimeMs` nem qualquer valor não
 * determinístico na metadata.
 */
export function runFinancialAnalyses(
  analyses: RegisteredFinancialAnalysis[],
  insights: FinancialInsights,
): FinancialAnalysisEngineOutput {
  const results: FinancialAnalysisOutcome[] = [];

  for (const analysis of analyses) {
    const result = analysis.analyze(insights);
    if (result) {
      results.push(result);
    }
  }

  return {
    results,
    metadata: {
      analysesRun: analyses.map((analysis) => analysis.id),
      conclusionsProduced: results.length,
    },
  };
}
