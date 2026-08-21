import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

/**
 * Uma linha de `InvoiceDraftItem` (Fase 6.14) — todos os campos exceto
 * `description` são opcionais/aceitam `null` (`@IsOptional()` do
 * `class-validator` ignora os validadores seguintes tanto para `null`
 * como para `undefined`, mesmo comportamento já confirmado em
 * `UpdateInvoiceDraftDto`): um documento real raramente tem todos os
 * detalhes de uma linha legíveis, e a UI de revisão precisa de poder
 * guardar uma linha parcialmente preenchida.
 */
export class InvoiceDraftItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number | null;
}

/**
 * Substituição integral das linhas de um `InvoiceDraft` — mesma
 * disciplina "replace-all" já usada por `InvoicesService.update()`
 * (`items: { deleteMany, create }`), nunca um PATCH incremental por
 * linha: cobre editar/adicionar/eliminar/reordenar com uma única
 * operação, sempre consistente com o array completo que a UI já mantém
 * em memória. `position` ausente numa linha usa o índice no array (ver
 * `InvoiceDraftsService.replaceItems()`).
 */
export class ReplaceInvoiceDraftItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceDraftItemDto)
  items!: InvoiceDraftItemDto[];
}
