import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@frontcore/database';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

describe('Expense Categories (e2e)', () => {
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
    it('GET /api/expense-categories sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/expense-categories').expect(401);
    });
  });

  describe('roles', () => {
    it('POST /api/expense-categories como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/expense-categories')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .send({ name: 'Renda' })
        .expect(403);
    });

    it('POST /api/expense-categories como MANAGER → 201', async () => {
      prisma.expenseCategory.create.mockResolvedValue({ id: 'c1', name: 'Renda' });

      await request(app.getHttpServer())
        .post('/api/expense-categories')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Renda' })
        .expect(201);
    });
  });

  describe('isolamento por organização', () => {
    it('GET /api/expense-categories/:id de outra organização → 404', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/expense-categories/c1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);

      expect(prisma.expenseCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', organizationId: 'org-1' },
      });
    });
  });

  describe('forma da resposta (sem paginação)', () => {
    it('GET /api/expense-categories devolve um array simples', async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([{ id: 'c1', name: 'Renda' }]);

      const response = await request(app.getHttpServer())
        .get('/api/expense-categories')
        .set('Authorization', authHeader())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual([{ id: 'c1', name: 'Renda' }]);
    });
  });

  describe('erros esperados', () => {
    it('POST /api/expense-categories sem nome → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/expense-categories')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({})
        .expect(400);
    });

    it('POST /api/expense-categories com nome duplicado na organização → 409', async () => {
      prisma.expenseCategory.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await request(app.getHttpServer())
        .post('/api/expense-categories')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ name: 'Renda' })
        .expect(409);
    });
  });
});
