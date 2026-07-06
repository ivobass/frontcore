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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Roles('MANAGER')
  @Post()
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliersService.create(identity.organizationId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: ListSuppliersDto,
  ) {
    return this.suppliersService.findAll(identity.organizationId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.suppliersService.findOne(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Patch(':id')
  update(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(identity.organizationId, id, dto);
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.suppliersService.remove(identity.organizationId, id);
  }
}
