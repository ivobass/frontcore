import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import type { Prisma } from '@frontcore/database';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import type { InvoiceItemDto } from './dto/invoice-item.dto';

const INVOICE_INCLUDE = {
  supplier: true,
  category: true,
  items: true,
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

function computeItemTotals(items: InvoiceItemDto[]) {
  return items.map((item) => {
    const quantity = item.quantity ?? 1;
    const totalPrice = Number((quantity * item.unitPrice).toFixed(2));
    return {
      description: item.description,
      quantity,
      unitPrice: item.unitPrice,
      totalPrice,
    };
  });
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceWithRelations> {
    await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }

    const items = computeItemTotals(dto.items);
    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    return this.prisma.invoice.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        number: dto.number,
        issueDate: new Date(dto.issueDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        notes: dto.notes,
        totalAmount,
        items: { create: items },
      },
      include: INVOICE_INCLUDE,
    });
  }

  async findAll(
    organizationId: string,
    query: ListInvoicesDto,
  ): Promise<Paginated<InvoiceWithRelations>> {
    const { page, pageSize } = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INVOICE_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada.');
    }
    return invoice;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceWithRelations> {
    await this.findOne(organizationId, id);

    if (dto.supplierId) {
      await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    }
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }

    const items = dto.items ? computeItemTotals(dto.items) : undefined;
    const totalAmount = items
      ? items.reduce((sum, item) => sum + item.totalPrice, 0)
      : undefined;

    return this.prisma.invoice.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        notes: dto.notes,
        ...(totalAmount !== undefined ? { totalAmount } : {}),
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include: INVOICE_INCLUDE,
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.invoice.delete({ where: { id } });
  }

  private async assertSupplierBelongsToOrg(
    organizationId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
  }

  private async assertCategoryBelongsToOrg(
    organizationId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Categoria de despesa não encontrada.');
    }
  }
}
