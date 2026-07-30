import type { MonthlyTrendAnalysis, MonthlyTrendAnalysisResult } from '../analyses/monthly-trend.analysis';
import type {
  RelativeConcentrationAnalysis,
  RelativeConcentrationAnalysisResult,
} from '../analyses/relative-concentration.analysis';

/**
 * União fechada dos resultados possíveis do motor — cresce por adição
 * de membro quando uma nova análise for aprovada, nunca por
 * generalização para `string`/`unknown` (correção pós-revisão, Fase
 * 8.10). Cada membro mantém `id`, `conclusion` e `evidence` tipados em
 * conjunto (ver `FinancialAnalysisResult`, `contracts/`).
 */
export type FinancialAnalysisOutcome = MonthlyTrendAnalysisResult | RelativeConcentrationAnalysisResult;

/**
 * Conjunto fechado de análises **registadas e aprovadas** pelo motor
 * nesta fundação — nunca qualquer análise arbitrária que implemente o
 * contrato genérico `FinancialAnalysis` (correção pós-revisão, Fase
 * 8.10: nome anterior, `AnyFinancialAnalysis`, sugeria abertura que o
 * tipo nunca teve).
 */
export type RegisteredFinancialAnalysis = MonthlyTrendAnalysis | RelativeConcentrationAnalysis;
