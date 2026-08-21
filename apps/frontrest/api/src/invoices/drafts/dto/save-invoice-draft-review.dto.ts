import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { UpdateInvoiceDraftDto } from './update-invoice-draft.dto';
import { InvoiceDraftItemDto } from './invoice-draft-item.dto';

/**
 * Correção pós-revisão Codex (achado 9, MÉDIO) — a UI de revisão
 * (`invoice-draft-review-sheet.tsx`) guardava o cabeçalho (`PATCH
 * :id`) e as linhas (`PUT :id/items`) como dois pedidos HTTP
 * independentes: se o primeiro tivesse sucesso e o segundo falhasse,
 * ficava um sucesso parcial nunca refletido honestamente ao utilizador
 * (o cabeçalho persistia no servidor, mas a UI local nunca aplicava
 * esse resultado, e a mensagem de erro não distinguia esse caso de
 * "nada foi guardado"). Este DTO alimenta `PATCH :id/review`
 * (`InvoiceDraftsService.saveReview()`), que grava cabeçalho + linhas
 * dentro da MESMA transação Prisma — os dois pedidos antigos (`PATCH
 * :id`, `PUT :id/items`) continuam disponíveis sem alterações (nenhum
 * consumidor existente parte), esta rota é só a forma atómica
 * preferida para a UI de revisão a partir de agora. Ambos os campos são
 * opcionais — a UI só envia o que realmente mudou desde o último save
 * (mesma disciplina de `buildPatch()` no frontend), mas pelo menos um
 * dos dois deve estar presente (validado no serviço, nunca aqui — não
 * há decorator de "pelo menos um destes campos" simples e correto no
 * `class-validator`).
 */
export class SaveInvoiceDraftReviewDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateInvoiceDraftDto)
  patch?: UpdateInvoiceDraftDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceDraftItemDto)
  items?: InvoiceDraftItemDto[];
}
