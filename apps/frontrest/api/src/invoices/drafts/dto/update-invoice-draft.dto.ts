import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * `storageObjectId` propositadamente ausente — imutável depois da
 * criação do rascunho (decisão da Fase 6.3). Com `forbidNonWhitelisted`
 * ativo globalmente, tentar enviá-lo devolve 400 em vez de o ignorar em
 * silêncio.
 *
 * Todos os campos aceitam `T | null | undefined` (Fase 6.8) —
 * `@IsOptional()` do `class-validator` já ignora todos os validadores
 * seguintes quando o valor é `null` ou `undefined` (confirmado
 * empiricamente, não só por leitura da documentação), por isso nenhum
 * decorator muda aqui. Só o tipo declarado estava desatualizado face ao
 * comportamento real: `undefined` (campo ausente) → não altera;
 * `null` → limpa o campo; valor → atualiza. Ver
 * `InvoiceDraftsService.update()` para onde essa distinção é aplicada.
 */
export class UpdateInvoiceDraftDto {
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  number?: string | null;

  @IsOptional()
  @IsDateString()
  issueDate?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  totalAmount?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
