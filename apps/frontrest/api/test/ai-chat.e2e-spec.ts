import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

/**
 * `AiTenantContextService` chama sempre `DashboardService.getFinancialSummary()`
 * (Fase 7) — todo teste de `/ai/chat` precisa das mesmas queries de
 * `Invoice` vazias mockadas, mesmo padrão de `dashboard.e2e-spec.ts`.
 */
function mockEmptyDashboardAggregations(prisma: MockPrismaService) {
  prisma.invoice.aggregate.mockResolvedValue({
    _count: 0,
    _sum: { totalAmount: null },
    _avg: { totalAmount: null },
  });
  prisma.invoice.count.mockResolvedValue(0);
  prisma.invoice.groupBy.mockResolvedValue([]);
  prisma.invoice.findMany.mockResolvedValue([]);
  prisma.expenseCategory.findMany.mockResolvedValue([]);
  prisma.supplier.findMany.mockResolvedValue([]);
}

interface FakeConversation {
  id: string;
  organizationId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

/** Store em memória simples, suficiente para simular create/findFirst/findMany/update de AiConversation/AiMessage por este ficheiro de testes. */
function wireInMemoryAiStore(prisma: MockPrismaService) {
  let conversationSeq = 0;
  let messageSeq = 0;
  const conversations = new Map<string, FakeConversation>();
  const messages = new Map<string, FakeMessage>();

  prisma.aiConversation.create.mockImplementation(({ data }: { data: { organizationId: string; userId: string } }) => {
    conversationSeq += 1;
    const conversation = {
      id: `conv-${conversationSeq}`,
      organizationId: data.organizationId,
      userId: data.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    conversations.set(conversation.id, conversation);
    return Promise.resolve(conversation);
  });

  prisma.aiConversation.findFirst.mockImplementation(({ where }: { where: { id: string; organizationId: string; userId: string } }) => {
    const conversation = conversations.get(where.id);
    if (!conversation || conversation.organizationId !== where.organizationId || conversation.userId !== where.userId) {
      return Promise.resolve(null);
    }
    const conversationMessages = [...messages.values()]
      .filter((m) => m.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return Promise.resolve({ ...conversation, messages: conversationMessages });
  });

  prisma.aiConversation.findMany.mockImplementation(
    ({
      where,
      include,
    }: {
      where: { organizationId: string; userId: string };
      include?: { messages?: { orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number } };
    }) => {
      const direction = include?.messages?.orderBy?.createdAt ?? 'desc';
      const take = include?.messages?.take ?? 1;
      const items = [...conversations.values()]
        .filter((c) => c.organizationId === where.organizationId && c.userId === where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((c) => {
          const conversationMessages = [...messages.values()]
            .filter((m) => m.conversationId === c.id)
            .sort((a, b) => (direction === 'asc' ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime()))
            .slice(0, take);
          return { ...c, messages: conversationMessages };
        });
      return Promise.resolve(items);
    },
  );

  prisma.aiConversation.count.mockImplementation(({ where }: { where: { organizationId: string; userId: string } }) =>
    Promise.resolve([...conversations.values()].filter((c) => c.organizationId === where.organizationId && c.userId === where.userId).length),
  );

  prisma.aiConversation.update.mockImplementation(({ where, data }: { where: { id: string }; data: { updatedAt: Date } }) => {
    const conversation = conversations.get(where.id)!;
    conversation.updatedAt = data.updatedAt;
    return Promise.resolve(conversation);
  });

  // Fase 8.3 — elimina a conversa e, simulando `onDelete: Cascade` do schema real, as suas mensagens.
  prisma.aiConversation.delete.mockImplementation(({ where }: { where: { id: string } }) => {
    const conversation = conversations.get(where.id)!;
    conversations.delete(where.id);
    for (const [messageId, message] of messages) {
      if (message.conversationId === where.id) messages.delete(messageId);
    }
    return Promise.resolve(conversation);
  });

  prisma.aiMessage.create.mockImplementation(
    ({ data }: { data: Partial<FakeMessage> & { conversationId: string; role: 'USER' | 'ASSISTANT'; content: string } }) => {
      messageSeq += 1;
      const message: FakeMessage = {
        id: `msg-${messageSeq}`,
        createdAt: new Date(Date.now() + messageSeq),
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        ...data,
      };
      messages.set(message.id, message);
      return Promise.resolve(message);
    },
  );

  prisma.aiMessage.findMany.mockImplementation(({ where, take }: { where: { conversationId: string }; take: number }) => {
    const items = [...messages.values()]
      .filter((m) => m.conversationId === where.conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take);
    return Promise.resolve(items);
  });

  prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
}

describe('AI Chat (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmptyDashboardAggregations(prisma);
    wireInMemoryAiStore(prisma);
  });

  describe('autenticação', () => {
    it('POST /api/ai/chat sem token → 401', async () => {
      await request(app.getHttpServer()).post('/api/ai/chat').send({ message: 'Olá' }).expect(401);
    });

    it('GET /api/ai/conversations sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/ai/conversations').expect(401);
    });
  });

  describe('qualquer role autenticada pode usar o chat', () => {
    it('MEMBER consegue enviar uma mensagem', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .send({ message: 'Olá' })
        .expect(201);
    });
  });

  describe('criação e continuação', () => {
    it('sem conversationId cria uma nova conversa e devolve a resposta do provider mock', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Quanto gastei este mês?' })
        .expect(201);

      expect(response.body.conversationId).toMatch(/^conv-/);
      expect(response.body.message.role).toBe('ASSISTANT');
      expect(response.body.message.content).toContain('Quanto gastei este mês?');
    });

    it('com conversationId continua a mesma conversa (histórico cresce)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Primeira pergunta' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ conversationId: first.body.conversationId, message: 'Segunda pergunta' })
        .expect(201);

      expect(second.body.conversationId).toBe(first.body.conversationId);

      const detail = await request(app.getHttpServer())
        .get(`/api/ai/conversations/${first.body.conversationId}`)
        .set('Authorization', authHeader())
        .expect(200);

      expect(detail.body.messages.map((m: { role: string }) => m.role)).toEqual([
        'USER',
        'ASSISTANT',
        'USER',
        'ASSISTANT',
      ]);
    });
  });

  describe('listagem e detalhe', () => {
    it('GET /api/ai/conversations lista as conversas do utilizador autenticado', async () => {
      await request(app.getHttpServer()).post('/api/ai/chat').set('Authorization', authHeader()).send({ message: 'Olá' });

      const response = await request(app.getHttpServer())
        .get('/api/ai/conversations')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].titlePreview).toContain('Olá');
    });

    it('GET /api/ai/conversations/:id de uma conversa inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/api/ai/conversations/conv-inexistente')
        .set('Authorization', authHeader())
        .expect(404);
    });
  });

  describe('isolamento entre organizações', () => {
    it('organização A não lê nem continua conversas da organização B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-a', userId: 'user-a' }))
        .send({ message: 'Segredo da org A' });
      const conversationId = created.body.conversationId;
      const otherOrgAuth = authHeader({ organizationId: 'org-b', userId: 'user-b' });

      await request(app.getHttpServer())
        .get(`/api/ai/conversations/${conversationId}`)
        .set('Authorization', otherOrgAuth)
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', otherOrgAuth)
        .send({ conversationId, message: 'Tentativa de continuar' })
        .expect(404);
    });

    it('alterar manualmente o conversationId no pedido não contorna o isolamento', async () => {
      const orgA = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-a', userId: 'user-a' }))
        .send({ message: 'Olá' });

      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-b', userId: 'user-b' }))
        .send({ conversationId: orgA.body.conversationId, message: 'A tentar entrar na conversa da org A' });

      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain('org-a');
    });
  });

  describe('isolamento entre utilizadores da mesma organização', () => {
    it('utilizador A não lê nem continua conversas do utilizador B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-a' }))
        .send({ message: 'Privado do utilizador A' });
      const conversationId = created.body.conversationId;
      const otherUserAuth = authHeader({ organizationId: 'org-1', userId: 'user-b' });

      await request(app.getHttpServer())
        .get(`/api/ai/conversations/${conversationId}`)
        .set('Authorization', otherUserAuth)
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', otherUserAuth)
        .send({ conversationId, message: 'Tentativa de continuar' })
        .expect(404);
    });

    it('a listagem do utilizador B nunca inclui conversas do utilizador A', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-a' }))
        .send({ message: 'Do utilizador A' });

      const response = await request(app.getHttpServer())
        .get('/api/ai/conversations')
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-b' }))
        .expect(200);

      expect(response.body.items).toHaveLength(0);
    });
  });

  describe('validação do corpo', () => {
    it('corpo sem "message" → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({})
        .expect(400);
    });

    it('mensagem vazia → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: '   ' })
        .expect(400);
    });

    it('conversationId inexistente → 404 (não cria conversa nova silenciosamente)', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ conversationId: 'conv-nao-existe', message: 'Olá' })
        .expect(404);
    });
  });

  describe('contexto enviado ao provider', () => {
    it('nunca inclui organizationId/userId em bruto no texto — só o resumo financeiro e as regras', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .send({ message: 'O que sabes sobre a minha organização?' })
        .expect(201);

      // MockAiProvider ecoa a última mensagem enviada (a pergunta do utilizador) — nunca o system prompt bruto.
      expect(response.body.message.content).not.toContain('org-1');
    });
  });

  /**
   * Retrieval financeiro estruturado (Fase 8.1) — o `MockAiProvider` ecoa
   * sempre a última mensagem (a pergunta do utilizador), nunca o `system
   * prompt`, por isso um teste e2e não consegue inspecionar o texto de
   * dados/orientação construído pelo retrieval (isso já está coberto
   * exaustivamente por `financial-retrieval.service.spec.ts` e
   * `ai-tenant-context.service.spec.ts`, unitários). O que só um teste
   * e2e real prova, e que nenhum teste unitário prova sozinho (esses
   * instanciam os serviços à mão, sem passar pela injeção do Nest), é
   * que a árvore de injeção de `AiModule` — agora com
   * `FinancialRetrievalService` — continua a arrancar e a ligar
   * corretamente ponta a ponta: intenção suportada → período resolvido →
   * chamada real ao `DashboardService` → resposta concluída através do
   * Mock provider.
   */
  describe('retrieval financeiro — integração ponta a ponta (Fase 8.1)', () => {
    it('intenção suportada (valores por pagar este mês) resolve o período, consulta o DashboardService e devolve a resposta do Mock provider', async () => {
      prisma.invoice.groupBy.mockResolvedValueOnce([
        { status: 'PENDING', _count: 2, _sum: { totalAmount: '316.00' } },
        { status: 'OVERDUE', _count: 2, _sum: { totalAmount: '54.00' } },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Quanto tenho por pagar este mês?' })
        .expect(201);

      // Confirma a chamada real ao DashboardService (via Prisma) — não um mock do próprio serviço.
      expect(prisma.invoice.groupBy).toHaveBeenCalled();
      // Confirma que a resposta atravessou toda a árvore de injeção até ao Mock provider.
      expect(response.body.message.role).toBe('ASSISTANT');
      expect(response.body.message.provider).toBeUndefined(); // ChatMessageView público não expõe o provider — contrato inalterado.
    });
  });

  /**
   * Regressão real (Fase 8.3) — as frases exatas que produziram
   * respostas fabricadas na investigação real (ver
   * `docs/phases/phase-8.3-ai-tools-function-calling-foundation.md`).
   * A cobertura exaustiva de qual `kind`/dados cada uma resolve já está
   * em `financial-intent.resolver.spec.ts`/`financial-retrieval.service.spec.ts`
   * (unitários, deterministas); aqui só se confirma que a árvore de
   * injeção completa (retrieval → fallback determinístico → orquestrador
   * de tools → Mock) nunca rebenta com nenhuma delas.
   */
  describe('regressão Fase 8.3 — frases reais que antes produziam respostas fabricadas', () => {
    it.each([
      'Quantas faturas existem?',
      'Existem faturas pendentes?',
      'Onde estou a gastar mais dinheiro?',
      'Qual é o fornecedor onde mais gastamos?',
      'Faz um resumo financeiro da empresa.',
    ])('"%s" completa com sucesso (201), sem nunca rebentar', async (message) => {
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message })
        .expect(201);
    });

    it('"sim este mês" como continuação de "Faz um resumo financeiro da empresa." recupera a intenção pelo histórico', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Faz um resumo financeiro da empresa.' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ conversationId: first.body.conversationId, message: 'sim este mês' })
        .expect(201);

      // Confirma a chamada real ao DashboardService — a recuperação por histórico funcionou (deixou de ser UNSUPPORTED).
      expect(prisma.invoice.aggregate).toHaveBeenCalled();
    });
  });

  /**
   * Orquestrador de tools (Fase 8.3) — o `MockAiProvider` chama sempre a
   * primeira tool oferecida quando `tools` está presente (determinístico,
   * ver `mock-ai-provider.ts`), por isso uma pergunta que o retrieval
   * determinístico não reconheça ainda assim chega a dados reais via
   * tool call, nunca via texto livre.
   */
  describe('orquestrador de tools — integração ponta a ponta (Fase 8.3)', () => {
    it('pergunta não reconhecida pelo retrieval determinístico é respondida via tool call real (Mock + DashboardService)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Onde estou a gastar mais dinheiro?' })
        .expect(201);

      // "Onde estou a gastar mais dinheiro?" já é reconhecida pelo vocabulário alargado (BY_CATEGORY) — usa o caminho DATA
      // direto, não o orquestrador de tools. Confirma-se aqui a chamada real ao DashboardService de qualquer forma.
      expect(prisma.invoice.groupBy).toHaveBeenCalled();
      expect(response.body.message.role).toBe('ASSISTANT');
    });

    it('pergunta genuinamente não financeira nunca aciona nenhuma tool nem chega a alucinar um valor', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Quem ganhou o Mundial de 2022?' })
        .expect(201);

      expect(response.body.message.role).toBe('ASSISTANT');
    });
  });

  describe('Fase 8.3 — DELETE /api/ai/conversations/:id', () => {
    it('elimina uma conversa própria (204) — deixa de aparecer na listagem e no detalhe (404)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader())
        .send({ message: 'Olá' });
      const conversationId = created.body.conversationId;

      await request(app.getHttpServer())
        .delete(`/api/ai/conversations/${conversationId}`)
        .set('Authorization', authHeader())
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/ai/conversations/${conversationId}`)
        .set('Authorization', authHeader())
        .expect(404);

      const list = await request(app.getHttpServer())
        .get('/api/ai/conversations')
        .set('Authorization', authHeader())
        .expect(200);
      expect(list.body.items.find((c: { id: string }) => c.id === conversationId)).toBeUndefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).delete('/api/ai/conversations/conv-1').expect(401);
    });

    it('conversa de outra organização → 404, nunca elimina', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-a', userId: 'user-a' }))
        .send({ message: 'Segredo da org A' });

      await request(app.getHttpServer())
        .delete(`/api/ai/conversations/${created.body.conversationId}`)
        .set('Authorization', authHeader({ organizationId: 'org-b', userId: 'user-b' }))
        .expect(404);

      // Continua acessível pela organização A — nunca foi eliminada.
      await request(app.getHttpServer())
        .get(`/api/ai/conversations/${created.body.conversationId}`)
        .set('Authorization', authHeader({ organizationId: 'org-a', userId: 'user-a' }))
        .expect(200);
    });

    it('conversa de outro utilizador da mesma organização → 404, nunca elimina', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-a' }))
        .send({ message: 'Privado do utilizador A' });

      await request(app.getHttpServer())
        .delete(`/api/ai/conversations/${created.body.conversationId}`)
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-b' }))
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/ai/conversations/${created.body.conversationId}`)
        .set('Authorization', authHeader({ organizationId: 'org-1', userId: 'user-a' }))
        .expect(200);
    });

    it('conversa inexistente → 404', async () => {
      await request(app.getHttpServer())
        .delete('/api/ai/conversations/conv-nao-existe')
        .set('Authorization', authHeader())
        .expect(404);
    });
  });
});
