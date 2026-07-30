import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';
import type { TrendComparison } from '../../financial-insights/financial-insights.types';
import { monthlyTrendAnalysis } from './monthly-trend.analysis';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

function buildComparison(direction: 'increase' | 'decrease' | 'unchanged'): TrendComparison {
  return {
    current: '1200.00',
    previous: '1000.00',
    absoluteChange: '200.00',
    percentageChange: '20.00',
    direction,
  };
}

describe('monthlyTrendAnalysis', () => {
  it('devolve null quando não existe comparação válida (menos de 2 meses com dados)', () => {
    const insights = buildEmptyFinancialInsights(PERIOD);
    expect(monthlyTrendAnalysis.analyze(insights)).toBeNull();
  });

  it.each(['increase', 'decrease', 'unchanged'] as const)(
    'devolve %s reutilizando exclusivamente o TrendComparison como evidência',
    (direction) => {
      const comparison = buildComparison(direction);
      const insights = {
        ...buildEmptyFinancialInsights(PERIOD),
        trend: { latestMonth: '2026-07', previousMonth: '2026-06', comparison, direction },
      };

      expect(monthlyTrendAnalysis.analyze(insights)).toEqual({
        id: 'monthly_trend',
        conclusion: direction,
        evidence: comparison,
      });
    },
  );
});
