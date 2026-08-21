import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedIdentity } from '@frontcore/auth';
import { InvoiceDraftsService } from './invoice-drafts.service';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { ListInvoiceDraftsDto } from './dto/list-invoice-drafts.dto';
import { ReplaceInvoiceDraftItemsDto } from './dto/invoice-draft-item.dto';
import { SaveInvoiceDraftReviewDto } from './dto/save-invoice-draft-review.dto';

/**
 * Registado antes de `InvoicesController` em `invoices.module.ts` — a
 * rota estática `GET /invoices/drafts` teria de perder para
 * `GET /invoices/:id` (id="drafts") se a ordem fosse invertida, já que o
 * Express resolve rotas sobrepostas pela ordem de registo, não pela
 * especificidade.
 */
@Controller('invoices/drafts')
export class InvoiceDraftsController {
  constructor(private readonly invoiceDraftsService: InvoiceDraftsService) {}

  @Roles('MANAGER')
  @Post()
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: CreateInvoiceDraftDto,
  ) {
    return this.invoiceDraftsService.create(identity.organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: ListInvoiceDraftsDto,
  ) {
    return this.invoiceDraftsService.findAll(identity.organizationId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoiceDraftsService.findOne(identity.organizationId, id);
  }

  /**
   * Fase 6.7 — parsing fiscal síncrono sob pedido, sem persistência.
   * Rota com um segmento extra face a `GET :id`, sem colisão de rota
   * possível (Express só despacha `:id` para caminhos de um segmento).
   */
  @Get(':id/fiscal-parsing')
  parseFiscalData(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoiceDraftsService.parseFiscalData(identity.organizationId, id);
  }

  /**
   * Fase 6.14 — parsing fiscal determinístico + extração por IA
   * (`AiInvoiceExtractor`) reconciliados; persiste linhas
   * (`InvoiceDraftItem`, se `itemsReviewedByHuman` ainda for `false`) e
   * metadata da chamada de IA. Mutação (nunca idempotente ao nível dos
   * items — cada chamada pode substituir linhas ainda não revistas),
   * por isso `MANAGER+`, ao contrário de `GET :id/fiscal-parsing`.
   */
  @Roles('MANAGER')
  @Post(':id/ai-extraction')
  runAiExtraction(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoiceDraftsService.runAiExtraction(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Patch(':id')
  update(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
  ) {
    return this.invoiceDraftsService.update(identity.organizationId, id, dto);
  }

  /**
   * Correção pós-revisão Codex (achado 9) — grava cabeçalho + linhas
   * numa única transação, para a UI de revisão nunca ficar com um
   * sucesso parcial não refletido honestamente (`PATCH :id` e `PUT
   * :id/items` continuam disponíveis, sem alterações, para outros
   * consumidores).
   */
  @Roles('MANAGER')
  @Patch(':id/review')
  saveReview(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: SaveInvoiceDraftReviewDto,
  ) {
    return this.invoiceDraftsService.saveReview(identity.organizationId, id, dto);
  }

  /**
   * Fase 6.14 — substituição integral das linhas do rascunho
   * (editar/adicionar/eliminar/reordenar, tudo via o array completo).
   * `PUT`, não `PATCH` — semântica de substituir a coleção inteira,
   * nunca uma atualização parcial de uma linha.
   */
  @Roles('MANAGER')
  @Put(':id/items')
  replaceItems(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: ReplaceInvoiceDraftItemsDto,
  ) {
    return this.invoiceDraftsService.replaceItems(identity.organizationId, id, dto.items);
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoiceDraftsService.remove(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Post(':id/promote')
  promote(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoiceDraftsService.promote(identity.organizationId, id);
  }
}
