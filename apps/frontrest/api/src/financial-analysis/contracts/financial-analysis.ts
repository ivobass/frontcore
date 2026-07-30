import type { FinancialInsights } from '../../financial-insights/financial-insights.types';

/**
 * Uma conclusão financeira e a evidência estruturada que a sustenta —
 * nunca texto livre. `TId` identifica a análise que produziu o
 * resultado (discriminador da união fechada `FinancialAnalysisOutcome`,
 * `types/financial-analysis-outcome.ts`), nunca uma `string` livre.
 */
export interface FinancialAnalysisResult<TId extends string, TConclusion extends string, TEvidence> {
  readonly id: TId;
  readonly conclusion: TConclusion;
  readonly evidence: TEvidence;
}

/**
 * Contrato genérico de uma análise financeira (Fase 8.10) — função pura
 * e síncrona sobre o `FinancialInsights` já produzido por
 * `financial-insights/` (Fase 8.9); nunca acede a Prisma, nunca
 * recalcula um facto ou introduz uma nova métrica/agregação/query.
 * `null` significa "não aplicável" (dados insuficientes ou não
 * comparáveis), nunca uma conclusão fabricada.
 *
 * Divergência deliberada face a `DocumentExtractor`
 * (`document-extraction/`, ADR-0007): ali `extract()` é `async` para
 * preparar I/O futuro (um extractor de IA); aqui não há I/O nem
 * geração por LLM nesta fundação, logo `analyze()` é síncrono. Ali o
 * motor resolve conflitos entre extractors que competem pelo mesmo
 * campo; aqui cada análise tem o seu próprio `id`, nunca compete com
 * outra pelo mesmo resultado — o motor (`financial-analysis.engine.ts`)
 * não precisa de resolução de conflitos.
 */
export interface FinancialAnalysis<TId extends string, TConclusion extends string, TEvidence> {
  readonly id: TId;
  analyze(insights: FinancialInsights): FinancialAnalysisResult<TId, TConclusion, TEvidence> | null;
}
