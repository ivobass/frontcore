import { Prisma } from '@frontcore/database';
import type { FinancialInsights } from '../../financial-insights/financial-insights.types';
import type { FinancialAnalysis, FinancialAnalysisResult } from '../contracts';

export type RelativeConcentrationConclusion =
  | 'supplier_more_concentrated'
  | 'category_more_concentrated'
  | 'equally_concentrated';

export interface RelativeConcentrationEvidence {
  supplierShare: string;
  supplierTopN: number;
  categoryShare: string;
  categoryTopN: number;
}

export type RelativeConcentrationAnalysisResult = FinancialAnalysisResult<
  'relative_concentration',
  RelativeConcentrationConclusion,
  RelativeConcentrationEvidence
>;

export type RelativeConcentrationAnalysis = FinancialAnalysis<
  'relative_concentration',
  RelativeConcentrationConclusion,
  RelativeConcentrationEvidence
>;

/**
 * Compara `supplierConcentration.share` com `categoryConcentration.share`
 * (Fase 8.9) — sem limiar, scoring ou severidade; só a grandeza
 * relativa entre os dois, via `Prisma.Decimal` (mesma disciplina de
 * `financial-insights.util.ts`), nunca `number` intermédio. Só produz
 * conclusão quando ambos os `share` existem (total do período
 * não-zero em ambos os eixos) e ambos os `topN` efetivos são iguais —
 * comparar "top 3 fornecedores" com "top 2 categorias" não seria uma
 * base comparável. `null` em qualquer outro caso.
 */
export const relativeConcentrationAnalysis: RelativeConcentrationAnalysis = {
  id: 'relative_concentration',
  analyze(insights: FinancialInsights): RelativeConcentrationAnalysisResult | null {
    const { supplierConcentration, categoryConcentration } = insights;
    if (
      supplierConcentration.share === null ||
      categoryConcentration.share === null ||
      supplierConcentration.topN !== categoryConcentration.topN
    ) {
      return null;
    }

    const supplierShare = new Prisma.Decimal(supplierConcentration.share);
    const categoryShare = new Prisma.Decimal(categoryConcentration.share);
    const comparedTo = supplierShare.comparedTo(categoryShare);
    const conclusion: RelativeConcentrationConclusion =
      comparedTo > 0 ? 'supplier_more_concentrated' : comparedTo < 0 ? 'category_more_concentrated' : 'equally_concentrated';

    return {
      id: 'relative_concentration',
      conclusion,
      evidence: {
        supplierShare: supplierConcentration.share,
        supplierTopN: supplierConcentration.topN,
        categoryShare: categoryConcentration.share,
        categoryTopN: categoryConcentration.topN,
      },
    };
  },
};
