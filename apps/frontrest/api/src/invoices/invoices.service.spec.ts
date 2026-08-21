import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new InvoicesService(prisma as never);
    // Por omissão, fornecedor e categoria pertencem à organização —
    // os testes que querem o caso contrário sobrescrevem explicitamente.
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', organizationId: 'org-1' });
  });

  describe('create', () => {
    it('calcula totalPrice por linha e totalAmount da fatura', async () => {
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

      await service.create('org-1', {
        supplierId: 'sup-1',
        categoryId: 'cat-1',
        issueDate: '2026-07-01',
        items: [
          { description: 'Item A', quantity: 2, unitPrice: 10 },
          { description: 'Item B', unitPrice: 5 },
        ],
      });

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            totalAmount: 25,
            items: {
              create: [
                {
                  description: 'Item A',
                  position: 1,
                  quantity: 2,
                  unit: undefined,
                  unitPrice: 10,
                  vatRate: undefined,
                  totalPrice: 20,
                },
                {
                  description: 'Item B',
                  position: 2,
                  quantity: 1,
                  unit: undefined,
                  unitPrice: 5,
                  vatRate: undefined,
                  totalPrice: 5,
                },
              ],
            },
          }),
        }),
      );
    });

    it('lança NotFoundException quando o fornecedor não pertence à organização', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', {
          supplierId: 'sup-x',
          issueDate: '2026-07-01',
          items: [{ description: 'x', unitPrice: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando a categoria não pertence à organização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', {
          supplierId: 'sup-1',
          categoryId: 'cat-x',
          issueDate: '2026-07-01',
          items: [{ description: 'x', unitPrice: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('inclui organizationId sempre, mesmo sem filtros', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      await service.findAll('org-1', {});

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('filtra por status e supplierId quando fornecidos', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      await service.findAll('org-1', { status: 'PAID', supplierId: 'sup-1' });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', supplierId: 'sup-1', status: 'PAID' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não encontrada na organização', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'inv-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('substitui as linhas quando items é fornecido (deleteMany + create)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', organizationId: 'org-1' });
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });

      await service.update('org-1', 'inv-1', {
        items: [{ description: 'Novo', unitPrice: 3 }],
      });

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 3,
            items: {
              deleteMany: {},
              create: [
                {
                  description: 'Novo',
                  position: 1,
                  quantity: 1,
                  unit: undefined,
                  unitPrice: 3,
                  vatRate: undefined,
                  totalPrice: 3,
                },
              ],
            },
          }),
        }),
      );
    });

    it('não toca nas linhas nem no total quando items não é fornecido', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', organizationId: 'org-1' });
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });

      await service.update('org-1', 'inv-1', { notes: 'Atualizado' });

      const call = prisma.invoice.update.mock.calls[0][0];
      expect(call.data.items).toBeUndefined();
      expect(call.data.totalAmount).toBeUndefined();
    });

    it('lança NotFoundException sem chamar update quando a fatura não pertence à organização', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.update('org-1', 'inv-1', { notes: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('confirma pertença à organização antes de eliminar', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'inv-1')).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('elimina quando a fatura pertence à organização', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', organizationId: 'org-1' });
      prisma.invoice.delete.mockResolvedValue(undefined);

      await service.remove('org-1', 'inv-1');

      expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv-1' } });
    });
  });
});
