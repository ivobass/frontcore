import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch, CustomerExtraction } from '../types';
import { FiscalField } from '../types';

const CUSTOMER_LABEL =
  /(?:cliente|bill\s*to|customer|sold\s*to|exmo\(?s?\)?\.?\s*sr\.?\(?s?\)?\.?)\s*[:.\-]\s*([^\n]{2,80})/i;

/**
 * Extrai o nome do cliente/destinatário (ex. "Cliente: Restaurante X").
 * Sem heurística de fallback — ao contrário do fornecedor, não há uma
 * posição típica no documento que identifique o cliente sem rótulo
 * explícito, por isso devolve `null` em vez de arriscar um falso positivo.
 */
@Injectable()
export class CustomerExtractor implements FiscalExtractor<CustomerExtraction> {
  readonly field = FiscalField.CUSTOMER;

  extract(ocrText: string): ExtractionMatch<CustomerExtraction> | null {
    const match = ocrText.match(CUSTOMER_LABEL);
    if (!match) {
      return null;
    }
    const name = match[1].trim();
    if (!name) {
      return null;
    }
    return { value: { name }, confidence: 85, source: match[0].trim() };
  }
}
