import type { FinancialAnalysisOutcome } from './financial-analysis-outcome';

/** `id` de uma análise registada — derivado da união fechada, nunca `string` livre (correção pós-revisão, Fase 8.10). */
export type FinancialAnalysisId = FinancialAnalysisOutcome['id'];

/**
 * Diagnóstico determinístico da execução de `runFinancialAnalyses()` —
 * sem `processingTimeMs` nem qualquer valor não determinístico
 * (correção pós-revisão, Fase 8.10); telemetria de execução, caso
 * venha a ser necessária, pertence a infraestrutura externa, nunca a
 * este contrato.
 */
export interface FinancialAnalysisMetadata {
  /** ids de todas as análises corridas, incluindo as que devolveram `null`. */
  readonly analysesRun: readonly FinancialAnalysisId[];
  /** Quantas análises produziram conclusão (resultado não `null`). */
  readonly conclusionsProduced: number;
}

export interface FinancialAnalysisEngineOutput {
  results: FinancialAnalysisOutcome[];
  metadata: FinancialAnalysisMetadata;
}
