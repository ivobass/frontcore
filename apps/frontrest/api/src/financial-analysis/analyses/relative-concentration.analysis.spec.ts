import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';
import { relativeConcentrationAnalysis } from './relative-concentration.analysis';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

describe('relativeConcentrationAnalysis', () => {
  it('devolve supplier_more_concentrated quando o share do fornecedor é maior', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '60.00' },
      categoryConcentration: { topN: 3, share: '40.00' },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)).toEqual({
      id: 'relative_concentration',
      conclusion: 'supplier_more_concentrated',
      evidence: { supplierShare: '60.00', supplierTopN: 3, categoryShare: '40.00', categoryTopN: 3 },
    });
  });

  it('devolve category_more_concentrated quando o share da categoria é maior', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '30.00' },
      categoryConcentration: { topN: 3, share: '70.00' },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)).toEqual({
      id: 'relative_concentration',
      conclusion: 'category_more_concentrated',
      evidence: { supplierShare: '30.00', supplierTopN: 3, categoryShare: '70.00', categoryTopN: 3 },
    });
  });

  it('devolve equally_concentrated quando os dois share são iguais', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '50.00' },
      categoryConcentration: { topN: 3, share: '50.00' },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)?.conclusion).toBe('equally_concentrated');
  });

  it('devolve null quando o share do fornecedor não existe (total zero)', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: null },
      categoryConcentration: { topN: 3, share: '70.00' },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)).toBeNull();
  });

  it('devolve null quando o share da categoria não existe (total zero)', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '70.00' },
      categoryConcentration: { topN: 3, share: null },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)).toBeNull();
  });

  it('devolve null quando os topN efetivos diferem (base não comparável)', () => {
    const insights = {
      ...buildEmptyFinancialInsights(PERIOD),
      supplierConcentration: { topN: 3, share: '60.00' },
      categoryConcentration: { topN: 2, share: '40.00' },
    };

    expect(relativeConcentrationAnalysis.analyze(insights)).toBeNull();
  });
});
