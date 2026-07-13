import { Inject, Injectable, Logger } from '@nestjs/common';
import { runDocumentExtractors } from '../document-extraction';
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
 * Orquestra o pipeline de parsing fiscal: especialização de
 * `runDocumentExtractors()` (motor genérico, `document-extraction/`,
 * Fase 6.10) para `FiscalField`/`FiscalExtractionResult` — a resolução
 * de conflitos entre extractors (maior confiança vence; empate → ordem
 * de registo) e a agregação de metadata vivem no motor, não aqui; esta
 * classe só monta a forma final `FiscalExtractionResult` a partir do
 * `Map` genérico devolvido. Puramente determinístico hoje — sem IA, sem
 * I/O próprio (nenhuma dependência de Prisma/HTTP/fila); a mesma entrada
 * produz sempre a mesma saída, porque os 9 extractors injetados são
 * síncronos na lógica. Depende só do contrato `FiscalExtractor<T>` de
 * cada extractor injetado (via `FISCAL_EXTRACTORS`), nunca de uma
 * implementação concreta — trocar um extractor por uma versão melhor,
 * por país, ou por um extractor de IA, não obriga a tocar nesta classe.
 */
@Injectable()
export class FiscalParsingService {
  private readonly logger = new Logger(FiscalParsingService.name);

  constructor(@Inject(FISCAL_EXTRACTORS) private readonly extractors: FiscalExtractor<unknown>[]) {}

  /** Corre o pipeline completo sobre `ocrText` — nunca lança, campos não encontrados ficam `null`. */
  async parse(ocrText: string): Promise<FiscalExtractionResult> {
    const { matches, metadata } = await runDocumentExtractors<FiscalField>(this.extractors, ocrText);

    this.logger.debug(
      `Parsing fiscal concluído: ${matches.size}/${this.extractors.length} campos encontrados em ${metadata.processingTimeMs}ms.`,
    );

    return {
      ...this.assemble(matches),
      metadata,
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
