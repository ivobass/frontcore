import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import { PrismaService } from '@frontcore/database';
import type { Prisma } from '@frontcore/database';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { ListInvoiceDraftsDto } from './dto/list-invoice-drafts.dto';

const INVOICE_DRAFT_INCLUDE = {
  supplier: true,
  category: true,
  storageObject: {
    select: {
      id: true,
      filename: true,
      contentType: true,
      size: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InvoiceDraftInclude;

type InvoiceDraftWithRelations = Prisma.InvoiceDraftGetPayload<{
  include: typeof INVOICE_DRAFT_INCLUDE;
}>;

const PROMOTED_INVOICE_INCLUDE = {
  supplier: true,
  category: true,
  items: true,
} satisfies Prisma.InvoiceInclude;

type PromotedInvoice = Prisma.InvoiceGetPayload<{
  include: typeof PROMOTED_INVOICE_INCLUDE;
}>;

/**
 * CRUD de rascunhos de fatura (Fase 6.3) + promoção explícita a Invoice.
 * `InvoiceDraft` é uma entidade separada de `Invoice` — ver
 * `docs/phases/phase-6.3-invoice-draft-foundation.md` para a justificação
 * completa. Validação de posse do `StorageObject` é feita diretamente via
 * Prisma (não via `UploadsService.findOne()`), mesmo padrão já usado por
 * `InvoicesService` para validar `Supplier`/`ExpenseCategory` — evita o
 * efeito colateral de gerar um URL assinado só para confirmar existência.
 */
@Injectable()
export class InvoiceDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    dto: CreateInvoiceDraftDto,
  ): Promise<InvoiceDraftWithRelations> {
    await this.assertStorageObjectAvailable(organizationId, dto.storageObjectId);
    if (dto.supplierId) {
      await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    }
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }

    return this.prisma.invoiceDraft.create({
      data: {
        organizationId,
        storageObjectId: dto.storageObjectId,
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        totalAmount: dto.totalAmount,
        notes: dto.notes,
      },
      include: INVOICE_DRAFT_INCLUDE,
    });
  }

  async findAll(
    organizationId: string,
    query: ListInvoiceDraftsDto,
  ): Promise<Paginated<InvoiceDraftWithRelations>> {
    const { page, pageSize } = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const where: Prisma.InvoiceDraftWhereInput = {
      organizationId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.invoiceDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INVOICE_DRAFT_INCLUDE,
      }),
      this.prisma.invoiceDraft.count({ where }),
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
  ): Promise<InvoiceDraftWithRelations> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: { id, organizationId },
      include: INVOICE_DRAFT_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Rascunho de fatura não encontrado.');
    }
    return draft;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateInvoiceDraftDto,
  ): Promise<InvoiceDraftWithRelations> {
    await this.findOne(organizationId, id);

    if (dto.supplierId) {
      await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    }
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }

    return this.prisma.invoiceDraft.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        totalAmount: dto.totalAmount,
        notes: dto.notes,
      },
      include: INVOICE_DRAFT_INCLUDE,
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.invoiceDraft.delete({ where: { id } });
  }

  /**
   * Promove um rascunho a `Invoice` real: valida campos obrigatórios,
   * cria `Invoice` + `InvoiceAttachment` (mesmo `storageObjectId`) e só
   * depois apaga o `InvoiceDraft` — tudo numa única transação Prisma, para
   * nunca deixar uma `Invoice` parcial nem um `InvoiceAttachment` órfão se
   * um dos passos falhar.
   */
  async promote(organizationId: string, id: string): Promise<PromotedInvoice> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: { id, organizationId },
    });
    if (!draft) {
      throw new NotFoundException('Rascunho de fatura não encontrado.');
    }

    const missingFields: string[] = [];
    if (!draft.supplierId) missingFields.push('supplierId');
    if (!draft.issueDate) missingFields.push('issueDate');
    if (draft.totalAmount === null) missingFields.push('totalAmount');
    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Não é possível promover o rascunho: campos obrigatórios em falta (${missingFields.join(', ')}).`,
      );
    }

    // Revalida — o supplier/categoria podem ter deixado de pertencer à
    // organização entre a criação do draft e a promoção.
    await this.assertSupplierBelongsToOrg(organizationId, draft.supplierId!);
    if (draft.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, draft.categoryId);
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          supplierId: draft.supplierId!,
          categoryId: draft.categoryId,
          number: draft.number,
          issueDate: draft.issueDate!,
          dueDate: draft.dueDate,
          totalAmount: draft.totalAmount!,
          status: 'PENDING',
          notes: draft.notes,
          // Sem items: um Invoice sem InvoiceItem é válido ao nível do
          // schema (relação para-muitos, sem constraint de mínimo). A
          // obrigatoriedade de `items` em CreateInvoiceDto é validação do
          // endpoint POST /invoices, não usada aqui — a promoção cria a
          // Invoice diretamente via Prisma. Extração de linhas a partir
          // do draft é parsing fiscal avançado, fora do âmbito.
        },
        include: PROMOTED_INVOICE_INCLUDE,
      });

      await tx.invoiceAttachment.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          storageObjectId: draft.storageObjectId,
        },
      });

      await tx.invoiceDraft.delete({ where: { id: draft.id } });

      return invoice;
    });
  }

  private async assertStorageObjectAvailable(
    organizationId: string,
    storageObjectId: string,
  ): Promise<void> {
    const storageObject = await this.prisma.storageObject.findFirst({
      where: { id: storageObjectId, organizationId, key: { not: null } },
      select: { id: true },
    });
    if (!storageObject) {
      throw new NotFoundException('Objeto de storage não encontrado.');
    }

    const existingDraft = await this.prisma.invoiceDraft.findFirst({
      where: { storageObjectId },
      select: { id: true },
    });
    if (existingDraft) {
      throw new ConflictException(
        'Este objeto já está associado a um rascunho de fatura.',
      );
    }

    const existingAttachment = await this.prisma.invoiceAttachment.findFirst({
      where: { storageObjectId },
      select: { id: true },
    });
    if (existingAttachment) {
      throw new ConflictException(
        'Este objeto já está associado a uma fatura.',
      );
    }
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
