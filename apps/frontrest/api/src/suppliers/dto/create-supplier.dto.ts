import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /**
   * NIF português: exatamente 9 dígitos, sem prefixo de país nem
   * espaços/hífens — quem chama a API normaliza antes de enviar (mesmo
   * padrão já usado no frontend, `normalizeTaxId()`). Só formato, sem
   * dígito de controlo (algoritmo de checksum do NIF): OCR real já
   * demonstrou produzir NIFs com o número errado de dígitos (achado
   * real, "Farmácia Esperança") — validar o formato previne essa classe
   * concreta de dado inválido; validar o checksum é um passo adicional
   * sem evidência de necessidade própria, fica por implementar.
   */
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
