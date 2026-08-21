import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Fase 6.14: `position`/`unit`/`vatRate` aditivos e opcionais — `position` ausente usa a posição no array (índice + 1, ver `computeItemTotals()`), nunca quebra um pedido já existente sem estes campos. */
export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;
}
