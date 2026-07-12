import { Module } from '@nestjs/common';
import type { FiscalExtractor } from './contracts';
import { FISCAL_EXTRACTORS } from './fiscal-extractors.token';
import { FiscalParsingService } from './fiscal-parsing.service';
import {
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
} from './extractors';

// Única lista de classes de extractors — usada para `providers` e para
// `inject`, para as duas nunca poderem divergir em conteúdo ou ordem
// (o antigo desenho listava as mesmas 9 classes em 4 sítios — providers,
// parâmetros nomeados da factory, array de retorno da factory, inject —
// sem nada a impedir a ordem do `inject` de dessincronizar da ordem dos
// parâmetros da factory; o rest parameter abaixo elimina essa classe de
// erro por construção, já que só existe uma ordem possível).
const EXTRACTOR_CLASSES = [
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
] as const;

/**
 * Fundação do parsing fiscal (Fase 6.6): transforma texto OCR em dados
 * estruturados através de um pipeline de extractors determinísticos
 * (regex/heurísticas — sem IA). Cada extractor é um provider NestJS
 * independente, resolvido normalmente pelo container (preserva a
 * capacidade de um extractor futuro ter as suas próprias dependências
 * injetadas — ex. um cliente HTTP para um extractor de IA); a lista
 * completa é agregada sob o token `FISCAL_EXTRACTORS` e injetada como
 * um único array em `FiscalParsingService`. Adicionar um extractor novo
 * é: acrescentá-lo a `EXTRACTOR_CLASSES` — `providers`, `inject` e
 * `FiscalParsingService` não mudam.
 *
 * Importado por `InvoicesModule` desde a Fase 6.7 — primeiro consumidor
 * real é `InvoiceDraftsService.parseFiscalData()`, um endpoint síncrono
 * sob pedido, sem persistência. Ver
 * `docs/phases/phase-6.7-fiscal-parsing-draft-integration-foundation.md`.
 */
@Module({
  providers: [
    ...EXTRACTOR_CLASSES,
    {
      provide: FISCAL_EXTRACTORS,
      useFactory: (...extractors: FiscalExtractor<unknown>[]) => extractors,
      inject: [...EXTRACTOR_CLASSES],
    },
    FiscalParsingService,
  ],
  exports: [FiscalParsingService],
})
export class FiscalParsingModule {}
