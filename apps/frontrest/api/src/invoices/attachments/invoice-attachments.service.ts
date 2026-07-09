import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@frontcore/database';
import { InvoicesService } from '../invoices.service';
import { UploadsService } from '../../uploads/uploads.service';
import type { UploadFileInput } from '../../uploads/uploads.service';

const ATTACHMENT_STORAGE_OBJECT_SELECT = {
  id: true,
  filename: true,
  contentType: true,
  size: true,
  createdAt: true,
} as const;

/**
 * Liga faturas a `StorageObject`s existentes — reutiliza `UploadsService`
 * integralmente (upload/download/eliminação); `StorageObject` continua
 * genérico, sem conhecimento de `Invoice`. Toda a lógica de domínio fica
 * aqui, não em `UploadsController`/`UploadsService`.
 */
@Injectable()
export class InvoiceAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(organizationId: string, invoiceId: string, input: UploadFileInput) {
    await this.invoicesService.findOne(organizationId, invoiceId);

    const storageObject = await this.uploadsService.create(organizationId, input);

    return this.prisma.invoiceAttachment.create({
      data: {
        organizationId,
        invoiceId,
        storageObjectId: storageObject.id,
      },
      include: { storageObject: { select: ATTACHMENT_STORAGE_OBJECT_SELECT } },
    });
  }

  async findAll(organizationId: string, invoiceId: string) {
    await this.invoicesService.findOne(organizationId, invoiceId);

    return this.prisma.invoiceAttachment.findMany({
      where: { organizationId, invoiceId },
      orderBy: { createdAt: 'desc' },
      include: { storageObject: { select: ATTACHMENT_STORAGE_OBJECT_SELECT } },
    });
  }

  async findOne(organizationId: string, invoiceId: string, attachmentId: string) {
    const attachment = await this.prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId, organizationId },
    });
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    const storageObject = await this.uploadsService.findOne(
      organizationId,
      attachment.storageObjectId,
    );
    return { ...storageObject, id: attachment.id, storageObjectId: attachment.storageObjectId };
  }

  async remove(organizationId: string, invoiceId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId, organizationId },
    });
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    await this.prisma.invoiceAttachment.delete({ where: { id: attachment.id } });
    await this.uploadsService.remove(organizationId, attachment.storageObjectId);
  }
}
