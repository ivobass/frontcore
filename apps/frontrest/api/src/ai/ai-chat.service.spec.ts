import { BadGatewayException, BadRequestException, GatewayTimeoutException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiProviderError } from '@frontcore/ai';
import type { AiCompletionProvider, AiMessage } from '@frontcore/ai';
import { AiChatService } from './ai-chat.service';
import type { AiTenantContextService } from './ai-tenant-context.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

const SYSTEM_MESSAGE: AiMessage = { role: 'system', content: 'regras + dados da organização' };

function buildService(overrides: {
  prisma?: MockPrismaService;
  provider?: Partial<AiCompletionProvider>;
  historyLimit?: number;
  maxMessageLength?: number;
} = {}) {
  const prisma = overrides.prisma ?? createMockPrismaService();
  const provider: AiCompletionProvider = {
    name: 'test',
    complete: jest.fn(),
    ...overrides.provider,
  };
  const tenantContext = {
    buildSystemMessage: jest.fn().mockResolvedValue(SYSTEM_MESSAGE),
  } as unknown as AiTenantContextService;

  if (overrides.historyLimit !== undefined) {
    process.env.AI_CHAT_HISTORY_LIMIT = String(overrides.historyLimit);
  } else {
    delete process.env.AI_CHAT_HISTORY_LIMIT;
  }
  if (overrides.maxMessageLength !== undefined) {
    process.env.AI_CHAT_MAX_MESSAGE_LENGTH = String(overrides.maxMessageLength);
  } else {
    delete process.env.AI_CHAT_MAX_MESSAGE_LENGTH;
  }

  const service = new AiChatService(prisma as never, provider, tenantContext);
  return { service, prisma, provider, tenantContext };
}

describe('AiChatService', () => {
  afterEach(() => {
    delete process.env.AI_CHAT_HISTORY_LIMIT;
    delete process.env.AI_CHAT_MAX_MESSAGE_LENGTH;
  });

  describe('sendMessage — criação e continuação de conversa', () => {
    it('sem conversationId cria uma nova conversa para a organização e utilizador autenticados', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'olá', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'olá', createdAt: new Date() });

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Olá' });

      expect(prisma.aiConversation.create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', userId: 'user-1' } });
      expect(result.conversationId).toBe('conv-1');
    });

    it('com conversationId continua só uma conversa pertencente ao mesmo organizationId e userId', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { conversationId: 'conv-1', message: 'Continuar' });

      expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', organizationId: 'org-1', userId: 'user-1' },
      });
      expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    });

    it('conversationId de outra organização ou de outro utilizador é tratado como inexistente (404 genérico)', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage('org-1', 'user-1', { conversationId: 'conv-of-other-tenant', message: 'Olá' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sendMessage — persistência USER → completion → ASSISTANT', () => {
    it('persiste a mensagem USER antes de chamar o provider, e a ASSISTANT só depois do sucesso', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      const callOrder: string[] = [];
      prisma.aiMessage.create.mockImplementation(({ data }: { data: { role: string } }) => {
        callOrder.push(`create:${data.role}`);
        return Promise.resolve({ id: 'msg-x', role: data.role, content: '', createdAt: new Date() });
      });
      (provider.complete as jest.Mock).mockImplementation(() => {
        callOrder.push('provider.complete');
        return Promise.resolve({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));

      await service.sendMessage('org-1', 'user-1', { message: 'Olá' });

      expect(callOrder).toEqual(['create:USER', 'provider.complete', 'create:ASSISTANT']);
    });

    it('provider/model/usage são persistidos na mensagem ASSISTANT quando disponíveis', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({
        content: 'resposta',
        provider: 'ollama',
        model: 'qwen2.5:3b',
        usage: { inputTokens: 42, outputTokens: 17 },
      });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Olá' });

      const assistantCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      expect(assistantCall[0].data).toMatchObject({
        provider: 'ollama',
        model: 'qwen2.5:3b',
        inputTokens: 42,
        outputTokens: 17,
      });
    });

    it('mensagens USER nunca têm provider/model/usage preenchidos', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Olá' });

      const userCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'USER',
      );
      expect(userCall[0].data).toEqual({ conversationId: 'conv-1', role: 'USER', content: 'Olá' });
    });
  });

  describe('sendMessage — histórico', () => {
    it('carrega as últimas AI_CHAT_HISTORY_LIMIT mensagens e envia ao provider em ordem cronológica ascendente', async () => {
      const { service, prisma, provider } = buildService({ historyLimit: 2 });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      // Carregadas descendente (mais recente primeiro) — o service tem de inverter.
      prisma.aiMessage.findMany.mockResolvedValue([
        { id: 'm2', role: 'USER', content: 'pergunta atual', createdAt: new Date('2026-07-16T10:01:00Z') },
        { id: 'm1', role: 'ASSISTANT', content: 'resposta anterior', createdAt: new Date('2026-07-16T10:00:00Z') },
      ]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-3', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'pergunta atual' });

      expect(prisma.aiMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      const request = (provider.complete as jest.Mock).mock.calls[0][0];
      expect(request.messages).toEqual([
        SYSTEM_MESSAGE,
        { role: 'assistant', content: 'resposta anterior' },
        { role: 'user', content: 'pergunta atual' },
      ]);
    });
  });

  describe('sendMessage — contexto', () => {
    it('constrói o contexto só a partir da organização autenticada', async () => {
      const { service, prisma, provider, tenantContext } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-42', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-42', 'user-1', { message: 'Olá' });

      expect(tenantContext.buildSystemMessage).toHaveBeenCalledWith('org-42');
      expect(tenantContext.buildSystemMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage — validação', () => {
    it('rejeita mensagem vazia (ou só espaços) sem chamar o provider', async () => {
      const { service, provider } = buildService();

      await expect(service.sendMessage('org-1', 'user-1', { message: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(provider.complete).not.toHaveBeenCalled();
    });

    it('rejeita mensagem acima do limite configurado sem chamar o provider', async () => {
      const { service, provider } = buildService({ maxMessageLength: 10 });

      await expect(
        service.sendMessage('org-1', 'user-1', { message: 'mensagem claramente acima do limite' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.complete).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage — falha do provider', () => {
    async function expectSanitizedError(
      code: 'timeout' | 'provider_unavailable' | 'model_not_found' | 'invalid_response' | 'unknown',
      expectedType: new (...args: never[]) => Error,
    ) {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-1', role: 'USER', content: 'Olá', createdAt: new Date() });
      (provider.complete as jest.Mock).mockRejectedValue(new AiProviderError('mensagem interna nunca exposta', code));

      const error = await service.sendMessage('org-1', 'user-1', { message: 'Olá' }).catch((e) => e);

      expect(error).toBeInstanceOf(expectedType);
      expect(error.message).not.toContain('mensagem interna nunca exposta');
      // Mensagem USER já foi persistida (create chamado uma vez, role USER) — nunca apagada.
      expect(prisma.aiMessage.create).toHaveBeenCalledTimes(1);
      expect(prisma.aiMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv-1', role: 'USER', content: 'Olá' },
      });
      // Nenhuma mensagem ASSISTANT falsa.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }

    it('timeout → 504 sanitizado', () => expectSanitizedError('timeout', GatewayTimeoutException));
    it('provider_unavailable → 503 sanitizado', () => expectSanitizedError('provider_unavailable', ServiceUnavailableException));
    it('model_not_found → 503 sanitizado', () => expectSanitizedError('model_not_found', ServiceUnavailableException));
    it('invalid_response → 502 sanitizado', () => expectSanitizedError('invalid_response', BadGatewayException));
    it('unknown → 502 sanitizado', () => expectSanitizedError('unknown', BadGatewayException));
  });

  describe('listConversations/getConversation — isolamento', () => {
    it('listConversations filtra por organizationId e userId', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findMany.mockResolvedValue([]);
      prisma.aiConversation.count.mockResolvedValue(0);

      await service.listConversations('org-1', 'user-1', {});

      expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', userId: 'user-1' } }),
      );
      expect(prisma.aiConversation.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', userId: 'user-1' } });
    });

    it('getConversation devolve 404 genérico para conversa de outro tenant', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(service.getConversation('org-1', 'user-1', 'conv-of-other-org')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('getConversation devolve 404 genérico para conversa de outro utilizador da mesma organização', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await service.getConversation('org-1', 'user-1', 'conv-of-other-user').catch(() => undefined);

      expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-of-other-user', organizationId: 'org-1', userId: 'user-1' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });
  });
});
