import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';
import type { MockObjectStorage } from './utils/mock-object-storage';

describe('Uploads (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;
  let storage: MockObjectStorage;

  beforeAll(async () => {
    ({ app, prisma, storage } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticação', () => {
    it('POST /api/uploads sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads')
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);
    });
  });

  describe('roles', () => {
    it('POST /api/uploads como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(403);
    });

    it('DELETE /api/uploads/:id como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .delete('/api/uploads/obj-1')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(403);
    });
  });

  describe('criação', () => {
    it('POST /api/uploads válido como MANAGER → 201, key gerada a partir do id', async () => {
      prisma.storageObject.create.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: null,
        filename: 'fatura.pdf',
        contentType: 'application/pdf',
        size: 8,
      });
      storage.put.mockResolvedValue({});
      prisma.storageObject.update.mockImplementation(
        ({ data }: { data: { key: string } }) =>
          Promise.resolve({
            id: 'obj-1',
            organizationId: 'org-1',
            key: data.key,
            filename: 'fatura.pdf',
            contentType: 'application/pdf',
            size: 8,
          }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/uploads')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'fatura.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(response.body.key).toBe('organizations/org-1/uploads/obj-1');
      expect(storage.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'organizations/org-1/uploads/obj-1',
          contentType: 'application/pdf',
        }),
      );
    });

    it('POST /api/uploads com MIME não permitido → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.txt',
          contentType: 'text/plain',
        })
        .expect(400);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('POST /api/uploads sem ficheiro → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/uploads')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .expect(400);
    });
  });

  describe('isolamento por organização', () => {
    it('GET /api/uploads/:id de outra organização → 404', async () => {
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/uploads/obj-1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);

      expect(prisma.storageObject.findFirst).toHaveBeenCalledWith({
        where: { id: 'obj-1', organizationId: 'org-1', key: { not: null } },
      });
    });
  });

  describe('leitura', () => {
    it('GET /api/uploads/:id devolve metadados + downloadUrl', async () => {
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
        filename: 'fatura.pdf',
      });
      storage.getDownloadUrl.mockResolvedValue('https://signed.example/obj-1');

      const response = await request(app.getHttpServer())
        .get('/api/uploads/obj-1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.downloadUrl).toBe('https://signed.example/obj-1');
    });
  });

  describe('eliminação', () => {
    it('DELETE /api/uploads/:id como MANAGER → elimina em storage e na BD', async () => {
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
      });

      await request(app.getHttpServer())
        .delete('/api/uploads/obj-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .expect(200);

      expect(storage.delete).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
      expect(prisma.storageObject.delete).toHaveBeenCalledWith({ where: { id: 'obj-1' } });
    });
  });
});
