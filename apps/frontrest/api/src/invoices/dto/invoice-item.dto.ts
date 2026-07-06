import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
