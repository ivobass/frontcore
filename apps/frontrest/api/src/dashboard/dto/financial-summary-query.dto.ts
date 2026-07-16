import { IsDateString, IsOptional } from 'class-validator';

/**
 * `@IsDateString()` já rejeita formato errado (ex. "15-07-2026",
 * "2026-7-5") — confirmado empiricamente (Fase 7). Não valida
 * validade de calendário (aceita "2026-02-30") nem `from > to` —
 * essas duas verificações semânticas vivem em `resolvePeriod()`
 * (`period.util.ts`), não aqui, porque cruzam os dois campos.
 */
export class FinancialSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
