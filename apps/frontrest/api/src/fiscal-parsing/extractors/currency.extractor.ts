import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';

const CURRENCY_LABEL = /(?:moeda|currency)\s*[:.\-]?\s*([A-Z]{3})\b/i;

const SYMBOL_TO_ISO: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP' };

/**
 * Extrai a moeda do documento — rótulo explícito ("Moeda: EUR") tem
 * prioridade; sem rótulo, cai para o primeiro símbolo monetário
 * encontrado (€/$/£), com confiança mais baixa por ser inferido.
 */
@Injectable()
export class CurrencyExtractor implements FiscalExtractor<string> {
  readonly field = FiscalField.CURRENCY;

  async extract(ocrText: string): Promise<ExtractionMatch<string> | null> {
    const labelMatch = ocrText.match(CURRENCY_LABEL);
    if (labelMatch) {
      return { value: labelMatch[1].toUpperCase(), confidence: 85, source: labelMatch[0].trim() };
    }

    for (const [symbol, iso] of Object.entries(SYMBOL_TO_ISO)) {
      const index = ocrText.indexOf(symbol);
      if (index !== -1) {
        return { value: iso, confidence: 50, source: symbol };
      }
    }

    return null;
  }
}
