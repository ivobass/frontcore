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
 */
export class UpdateInvoiceDraftDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
