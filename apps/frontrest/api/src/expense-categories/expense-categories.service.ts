import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@frontcore/database';
import type { ExpenseCategory } from '@frontcore/database';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    dto: CreateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    try {
      return await this.prisma.expenseCategory.create({
        data: { ...dto, organizationId },
      });
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  findAll(organizationId: string): Promise<ExpenseCategory[]> {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string): Promise<ExpenseCategory> {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId },
    });
    if (!category) {
      throw new NotFoundException('Categoria de despesa não encontrada.');
    }
    return category;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.expenseCategory.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.expenseCategory.delete({ where: { id } });
  }

  private mapUniqueError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'Já existe uma categoria de despesa com este nome.',
      );
    }
    return error;
  }
}
