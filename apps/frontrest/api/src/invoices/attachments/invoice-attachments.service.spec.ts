import { NotFoundException } from '@nestjs/common';
import { InvoiceAttachmentsService } from './invoice-attachments.service';

function createMockPrisma() {
  return {
    invoiceAttachment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function createMockInvoicesService() {
  return {
    findOne: jest.fn(),
  };
}

function createMockUploadsService() {
  return {
    create: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
}

describe('InvoiceAttachmentsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let invoicesService: ReturnType<typeof createMockInvoicesService>;
  let uploadsService: ReturnType<typeof createMockUploadsService>;
  let service: InvoiceAttachmentsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    invoicesService = createMockInvoicesService();
    uploadsService = createMockUploadsService();
    service = new InvoiceAttachmentsService(
      prisma as never,
      invoicesService as never,
      uploadsService as never,
    );
  });

  describe('create', () => {
    it('confirma a fatura, reutiliza uploadsService.create() e liga o StorageObject à fatura', async () => {
      invoicesService.findOne.mockResolvedValue({ id: 'inv-1' });
      uploadsService.create.mockResolvedValue({ id: 'obj-1', key: 'organizations/org-1/uploads/obj-1' });
      prisma.invoiceAttachment.create.mockResolvedValue({
        id: 'att-1',
        invoiceId: 'inv-1',
        storageObjectId: 'obj-1',
      });

      const input = { buffer: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf', size: 1 };
      const result = await service.create('org-1', 'inv-1', input);

      expect(invoicesService.findOne).toHaveBeenCalledWith('org-1', 'inv-1');
      expect(uploadsService.create).toHaveBeenCalledWith('org-1', input);
      expect(prisma.invoiceAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: 'org-1', invoiceId: 'inv-1', storageObjectId: 'obj-1' },
        }),
      );
      expect(result.id).toBe('att-1');
    });

    it('propaga NotFoundException quando a fatura não pertence à organização, sem chamar uploadsService', async () => {
      invoicesService.findOne.mockRejectedValue(new NotFoundException('Fatura não encontrada.'));

      await expect(
        service.create('org-1', 'inv-x', {
          buffer: Buffer.from('x'),
          filename: 'a.pdf',
          contentType: 'application/pdf',
          size: 1,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(uploadsService.create).not.toHaveBeenCalled();
      expect(prisma.invoiceAttachment.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('confirma a fatura e lista os anexos com metadados do StorageObject', async () => {
      invoicesService.findOne.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.findMany.mockResolvedValue([{ id: 'att-1' }]);

      const result = await service.findAll('org-1', 'inv-1');

      expect(invoicesService.findOne).toHaveBeenCalledWith('org-1', 'inv-1');
      expect(prisma.invoiceAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', invoiceId: 'inv-1' } }),
      );
      expect(result).toEqual([{ id: 'att-1' }]);
    });
  });

  describe('findOne', () => {
    it('reutiliza uploadsService.findOne() e devolve o id do anexo, não do StorageObject', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        storageObjectId: 'obj-1',
      });
      uploadsService.findOne.mockResolvedValue({
        id: 'obj-1',
        filename: 'a.pdf',
        downloadUrl: 'https://signed.example/obj-1',
      });

      const result = await service.findOne('org-1', 'inv-1', 'att-1');

      expect(uploadsService.findOne).toHaveBeenCalledWith('org-1', 'obj-1');
      expect(result.id).toBe('att-1');
      expect(result.storageObjectId).toBe('obj-1');
      expect(result.downloadUrl).toBe('https://signed.example/obj-1');
    });

    it('lança NotFoundException sem chamar uploadsService quando o anexo não existe', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'inv-1', 'att-x')).rejects.toThrow(NotFoundException);
      expect(uploadsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('apaga o InvoiceAttachment antes de reutilizar uploadsService.remove()', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        storageObjectId: 'obj-1',
      });

      await service.remove('org-1', 'inv-1', 'att-1');

      expect(prisma.invoiceAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(uploadsService.remove).toHaveBeenCalledWith('org-1', 'obj-1');
    });

    it('lança NotFoundException sem tocar em nada quando o anexo não existe', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'inv-1', 'att-x')).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceAttachment.delete).not.toHaveBeenCalled();
      expect(uploadsService.remove).not.toHaveBeenCalled();
    });
  });
});
