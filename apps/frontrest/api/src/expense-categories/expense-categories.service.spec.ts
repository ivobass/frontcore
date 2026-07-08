import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import { ExpenseCategoriesService } from './expense-categories.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('erro simulado', {
    code,
    clientVersion: '5.22.0',
  });
}

describe('ExpenseCategoriesService', () => {
  let service: ExpenseCategoriesService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new ExpenseCategoriesService(prisma as never);
  });

  describe('create', () => {
    it('associa a categoria à organização da identidade', async () => {
      prisma.expenseCategory.create.mockResolvedValue({ id: 'c1', name: 'Renda' });

      const result = await service.create('org-1', { name: 'Renda' });

      expect(prisma.expenseCategory.create).toHaveBeenCalledWith({
        data: { name: 'Renda', organizationId: 'org-1' },
      });
      expect(result.name).toBe('Renda');
    });

    it('mapeia o erro P2002 (nome duplicado na organização) para ConflictException', async () => {
      prisma.expenseCategory.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create('org-1', { name: 'Renda' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('não mapeia outros códigos de erro Prisma para ConflictException', async () => {
      prisma.expenseCategory.create.mockRejectedValue(prismaError('P2025'));

      await expect(service.create('org-1', { name: 'Renda' })).rejects.not.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('devolve um array simples (sem paginação), ordenado por nome', async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await service.findAll('org-1');

      expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { name: 'asc' },
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não pertence à organização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('confirma pertença à organização antes de atualizar', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'c1', organizationId: 'org-1' });
      prisma.expenseCategory.update.mockResolvedValue({ id: 'c1', name: 'Novo nome' });

      await service.update('org-1', 'c1', { name: 'Novo nome' });

      expect(prisma.expenseCategory.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Novo nome' },
      });
    });

    it('mapeia o erro P2002 também na atualização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'c1', organizationId: 'org-1' });
      prisma.expenseCategory.update.mockRejectedValue(prismaError('P2002'));

      await expect(service.update('org-1', 'c1', { name: 'dup' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('elimina depois de confirmar pertença à organização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'c1', organizationId: 'org-1' });
      prisma.expenseCategory.delete.mockResolvedValue(undefined);

      await service.remove('org-1', 'c1');

      expect(prisma.expenseCategory.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('lança NotFoundException sem tentar eliminar quando não pertence à organização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'c1')).rejects.toThrow(NotFoundException);
      expect(prisma.expenseCategory.delete).not.toHaveBeenCalled();
    });
  });
});
