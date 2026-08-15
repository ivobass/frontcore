import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProviderError } from '@frontcore/ai';
import type { AiCompletionProvider, AiMessage } from '@frontcore/ai';
import { AiChatService } from './ai-chat.service';
import type { AiTenantContextService } from './ai-tenant-context.service';
import type { FinancialRetrievalService, FinancialRetrievalResult } from './financial-retrieval/financial-retrieval.service';
import type { AiToolOrchestratorService, AiToolOrchestratorResult } from './tools/ai-tool-orchestrator.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';
import { buildEmptyFinancialInsights } from '../financial-insights/financial-insights.test-fixtures';
import type { FinancialAnalysisEngineOutput } from '../financial-analysis/types';

const SYSTEM_MESSAGE: AiMessage = { role: 'system', content: 'regras + dados da organização' };
const GENERAL_SYSTEM_MESSAGE: AiMessage = { role: 'system', content: 'regras gerais, sem dados da organização' };

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

/** Fase 8.13 — insights vazios nunca produzem nenhuma conclusão aplicável. */
const EMPTY_ANALYSIS: FinancialAnalysisEngineOutput = {
  results: [],
  metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 0 },
};

const DEFAULT_DATA_RESULT: FinancialRetrievalResult = {
  kind: 'DATA',
  period: PERIOD,
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '10.00', averageAmount: '10.00' },
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: EMPTY_ANALYSIS,
  },
  filters: {}, invoiceIdentityRequested: false,
};

function buildService(overrides: {
  prisma?: MockPrismaService;
  provider?: Partial<AiCompletionProvider>;
  historyLimit?: number;
  maxMessageLength?: number;
  retrievalResult?: FinancialRetrievalResult;
  toolResult?: AiToolOrchestratorResult;
} = {}) {
  const prisma = overrides.prisma ?? createMockPrismaService();
  const provider: AiCompletionProvider = {
    name: 'test',
    complete: jest.fn(),
    ...overrides.provider,
  };
  const tenantContext = {
    buildSystemMessage: jest.fn().mockReturnValue(SYSTEM_MESSAGE),
    buildGeneralSystemMessage: jest.fn().mockReturnValue(GENERAL_SYSTEM_MESSAGE),
  } as unknown as AiTenantContextService;
  const financialRetrieval = {
    retrieve: jest.fn().mockResolvedValue(overrides.retrievalResult ?? DEFAULT_DATA_RESULT),
  } as unknown as FinancialRetrievalService;
  const toolOrchestrator = {
    run: jest.fn().mockResolvedValue(overrides.toolResult ?? { kind: 'NOT_ANSWERED' }),
  } as unknown as AiToolOrchestratorService;

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

  const service = new AiChatService(prisma as never, provider, tenantContext, financialRetrieval, toolOrchestrator);
  return { service, prisma, provider, tenantContext, financialRetrieval, toolOrchestrator };
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

  describe('sendMessage — persistência USER → completion → ASSISTANT (retrieval DATA)', () => {
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
        { id: 'm2', role: 'USER', content: 'Quanto gastei este mês?', createdAt: new Date('2026-07-16T10:01:00Z') },
        { id: 'm1', role: 'ASSISTANT', content: 'resposta anterior', createdAt: new Date('2026-07-16T10:00:00Z') },
      ]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-3', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei este mês?' });

      expect(prisma.aiMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      const request = (provider.complete as jest.Mock).mock.calls[0][0];
      expect(request.messages).toEqual([
        SYSTEM_MESSAGE,
        { role: 'assistant', content: 'resposta anterior' },
        { role: 'user', content: 'Quanto gastei este mês?' },
      ]);
    });
  });

  describe('sendMessage — retrieval financeiro (Fase 8.1, reforçado na Fase 8.3)', () => {
    it('resolve o retrieval com a organização autenticada, a mensagem atual, e o histórico de mensagens USER anteriores', async () => {
      const { service, prisma, provider, financialRetrieval } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-42', userId: 'user-1' });
      // Descendente (mais recente primeiro) — m3 é a mensagem atual, já persistida e recarregada como a mais recente.
      prisma.aiMessage.findMany.mockResolvedValue([
        { id: 'm3', role: 'USER', content: 'Quanto gastei este mês?', createdAt: new Date('2026-07-16T10:02:00Z') },
        { id: 'm2', role: 'ASSISTANT', content: 'resposta anterior', createdAt: new Date('2026-07-16T10:01:00Z') },
        { id: 'm1', role: 'USER', content: 'pergunta anterior', createdAt: new Date('2026-07-16T10:00:00Z') },
      ]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-42', 'user-1', { message: 'Quanto gastei este mês?' });

      // A mensagem atual (última do histórico cronológico) é sempre excluída — só sobra "pergunta anterior", a única USER anterior.
      // Fase 8.7 — quinto argumento é o snapshot financeiro persistido; `null` aqui porque o mock de `aiConversation.create()` não define `financialContext`.
      expect(financialRetrieval.retrieve).toHaveBeenCalledWith('org-42', 'Quanto gastei este mês?', ['pergunta anterior'], undefined, null);
    });

    it('DATA: constrói o system message a partir do resultado já resolvido, nunca chamando o retrieval outra vez', async () => {
      const dataResult: FinancialRetrievalResult = {
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'TOP_SUPPLIERS', topSuppliers: [] },
        filters: {}, invoiceIdentityRequested: false,
      };
      const { service, prisma, provider, tenantContext, financialRetrieval } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'fornecedores' });

      expect(tenantContext.buildSystemMessage).toHaveBeenCalledWith(dataResult);
      expect(financialRetrieval.retrieve).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage — fallback determinístico e tools (Fase 8.3)', () => {
    it('UNSUPPORTED + tool orchestrator NOT_ANSWERED: persiste a resposta determinística, nunca chama o provider nem buildSystemMessage', async () => {
      const { service, prisma, provider, tenantContext, toolOrchestrator } = buildService({
        retrievalResult: { kind: 'UNSUPPORTED' },
      });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      // Vocabulário financeiro-adjacente ("financeira") presente — nunca
      // classificada GENERAL (Fase 8.4) mesmo sem corresponder a nenhuma
      // intenção específica; permanece no caminho financeiro seguro.
      const result = await service.sendMessage('org-1', 'user-1', { message: 'Como está a situação financeira geral?' });

      expect(toolOrchestrator.run).toHaveBeenCalledWith('org-1', expect.any(Array));
      expect(tenantContext.buildSystemMessage).not.toHaveBeenCalled();
      expect(provider.complete).not.toHaveBeenCalled();
      expect(result.message.content).toContain('Não tenho essa informação disponível');
    });

    it('resposta determinística é persistida com marcadores próprios, nunca confundível com uma resposta real', async () => {
      const { service, prisma } = buildService({ retrievalResult: { kind: 'PERIOD_MISSING' } });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei?' });

      const assistantCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      expect(assistantCall[0].data).toMatchObject({ provider: 'deterministic', model: 'financial-retrieval-fallback' });
      expect(assistantCall[0].data.inputTokens).toBeUndefined();
      expect(assistantCall[0].data.outputTokens).toBeUndefined();
    });

    it('PERIOD_AMBIGUOUS + orchestrator ANSWERED: persiste a resposta real da tool, com provider/model/tokens reais', async () => {
      const toolResult: AiToolOrchestratorResult = {
        kind: 'ANSWERED',
        content: 'O fornecedor onde mais gastou foi a Hetzner.',
        provider: 'ollama',
        model: 'qwen3:4b',
        inputTokens: 120,
        outputTokens: 30,
        retrievalResult: {
          kind: 'DATA',
          period: { from: '2026-07-01', to: '2026-07-31' },
          data: { intent: 'TOP_SUPPLIERS', topSuppliers: [] },
          filters: {}, invoiceIdentityRequested: false,
        },
      };
      const { service, prisma, provider } = buildService({
        retrievalResult: { kind: 'PERIOD_AMBIGUOUS' },
        toolResult,
      });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Onde gasto mais?' });

      expect(provider.complete).not.toHaveBeenCalled(); // a chamada real acontece dentro do orquestrador (mocked aqui), nunca diretamente aqui
      expect(result.message.content).toBe('O fornecedor onde mais gastou foi a Hetzner.');
      const assistantCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      expect(assistantCall[0].data).toMatchObject({
        provider: 'ollama',
        model: 'qwen3:4b',
        inputTokens: 120,
        outputTokens: 30,
      });
    });

    it('ERROR: nunca chama o orquestrador de tools nem o provider — vai direto ao fallback determinístico', async () => {
      const { service, prisma, provider, toolOrchestrator } = buildService({ retrievalResult: { kind: 'ERROR' } });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei este mês?' });

      expect(toolOrchestrator.run).not.toHaveBeenCalled();
      expect(provider.complete).not.toHaveBeenCalled();
      expect(result.message.content).toContain('Não foi possível obter os dados financeiros');
      const assistantCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      expect(assistantCall[0].data).toMatchObject({ provider: 'deterministic', model: 'financial-retrieval-fallback' });
    });
  });

  describe('Fase 8.7 — contexto financeiro conversacional (snapshot persistido)', () => {
    const dataResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '10.00', averageAmount: '10.00' },
        insights: buildEmptyFinancialInsights(PERIOD),
        analysis: EMPTY_ANALYSIS,
      },
      filters: { status: 'PENDING' }, invoiceIdentityRequested: false,
    };

    function findConversationUpdate(prisma: MockPrismaService) {
      return (prisma.aiConversation.update as jest.Mock).mock.calls.find(([arg]) => arg.where.id === 'conv-1');
    }

    it('DATA: persiste o snapshot financeiro na mesma transação da mensagem ASSISTANT', async () => {
      const { service, prisma, provider } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1', financialContext: null });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei este mês?' });

      const updateCall = findConversationUpdate(prisma);
      expect(updateCall[0].data.financialContext).toMatchObject({
        version: 1,
        intent: 'FINANCIAL_SUMMARY',
        period: { from: '2026-07-01', to: '2026-07-31' },
        filters: { status: 'PENDING' },
      });
    });

    it('conversa existente com snapshot persistido: é lido, passado ao retrieval, e conta como contexto financeiro para o router', async () => {
      const previousSnapshot = {
        version: 1,
        intent: 'FINANCIAL_SUMMARY',
        period: { from: '2026-06-01', to: '2026-06-30' },
        filters: {},
        recordedAt: '2026-07-16T10:00:00.000Z',
      };
      const { service, prisma, provider, financialRetrieval } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        userId: 'user-1',
        financialContext: previousSnapshot,
      });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'E os fornecedores?', conversationId: 'conv-1' });

      expect(financialRetrieval.retrieve).toHaveBeenCalledWith(
        'org-1',
        'E os fornecedores?',
        [],
        undefined,
        previousSnapshot,
      );
    });

    it('um financialContext corrompido/de forma desconhecida é tratado como null (nunca lança, nunca confia num valor malformado)', async () => {
      const { service, prisma, provider, financialRetrieval } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        userId: 'user-1',
        financialContext: { forma: 'desconhecida' },
      });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei?', conversationId: 'conv-1' });

      expect(financialRetrieval.retrieve).toHaveBeenCalledWith('org-1', 'Quanto gastei?', [], undefined, null);
    });

    it('Fase 8.8 — um financialContext com period de calendário impossível (forma certa, data inválida) nunca crasha o pedido — tratado como null, resposta normal', async () => {
      const { service, prisma, provider, financialRetrieval } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        userId: 'user-1',
        financialContext: {
          version: 1,
          intent: 'FINANCIAL_SUMMARY',
          period: { from: '2026-13-45', to: '2026-13-45' },
          filters: {}, invoiceIdentityRequested: false,
          recordedAt: '2026-07-16T10:00:00.000Z',
        },
      });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei?', conversationId: 'conv-1' });

      expect(result.message.content).toBe('resposta');
      expect(financialRetrieval.retrieve).toHaveBeenCalledWith('org-1', 'Quanto gastei?', [], undefined, null);
    });

    it('UNSUPPORTED + fallback determinístico (sem DATA): nunca escreve financialContext — o último snapshot bem-sucedido permanece', async () => {
      const { service, prisma } = buildService({ retrievalResult: { kind: 'UNSUPPORTED' } });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1', financialContext: null });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      await service.sendMessage('org-1', 'user-1', { message: 'Como está a situação financeira geral?' });

      const updateCall = findConversationUpdate(prisma);
      expect(updateCall[0].data.financialContext).toBeUndefined();
    });

    it('GENERAL: nunca escreve financialContext', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1', financialContext: null });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'Lisboa.', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'Lisboa.', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Qual é a capital de Portugal?' });

      const updateCall = findConversationUpdate(prisma);
      expect(updateCall[0].data.financialContext).toBeUndefined();
    });

    it('tool calling (ANSWERED): persiste o snapshot a partir do retrievalResult exposto pelo orquestrador, não do resultado UNSUPPORTED original', async () => {
      const toolAnsweredWithData: AiToolOrchestratorResult = {
        kind: 'ANSWERED',
        content: 'O fornecedor onde mais gastou foi a Hetzner.',
        provider: 'ollama',
        model: 'qwen3:4b',
        retrievalResult: {
          kind: 'DATA',
          period: { from: '2026-07-01', to: '2026-07-31' },
          data: { intent: 'TOP_SUPPLIERS', topSuppliers: [] },
          filters: { supplierId: 'sup-1', supplierName: 'Hetzner' }, invoiceIdentityRequested: false,
        },
      };
      const { service, prisma } = buildService({
        retrievalResult: { kind: 'UNSUPPORTED' },
        toolResult: toolAnsweredWithData,
      });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1', financialContext: null });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      await service.sendMessage('org-1', 'user-1', { message: 'Onde gasto mais?' });

      const updateCall = findConversationUpdate(prisma);
      expect(updateCall[0].data.financialContext).toMatchObject({
        version: 1,
        intent: 'TOP_SUPPLIERS',
        filters: { supplierId: 'sup-1', supplierName: 'Hetzner' },
      });
    });

    it('isolamento: duas conversas diferentes do mesmo utilizador nunca partilham o snapshot lido — cada uma lê só o seu próprio financialContext', async () => {
      const conversationASnapshot = {
        version: 1,
        intent: 'TOP_SUPPLIERS',
        period: { from: '2026-05-01', to: '2026-05-31' },
        filters: { supplierId: 'sup-A' },
        recordedAt: '2026-07-01T00:00:00.000Z',
      };
      const { service, prisma, provider, financialRetrieval } = buildService({ retrievalResult: dataResult });
      prisma.aiConversation.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'conv-A'
            ? { id: 'conv-A', organizationId: 'org-1', userId: 'user-1', financialContext: conversationASnapshot }
            : { id: 'conv-B', organizationId: 'org-1', userId: 'user-1', financialContext: null },
        ),
      );
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'resposta', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'resposta', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'E os fornecedores?', conversationId: 'conv-B' });

      // conv-B nunca vê o snapshot de conv-A, mesmo do mesmo utilizador/organização.
      expect(financialRetrieval.retrieve).toHaveBeenLastCalledWith('org-1', 'E os fornecedores?', [], undefined, null);
    });
  });

  describe('Fase 8.8 — Strict Grounding (fronteira determinística entre FinancialRetrievalResult e a resposta final)', () => {
    const groundedDataResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
        insights: buildEmptyFinancialInsights(PERIOD),
        analysis: EMPTY_ANALYSIS,
      },
      filters: {}, invoiceIdentityRequested: false,
    };
    const filteredBySupplierResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
        insights: buildEmptyFinancialInsights(PERIOD),
        analysis: EMPTY_ANALYSIS,
      },
      filters: { supplierId: 'sup-1', supplierName: 'Hetzner' }, invoiceIdentityRequested: false,
    };
    const filteredByCategoryResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 0, totalAmount: '354.00', averageAmount: '118.00' },
        insights: buildEmptyFinancialInsights(PERIOD),
        analysis: EMPTY_ANALYSIS,
      },
      filters: { categoryId: 'cat-1', categoryName: 'Hosting' }, invoiceIdentityRequested: false,
    };
    const filteredByStatusResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 2, activeInvoiceCount: 2, cancelledInvoiceCount: 0, totalAmount: '316.00', averageAmount: '158.00' },
        insights: buildEmptyFinancialInsights(PERIOD),
        analysis: EMPTY_ANALYSIS,
      },
      filters: { status: 'PAID' }, invoiceIdentityRequested: false,
    };
    const largestInvoicesResult: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'LARGEST_INVOICES', invoices: [{ id: 'inv-1', number: 'F-100', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-10', status: 'PAID', totalAmount: '300.00' }] },
      filters: {}, invoiceIdentityRequested: false,
    };

    async function runDataPath(retrievalResult: FinancialRetrievalResult, providerContent: string) {
      const { service, prisma, provider } = buildService({ retrievalResult });
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1', financialContext: null });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: providerContent, provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'msg-2', createdAt: new Date(), ...data }),
      );

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Quanto gastei este mês?' });
      const assistantCall = (prisma.aiMessage.create as jest.Mock).mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      return { result, assistantData: assistantCall[0].data as Record<string, unknown> };
    }

    it('resposta válida (grounded) continua a ser persistida tal como veio do provider', async () => {
      const { result, assistantData } = await runDataPath(groundedDataResult, 'Este mês gastou 370,00 EUR em 4 faturas ativas.');

      expect(result.message.content).toBe('Este mês gastou 370,00 EUR em 4 faturas ativas.');
      expect(assistantData.provider).toBe('mock');
      expect(assistantData.model).toBe('mock-echo-1');
    });

    it('total diferente: um valor que os dados nunca continham nunca é persistido — cai para o fallback determinístico de grounding', async () => {
      const { result, assistantData } = await runDataPath(groundedDataResult, 'Este mês gastou 999,99 EUR.');

      expect(result.message.content).not.toContain('999,99');
      expect(result.message.content).toContain('370.00 EUR');
      expect(assistantData.provider).toBe('deterministic');
      expect(assistantData.model).toBe('financial-grounding-fallback');
    });

    it('período diferente / data inventada: uma data ISO fora do período real nunca é persistida', async () => {
      const { result } = await runDataPath(groundedDataResult, 'Período consultado: 2026-08-01 a 2026-08-31.');

      expect(result.message.content).not.toContain('2026-08-01');
      expect(result.message.content).toContain('2026-07-01');
    });

    it('fornecedor inventado: substituir o fornecedor real pedido explicitamente nunca é persistido', async () => {
      const { result } = await runDataPath(filteredBySupplierResult, 'Com a ACME Corp, gastou 354,00 EUR este mês.');

      expect(result.message.content).not.toContain('ACME Corp');
      expect(result.message.content).toContain('Hetzner');
    });

    it('categoria inventada: substituir a categoria real pedida explicitamente nunca é persistida', async () => {
      const { result } = await runDataPath(filteredByCategoryResult, 'Em Marketing, gastou 354,00 EUR este mês.');

      expect(result.message.content).not.toContain('Marketing');
      expect(result.message.content).toContain('Hosting');
    });

    it('estado diferente: trocar o estado real pedido explicitamente por outro nunca é persistido', async () => {
      const { result } = await runDataPath(filteredByStatusResult, 'Tens 2 faturas vencidas, no total de 316,00 EUR.');

      expect(result.message.content).not.toContain('vencidas');
      expect(result.message.content).toContain('Paga');
    });

    it('data inventada (LARGEST_INVOICES): uma data de fatura fora dos dados reais nunca é persistida', async () => {
      const { result } = await runDataPath(largestInvoicesResult, 'A maior fatura foi em 2026-01-15, da Hetzner, 300,00 EUR.');

      expect(result.message.content).not.toContain('2026-01-15');
      expect(result.message.content).toContain('2026-07-10');
    });

    it('alegação financeira adicional não presente nos dados nunca é persistida', async () => {
      const { result } = await runDataPath(groundedDataResult, 'Este mês gastou 370,00 EUR. Além disso, tem 50,00 EUR em juros de mora.');

      expect(result.message.content).not.toContain('juros de mora');
      expect(result.message.content).not.toContain('50,00');
    });
  });

  describe('Fase 8.4 — router híbrido (GENERAL vs. financeiro)', () => {
    it('pergunta genuinamente geral chama o provider com o system prompt geral, nunca chama o retrieval financeiro', async () => {
      const { service, prisma, provider, tenantContext, financialRetrieval } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'Lisboa é a capital de Portugal.', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'Lisboa é a capital de Portugal.', createdAt: new Date() });

      const result = await service.sendMessage('org-1', 'user-1', { message: 'Qual é a capital de Portugal?' });

      expect(tenantContext.buildGeneralSystemMessage).toHaveBeenCalledTimes(1);
      expect(tenantContext.buildSystemMessage).not.toHaveBeenCalled();
      expect(financialRetrieval.retrieve).not.toHaveBeenCalled();
      const request = (provider.complete as jest.Mock).mock.calls[0][0];
      expect(request.messages[0]).toEqual(GENERAL_SYSTEM_MESSAGE);
      expect(request.tools).toBeUndefined();
      expect(result.message.content).toBe('Lisboa é a capital de Portugal.');
    });

    it('resposta geral é persistida com o provider/model/tokens reais — nunca marcada como determinística', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({
        content: 'Resposta geral real.',
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash',
        usage: { inputTokens: 50, outputTokens: 12 },
      });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'Resposta geral real.', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Como estás hoje?' });

      const assistantCall = prisma.aiMessage.create.mock.calls.find(
        ([arg]: [{ data: { role: string } }]) => arg.data.role === 'ASSISTANT',
      );
      expect(assistantCall[0].data).toMatchObject({
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash',
        inputTokens: 50,
        outputTokens: 12,
      });
    });

    it('falha do provider no caminho GERAL é sanitizada da mesma forma que no caminho DATA, mensagem USER preservada', async () => {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-1', role: 'USER', content: 'Que horas são?', createdAt: new Date() });
      (provider.complete as jest.Mock).mockRejectedValue(new AiProviderError('mensagem interna nunca exposta', 'timeout'));

      const error = await service.sendMessage('org-1', 'user-1', { message: 'Que horas são?' }).catch((e) => e);

      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect(prisma.aiMessage.create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('uma continuação sem contexto financeiro recente ("Só isso.") é tratada como geral, nunca força o caminho financeiro', async () => {
      const { service, prisma, provider, financialRetrieval } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      (provider.complete as jest.Mock).mockResolvedValue({ content: 'ok', provider: 'mock', model: 'mock-echo-1' });
      prisma.$transaction.mockImplementation((cb: (tx: MockPrismaService) => unknown) => cb(prisma));
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-2', role: 'ASSISTANT', content: 'ok', createdAt: new Date() });

      await service.sendMessage('org-1', 'user-1', { message: 'Só isso.' });

      expect(financialRetrieval.retrieve).not.toHaveBeenCalled();
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

  describe('sendMessage — falha do provider (retrieval DATA)', () => {
    async function expectSanitizedError(
      code: 'timeout' | 'provider_unavailable' | 'model_not_found' | 'authentication' | 'rate_limit' | 'invalid_response' | 'unknown',
      expectedType: new (...args: never[]) => Error,
      expectedStatus?: number,
    ) {
      const { service, prisma, provider } = buildService();
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiMessage.findMany.mockResolvedValue([]);
      prisma.aiMessage.create.mockResolvedValue({ id: 'msg-1', role: 'USER', content: 'Olá', createdAt: new Date() });
      (provider.complete as jest.Mock).mockRejectedValue(new AiProviderError('mensagem interna nunca exposta', code));

      const error = await service.sendMessage('org-1', 'user-1', { message: 'Olá' }).catch((e) => e);

      expect(error).toBeInstanceOf(expectedType);
      expect(error.message).not.toContain('mensagem interna nunca exposta');
      if (expectedStatus !== undefined) {
        expect((error as HttpException).getStatus()).toBe(expectedStatus);
      }
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
    it('authentication → 503 sanitizado (erro de configuração do servidor, nunca do pedido do cliente)', () =>
      expectSanitizedError('authentication', ServiceUnavailableException));
    it('rate_limit → 429 sanitizado', () => expectSanitizedError('rate_limit', HttpException, HttpStatus.TOO_MANY_REQUESTS));
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

  describe('Fase 8.3 — titlePreview (primeira mensagem, não a última)', () => {
    it('listConversations pede a primeira mensagem de cada conversa (createdAt asc, take 1)', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findMany.mockResolvedValue([]);
      prisma.aiConversation.count.mockResolvedValue(0);

      await service.listConversations('org-1', 'user-1', {});

      expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } } }),
      );
    });

    it('titlePreview deriva da primeira mensagem persistida, nunca da última', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [{ content: 'Primeira pergunta da conversa' }],
        },
      ]);
      prisma.aiConversation.count.mockResolvedValue(1);

      const result = await service.listConversations('org-1', 'user-1', {});

      expect(result.items[0].titlePreview).toBe('Primeira pergunta da conversa');
    });

    it('getConversation deriva titlePreview da primeira mensagem, mesmo com várias mensagens carregadas', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          { id: 'm1', role: 'USER', content: 'Primeira mensagem', createdAt: new Date('2026-07-16T10:00:00Z') },
          { id: 'm2', role: 'ASSISTANT', content: 'Última resposta', createdAt: new Date('2026-07-16T10:01:00Z') },
        ],
      });

      const result = await service.getConversation('org-1', 'user-1', 'conv-1');

      expect(result.titlePreview).toBe('Primeira mensagem');
    });
  });

  describe('Fase 8.3 — deleteConversation', () => {
    it('elimina uma conversa própria e devolve void', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-1', organizationId: 'org-1', userId: 'user-1' });
      prisma.aiConversation.delete.mockResolvedValue({ id: 'conv-1' });

      await service.deleteConversation('org-1', 'user-1', 'conv-1');

      expect(prisma.aiConversation.delete).toHaveBeenCalledWith({ where: { id: 'conv-1' } });
    });

    it('404 genérico para conversa de outra organização — nunca chega a eliminar', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(service.deleteConversation('org-1', 'user-1', 'conv-of-other-org')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.aiConversation.delete).not.toHaveBeenCalled();
    });

    it('404 genérico para conversa de outro utilizador da mesma organização — nunca chega a eliminar', async () => {
      const { service, prisma } = buildService();
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(service.deleteConversation('org-1', 'user-1', 'conv-of-other-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-of-other-user', organizationId: 'org-1', userId: 'user-1' },
      });
      expect(prisma.aiConversation.delete).not.toHaveBeenCalled();
    });
  });
});
