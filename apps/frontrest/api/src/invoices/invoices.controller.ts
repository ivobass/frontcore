import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedIdentity } from '@frontcore/auth';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Roles('MANAGER')
  @Post()
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(identity.organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: ListInvoicesDto,
  ) {
    return this.invoicesService.findAll(identity.organizationId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoicesService.findOne(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Patch(':id')
  update(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(identity.organizationId, id, dto);
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.invoicesService.remove(identity.organizationId, id);
  }
}
