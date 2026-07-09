import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import { Prisma, PrismaService } from '@frontcore/database';
import type { Supplier } from '@frontcore/database';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.prisma.supplier.create({
      data: { ...dto, organizationId },
    });
  }

  async findAll(
    organizationId: string,
    query: ListSuppliersDto,
  ): Promise<Paginated<Supplier>> {
    const { page, pageSize } = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const where = {
      organizationId,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' as const },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(organizationId: string, id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return supplier;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    await this.findOne(organizationId, id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    try {
      await this.prisma.supplier.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Não é possível remover um fornecedor com faturas associadas.',
        );
      }
      throw error;
    }
  }
}
