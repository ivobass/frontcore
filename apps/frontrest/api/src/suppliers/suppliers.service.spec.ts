import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import { SuppliersService } from './suppliers.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('erro simulado', {
    code,
    clientVersion: '5.22.0',
  });
}

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new SuppliersService(prisma as never);
  });

  describe('create', () => {
    it('associa o fornecedor à organização da identidade', async () => {
      prisma.supplier.create.mockResolvedValue({ id: 's1', name: 'Acme' });

      const result = await service.create('org-1', { name: 'Acme' });

      expect(prisma.supplier.create).toHaveBeenCalledWith({
        data: { name: 'Acme', organizationId: 'org-1' },
      });
      expect(result).toEqual({ id: 's1', name: 'Acme' });
    });
  });

  describe('findAll', () => {
    it('aplica paginação por omissão e devolve o envelope paginado', async () => {
      prisma.supplier.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.supplier.count.mockResolvedValue(1);

      const result = await service.findAll('org-1', {});

      expect(prisma.supplier.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [{ id: 's1' }],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('filtra por nome quando `search` é fornecido', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.count.mockResolvedValue(0);

      await service.findAll('org-1', { search: 'acme' });

      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            name: { contains: 'acme', mode: 'insensitive' },
          },
        }),
      );
    });

    it('nunca devolve fornecedores de outra organização', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.count.mockResolvedValue(0);

      await service.findAll('org-1', { page: 2, pageSize: 5 });

      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          skip: 5,
          take: 5,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('devolve o fornecedor quando pertence à organização', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });

      const result = await service.findOne('org-1', 's1');

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', organizationId: 'org-1' },
      });
      expect(result).toEqual({ id: 's1', organizationId: 'org-1' });
    });

    it('lança NotFoundException quando não encontrado (inclui pertencer a outra organização)', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 's1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('confirma pertença à organização antes de atualizar', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      prisma.supplier.update.mockResolvedValue({ id: 's1', name: 'Novo nome' });

      const result = await service.update('org-1', 's1', { name: 'Novo nome' });

      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { name: 'Novo nome' },
      });
      expect(result.name).toBe('Novo nome');
    });

    it('lança NotFoundException e não chama update quando não pertence à organização', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.update('org-1', 's1', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('elimina quando não há faturas associadas', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      prisma.supplier.delete.mockResolvedValue(undefined);

      await service.remove('org-1', 's1');

      expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });

    it('mapeia o erro P2003 (faturas associadas) para ConflictException', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      prisma.supplier.delete.mockRejectedValue(prismaError('P2003'));

      await expect(service.remove('org-1', 's1')).rejects.toThrow(ConflictException);
    });

    it('não pertencer à organização lança NotFoundException sem tentar eliminar', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 's1')).rejects.toThrow(NotFoundException);
      expect(prisma.supplier.delete).not.toHaveBeenCalled();
    });
  });
});
