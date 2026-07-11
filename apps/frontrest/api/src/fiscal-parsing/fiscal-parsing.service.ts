import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FiscalExtractor } from './contracts';
import { FISCAL_EXTRACTORS } from './fiscal-extractors.token';
import type {
  ExtractionMatch,
  FiscalExtractionResult,
  SupplierExtraction,
  CustomerExtraction,
  InvoiceExtraction,
  TotalsExtraction,
  VatExtraction,
} from './types';
import { FiscalField } from './types';
import { aggregateConfidence } from './utils';

type AssembledResult = Omit<FiscalExtractionResult, 'metadata'>;

/**
 * Orquestra o pipeline de parsing fiscal: corre cada `FiscalExtractor`
 * de forma independente sobre o mesmo texto OCR e monta o resultado
 * normalizado. Puramente determinístico — sem IA, sem I/O (nenhuma
 * dependência de Prisma/HTTP/fila); a mesma entrada produz sempre a
 * mesma saída. Depende só do contrato `FiscalExtractor<T>` de cada
 * extractor injetado (via `FISCAL_EXTRACTORS`), nunca de uma
 * implementação concreta — trocar um extractor por uma versão melhor
 * (ou por país) não obriga a tocar nesta classe.
 *
 * Se mais do que um extractor devolver um match para o mesmo campo (ex.
 * dois candidatos por país a competir por `SUPPLIER_TAX_ID`), vence o de
 * maior confiança — nunca "o último a correr". Em empate exato de
 * confiança, vence o primeiro a ser registado em `FISCAL_EXTRACTORS`
 * (regra determinística, coberta por teste — não pretende ser "melhor"
 * do que a alternativa, só previsível).
 */
@Injectable()
export class FiscalParsingService {
  private readonly logger = new Logger(FiscalParsingService.name);

  constructor(@Inject(FISCAL_EXTRACTORS) private readonly extractors: FiscalExtractor<unknown>[]) {}

  /** Corre o pipeline completo sobre `ocrText` — nunca lança, campos não encontrados ficam `null`. */
  parse(ocrText: string): FiscalExtractionResult {
    const startedAt = Date.now();
    const matches = new Map<FiscalField, ExtractionMatch<unknown>>();

    for (const extractor of this.extractors) {
      const match = extractor.extract(ocrText);
      if (!match) {
        continue;
      }
      const existing = matches.get(extractor.field);
      if (!existing || match.confidence > existing.confidence) {
        matches.set(extractor.field, match);
      }
    }

    const processingTimeMs = Date.now() - startedAt;
    this.logger.debug(
      `Parsing fiscal concluído: ${matches.size}/${this.extractors.length} campos encontrados em ${processingTimeMs}ms.`,
    );

    return {
      ...this.assemble(matches),
      metadata: {
        extractorsRun: this.extractors.map((extractor) => extractor.field),
        fieldsFound: [...matches.keys()],
        processingTimeMs,
        textLength: ocrText.length,
      },
    };
  }

  private assemble(matches: Map<FiscalField, ExtractionMatch<unknown>>): AssembledResult {
    const invoice: InvoiceExtraction = {
      number: this.get<string>(matches, FiscalField.INVOICE_NUMBER),
      issueDate: this.get<Date>(matches, FiscalField.INVOICE_DATE),
      dueDate: this.get<Date>(matches, FiscalField.DUE_DATE),
      currency: this.get<string>(matches, FiscalField.CURRENCY),
    };

    return {
      supplier: this.get<SupplierExtraction>(matches, FiscalField.SUPPLIER),
      supplierTaxId: this.get<string>(matches, FiscalField.SUPPLIER_TAX_ID),
      customer: this.get<CustomerExtraction>(matches, FiscalField.CUSTOMER),
      invoice,
      totals: this.get<TotalsExtraction>(matches, FiscalField.TOTALS),
      vat: this.get<VatExtraction>(matches, FiscalField.VAT),
      confidence: aggregateConfidence([...matches.values()]),
    };
  }

  // O cast interno confia que cada extractor regista o `field` (enum)
  // correspondente ao `T` que ele próprio produz — garantido pela
  // convenção de implementação de `FiscalExtractor<T>` e coberto pelos
  // testes de cada extractor, não pelo compilador (o `Map` é
  // necessariamente homogéneo em `FiscalField`, heterogéneo em `T`).
  private get<T>(
    matches: Map<FiscalField, ExtractionMatch<unknown>>,
    field: FiscalField,
  ): ExtractionMatch<T> | null {
    return (matches.get(field) as ExtractionMatch<T> | undefined) ?? null;
  }
}
