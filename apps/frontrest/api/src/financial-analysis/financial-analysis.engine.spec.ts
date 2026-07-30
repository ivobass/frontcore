import { buildEmptyFinancialInsights } from '../financial-insights/financial-insights.test-fixtures';
import { monthlyTrendAnalysis } from './analyses/monthly-trend.analysis';
import { relativeConcentrationAnalysis } from './analyses/relative-concentration.analysis';
import { runFinancialAnalyses } from './financial-analysis.engine';
import type { RegisteredFinancialAnalysis } from './types';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };
const ANALYSES: RegisteredFinancialAnalysis[] = [monthlyTrendAnalysis, relativeConcentrationAnalysis];

describe('runFinancialAnalyses', () => {
  it('agrega só as conclusões não nulas e regista a metadata correta quando uma análise não é aplicável', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '60.00' },
      categoryConcentration: { topN: 3, share: '40.00' },
    };

    const output = runFinancialAnalyses(ANALYSES, insights);

    expect(output.results).toEqual([
      {
        id: 'relative_concentration',
        conclusion: 'supplier_more_concentrated',
        evidence: { supplierShare: '60.00', supplierTopN: 3, categoryShare: '40.00', categoryTopN: 3 },
      },
    ]);
    expect(output.metadata).toEqual({
      analysesRun: ['monthly_trend', 'relative_concentration'],
      conclusionsProduced: 1,
    });
  });

  it('agrega ambas as conclusões quando ambas as análises são aplicáveis', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      trend: {
        latestMonth: '2026-07',
        previousMonth: '2026-06',
        comparison: {
          current: '1200.00',
          previous: '1000.00',
          absoluteChange: '200.00',
          percentageChange: '20.00',
          direction: 'increase' as const,
        },
        direction: 'increase' as const,
      },
      supplierConcentration: { topN: 3, share: '60.00' },
      categoryConcentration: { topN: 3, share: '40.00' },
    };

    const output = runFinancialAnalyses(ANALYSES, insights);

    expect(output.results.map((result) => result.id)).toEqual(['monthly_trend', 'relative_concentration']);
    expect(output.metadata).toEqual({
      analysesRun: ['monthly_trend', 'relative_concentration'],
      conclusionsProduced: 2,
    });
  });

  it('não expõe processingTimeMs nem qualquer campo não determinístico na metadata', () => {
    const output = runFinancialAnalyses(ANALYSES, buildEmptyFinancialInsights(PERIOD));
    expect(Object.keys(output.metadata).sort()).toEqual(['analysesRun', 'conclusionsProduced']);
  });

  it('é determinístico — o mesmo input produz sempre o mesmo output', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '60.00' },
      categoryConcentration: { topN: 3, share: '40.00' },
    };

    const first = runFinancialAnalyses(ANALYSES, insights);
    const second = runFinancialAnalyses(ANALYSES, insights);

    expect(first).toEqual(second);
  });
});
