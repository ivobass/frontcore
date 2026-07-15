import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** Mesma regra de `CreateSupplierDto.taxId` — ver esse ficheiro para a justificação completa. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'NIF deve conter exatamente 9 dígitos.' })
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
