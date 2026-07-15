import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

describe('Suppliers (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticação', () => {
    it('GET /api/suppliers sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/suppliers').expect(401);
    });

    it('GET /api/suppliers com token inválido → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/suppliers')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
    });
  });

  describe('roles', () => {
    it('POST /api/suppliers como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .send({ name: 'Acme' })
        .expect(403);
    });

    it('POST /api/suppliers como MANAGER → 201', async () => {
      prisma.supplier.create.mockResolvedValue({ id: 's1', name: 'Acme', organizationId: 'org-1' });

      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ name: 'Acme' })
        .expect(201);
    });

    it('POST /api/suppliers com isSuperAdmin e role MEMBER → 201 (bypass do RolesGuard)', async () => {
      prisma.supplier.create.mockResolvedValue({ id: 's1', name: 'Acme' });

      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MEMBER', isSuperAdmin: true }))
        .send({ name: 'Acme' })
        .expect(201);
    });

    it('GET /api/suppliers como MEMBER → 200 (leitura não exige MANAGER+)', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(200);
    });
  });

  describe('isolamento por organização', () => {
    it('GET /api/suppliers/:id de outra organização → 404', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/suppliers/s1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', organizationId: 'org-1' },
      });
    });
  });

  describe('paginação e filtros', () => {
    it('GET /api/suppliers devolve o envelope paginado', async () => {
      prisma.supplier.findMany.mockResolvedValue([{ id: 's1', name: 'Acme' }]);
      prisma.supplier.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/api/suppliers')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body).toEqual({
        items: [{ id: 's1', name: 'Acme' }],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('GET /api/suppliers?search=acme filtra por nome', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/suppliers?search=acme')
        .set('Authorization', authHeader())
        .expect(200);

      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { contains: 'acme', mode: 'insensitive' } }),
        }),
      );
    });
  });

  describe('erros esperados', () => {
    it('POST /api/suppliers sem nome → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({})
        .expect(400);
    });

    it('POST /api/suppliers com campo não permitido → 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Acme', hackField: true })
        .expect(400);
    });

    it('POST /api/suppliers com taxId com menos de 9 dígitos → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Acme', taxId: '12345' })
        .expect(400);
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it('POST /api/suppliers com taxId com 10 dígitos (achado real: OCR devolveu um dígito a mais) → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Acme', taxId: '1600976142' })
        .expect(400);
    });

    it('POST /api/suppliers com taxId não numérico → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Acme', taxId: 'PT123456789' })
        .expect(400);
    });

    it('POST /api/suppliers com taxId de exatamente 9 dígitos → 201', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      prisma.supplier.create.mockResolvedValue({ id: 's1', name: 'Acme', taxId: '509978142' });

      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ name: 'Acme', taxId: '509978142' })
        .expect(201);
    });

    it('POST /api/suppliers com taxId já usado por outro fornecedor da mesma organização → 409', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 'outro' });

      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ name: 'Acme Filial', taxId: '509978142' })
        .expect(409);
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it('PATCH /api/suppliers/:id com taxId com formato inválido → 400', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });

      await request(app.getHttpServer())
        .patch('/api/suppliers/s1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ taxId: 'abc' })
        .expect(400);
      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });
  });
});
