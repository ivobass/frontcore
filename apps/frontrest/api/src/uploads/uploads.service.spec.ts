import { NotFoundException } from '@nestjs/common';
import { UploadsService } from './uploads.service';

function createMockPrisma() {
  return {
    storageObject: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function createMockStorage() {
  return {
    put: jest.fn(),
    getDownloadUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe('UploadsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let storage: ReturnType<typeof createMockStorage>;
  let service: UploadsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    storage = createMockStorage();
    service = new UploadsService(prisma as never, storage as never);
  });

  describe('create', () => {
    it('cria a linha sem key, faz put() e só depois grava a key definitiva', async () => {
      prisma.storageObject.create.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: null,
        filename: 'fatura.pdf',
        contentType: 'application/pdf',
        size: 1234,
      });
      storage.put.mockResolvedValue({ key: 'x', size: 1234, contentType: 'application/pdf' });
      prisma.storageObject.update.mockImplementation(
        ({ data }: { data: { key: string } }) =>
          Promise.resolve({
            id: 'obj-1',
            organizationId: 'org-1',
            key: data.key,
            filename: 'fatura.pdf',
            contentType: 'application/pdf',
            size: 1234,
          }),
      );

      const result = await service.create('org-1', {
        buffer: Buffer.from('conteudo'),
        filename: 'fatura.pdf',
        contentType: 'application/pdf',
        size: 1234,
      });

      expect(prisma.storageObject.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          filename: 'fatura.pdf',
          contentType: 'application/pdf',
          size: 1234,
        },
      });
      expect(storage.put).toHaveBeenCalledWith({
        key: 'organizations/org-1/uploads/obj-1',
        body: expect.any(Buffer),
        contentType: 'application/pdf',
      });
      expect(prisma.storageObject.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: { key: 'organizations/org-1/uploads/obj-1' },
      });
      expect(result.key).toBe('organizations/org-1/uploads/obj-1');
    });

    it('propaga o erro do put() sem apagar a linha (fica key: null)', async () => {
      prisma.storageObject.create.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: null,
      });
      storage.put.mockRejectedValue(new Error('falha de rede'));

      await expect(
        service.create('org-1', {
          buffer: Buffer.from('x'),
          filename: 'a.pdf',
          contentType: 'application/pdf',
          size: 1,
        }),
      ).rejects.toThrow('falha de rede');
      expect(prisma.storageObject.delete).not.toHaveBeenCalled();
      expect(prisma.storageObject.update).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('devolve os metadados com downloadUrl quando o objeto está completo', async () => {
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
        filename: 'fatura.pdf',
      });
      storage.getDownloadUrl.mockResolvedValue('https://signed.example/obj-1');

      const result = await service.findOne('org-1', 'obj-1');

      expect(prisma.storageObject.findFirst).toHaveBeenCalledWith({
        where: { id: 'obj-1', organizationId: 'org-1', key: { not: null } },
      });
      expect(storage.getDownloadUrl).toHaveBeenCalledWith(
        'organizations/org-1/uploads/obj-1',
        300,
      );
      expect(result.downloadUrl).toBe('https://signed.example/obj-1');
    });

    it('lança NotFoundException quando não encontrado (outra organização ou incompleto)', async () => {
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'obj-1')).rejects.toThrow(NotFoundException);
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('elimina o objeto em storage e a linha na BD', async () => {
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
      });

      await service.remove('org-1', 'obj-1');

      expect(storage.delete).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
      expect(prisma.storageObject.delete).toHaveBeenCalledWith({ where: { id: 'obj-1' } });
    });

    it('lança NotFoundException sem tentar eliminar quando não encontrado', async () => {
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'obj-1')).rejects.toThrow(NotFoundException);
      expect(storage.delete).not.toHaveBeenCalled();
      expect(prisma.storageObject.delete).not.toHaveBeenCalled();
    });
  });
});
