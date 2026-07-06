import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedIdentity } from '@frontcore/auth';
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
  ) {}

  @Roles('MANAGER')
  @Post()
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return this.expenseCategoriesService.create(identity.organizationId, dto);
  }

  @Get()
  findAll(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.expenseCategoriesService.findAll(identity.organizationId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.expenseCategoriesService.findOne(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Patch(':id')
  update(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expenseCategoriesService.update(
      identity.organizationId,
      id,
      dto,
    );
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.expenseCategoriesService.remove(identity.organizationId, id);
  }
}
