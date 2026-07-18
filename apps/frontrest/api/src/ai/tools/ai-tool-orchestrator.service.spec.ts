import { AiToolOrchestratorService } from './ai-tool-orchestrator.service';
import type { AiCompletionProvider, AiMessage } from '@frontcore/ai';
import type { FinancialRetrievalService } from '../financial-retrieval/financial-retrieval.service';
import type { FinancialRetrievalResult } from '../financial-retrieval/financial-retrieval.service';

const HISTORY: AiMessage[] = [{ role: 'user', content: 'Onde estou a gastar mais dinheiro este período?' }];

const FILLED_DATA_RESULT: FinancialRetrievalResult = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: { intent: 'TOP_SUPPLIERS', topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }] },
  filters: {},
};

function toolCallResponse(name: string, args: unknown, id = 'call-1') {
  return { content: '', provider: 'mock', model: 'mock-echo-1', toolCalls: [{ id, name, arguments: JSON.stringify(args) }] };
}

function textResponse(content: string, provider = 'mock', model = 'mock-echo-1', usage?: { inputTokens: number; outputTokens: number }) {
  return { content, provider, model, ...(usage ? { usage } : {}) };
}

describe('AiToolOrchestratorService', () => {
  function buildService(complete: jest.Mock, retrieveForIntent: jest.Mock = jest.fn()) {
    const provider = { name: 'mock', complete } as unknown as AiCompletionProvider;
    const financialRetrieval = { retrieveForIntent } as unknown as FinancialRetrievalService;
    return { service: new AiToolOrchestratorService(provider, financialRetrieval), complete, retrieveForIntent };
  }

  it('sem tool call na primeira resposta, devolve NOT_ANSWERED — texto livre nunca é a resposta final', async () => {
    const complete = jest.fn().mockResolvedValue(textResponse('Não sei responder a isto.'));
    const { service, retrieveForIntent } = buildService(complete);

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(retrieveForIntent).not.toHaveBeenCalled();
  });

  it('primeira chamada oferece as 6 tools financeiras', async () => {
    const complete = jest.fn().mockResolvedValue(textResponse('sem tool'));
    const { service } = buildService(complete);

    await service.run('org-1', HISTORY);

    const request = complete.mock.calls[0][0];
    expect(request.tools).toHaveLength(7);
    expect(request.tools.map((t: { name: string }) => t.name)).toEqual([
      'get_financial_summary',
      'get_outstanding_balance',
      'get_invoices_by_status',
      'get_expenses_by_category',
      'get_top_suppliers',
      'get_monthly_trend',
      'get_largest_expenses',
    ]);
  });

  it('nome de tool fora da allow-list nunca é executado', async () => {
    const complete = jest.fn().mockResolvedValue(toolCallResponse('delete_all_invoices', { period: 'este mês' }));
    const { service, retrieveForIntent } = buildService(complete);

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
    expect(retrieveForIntent).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1); // nunca faz a 2ª chamada
  });

  it('argumentos com JSON inválido nunca são executados', async () => {
    const complete = jest.fn().mockResolvedValue({
      content: '',
      provider: 'mock',
      model: 'mock-echo-1',
      toolCalls: [{ id: 'call-1', name: 'get_top_suppliers', arguments: 'não é json' }],
    });
    const { service, retrieveForIntent } = buildService(complete);

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
    expect(retrieveForIntent).not.toHaveBeenCalled();
  });

  it('sem "period" nos argumentos, nunca executa a tool', async () => {
    const complete = jest.fn().mockResolvedValue(toolCallResponse('get_top_suppliers', {}));
    const { service, retrieveForIntent } = buildService(complete);

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
    expect(retrieveForIntent).not.toHaveBeenCalled();
  });

  it('tool call válida + DATA: executa a tool com o organizationId do chamador, nunca de args, e devolve ANSWERED', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês', organizationId: 'org-hacked' }))
      .mockResolvedValueOnce(textResponse('O fornecedor onde mais gastou foi a Hetzner.', 'ollama', 'qwen3:4b', { inputTokens: 100, outputTokens: 20 }));
    const retrieveForIntent = jest.fn().mockResolvedValue(FILLED_DATA_RESULT);
    const { service } = buildService(complete, retrieveForIntent);

    const result = await service.run('org-1', HISTORY);

    expect(retrieveForIntent).toHaveBeenCalledWith('org-1', 'TOP_SUPPLIERS', 'este mês', { status: undefined, supplierName: undefined, categoryName: undefined });
    expect(result).toEqual({
      kind: 'ANSWERED',
      content: 'O fornecedor onde mais gastou foi a Hetzner.',
      provider: 'ollama',
      model: 'qwen3:4b',
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  it('a 2ª chamada nunca volta a oferecer tools — nunca uma segunda tool call', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês' }))
      .mockResolvedValueOnce(textResponse('ok'));
    const { service } = buildService(complete, jest.fn().mockResolvedValue(FILLED_DATA_RESULT));

    await service.run('org-1', HISTORY);

    const secondRequest = complete.mock.calls[1][0];
    expect(secondRequest.tools).toBeUndefined();
  });

  it('a mensagem "tool" da 2ª chamada inclui o resultado real do retrieval, nunca inventado', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês' }))
      .mockResolvedValueOnce(textResponse('ok'));
    const { service } = buildService(complete, jest.fn().mockResolvedValue(FILLED_DATA_RESULT));

    await service.run('org-1', HISTORY);

    const secondRequest = complete.mock.calls[1][0];
    const toolMessage = secondRequest.messages.find((m: AiMessage) => m.role === 'tool');
    expect(toolMessage.content).toContain('Hetzner');
    expect(toolMessage.content).toContain('354.00');
    expect(toolMessage.toolCallId).toBe('call-1');
  });

  it('a mensagem "assistant" reconstruída na 2ª chamada preserva os toolCalls da 1ª resposta', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês' }))
      .mockResolvedValueOnce(textResponse('ok'));
    const { service } = buildService(complete, jest.fn().mockResolvedValue(FILLED_DATA_RESULT));

    await service.run('org-1', HISTORY);

    const secondRequest = complete.mock.calls[1][0];
    const assistantMessage = secondRequest.messages.find(
      (m: AiMessage) => m.role === 'assistant' && m.toolCalls,
    );
    expect(assistantMessage.toolCalls).toEqual([
      { id: 'call-1', name: 'get_top_suppliers', arguments: JSON.stringify({ period: 'este mês' }) },
    ]);
  });

  it.each([
    ['PERIOD_AMBIGUOUS', { kind: 'PERIOD_AMBIGUOUS' } satisfies FinancialRetrievalResult],
    ['PERIOD_MISSING', { kind: 'PERIOD_MISSING' } satisfies FinancialRetrievalResult],
    ['ERROR', { kind: 'ERROR' } satisfies FinancialRetrievalResult],
    ['UNSUPPORTED', { kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult],
    ['ENTITY_AMBIGUOUS', { kind: 'ENTITY_AMBIGUOUS' } satisfies FinancialRetrievalResult],
  ])(
    'tool call válida mas retrieveForIntent devolve %s (não-DATA): devolve NOT_ANSWERED de imediato, nunca faz a 2ª chamada ao provider',
    async (_label, nonDataResult) => {
      const complete = jest.fn().mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'no Natal' }));
      const retrieveForIntent = jest.fn().mockResolvedValue(nonDataResult);
      const { service } = buildService(complete, retrieveForIntent);

      const result = await service.run('org-1', HISTORY);

      expect(result).toEqual({ kind: 'NOT_ANSWERED' });
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  describe('Fase 8.4 — filtros opcionais (status/supplierName/categoryName)', () => {
    it('encaminha status/supplierName/categoryName válidos para retrieveForIntent', async () => {
      const complete = jest
        .fn()
        .mockResolvedValueOnce(toolCallResponse('get_financial_summary', { period: 'este mês', status: 'PAID', supplierName: 'Hetzner', categoryName: 'Hosting' }))
        .mockResolvedValueOnce(textResponse('ok'));
      const retrieveForIntent = jest.fn().mockResolvedValue(FILLED_DATA_RESULT);
      const { service } = buildService(complete, retrieveForIntent);

      await service.run('org-1', HISTORY);

      expect(retrieveForIntent).toHaveBeenCalledWith('org-1', 'FINANCIAL_SUMMARY', 'este mês', {
        status: 'PAID',
        supplierName: 'Hetzner',
        categoryName: 'Hosting',
      });
    });

    it('um status fora do enum real (inventado pelo modelo) nunca é encaminhado — tratado como ausente', async () => {
      const complete = jest
        .fn()
        .mockResolvedValueOnce(toolCallResponse('get_financial_summary', { period: 'este mês', status: 'INVENTED_STATUS' }))
        .mockResolvedValueOnce(textResponse('ok'));
      const retrieveForIntent = jest.fn().mockResolvedValue(FILLED_DATA_RESULT);
      const { service } = buildService(complete, retrieveForIntent);

      await service.run('org-1', HISTORY);

      expect(retrieveForIntent).toHaveBeenCalledWith('org-1', 'FINANCIAL_SUMMARY', 'este mês', {
        status: undefined,
        supplierName: undefined,
        categoryName: undefined,
      });
    });

    it('ENTITY_AMBIGUOUS (nome de fornecedor ambíguo) devolve NOT_ANSWERED, nunca escolhe arbitrariamente', async () => {
      const complete = jest.fn().mockResolvedValueOnce(toolCallResponse('get_financial_summary', { period: 'este mês', supplierName: 'H' }));
      const retrieveForIntent = jest.fn().mockResolvedValue({ kind: 'ENTITY_AMBIGUOUS' } satisfies FinancialRetrievalResult);
      const { service } = buildService(complete, retrieveForIntent);

      const result = await service.run('org-1', HISTORY);

      expect(result).toEqual({ kind: 'NOT_ANSWERED' });
      expect(complete).toHaveBeenCalledTimes(1);
    });
  });

  it('primeira chamada oferece a tool nova get_largest_expenses', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_largest_expenses', { period: 'este mês' }))
      .mockResolvedValueOnce(textResponse('ok'));
    const retrieveForIntent = jest.fn().mockResolvedValue({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'LARGEST_INVOICES', invoices: [] },
      filters: {},
    } satisfies FinancialRetrievalResult);
    const { service } = buildService(complete, retrieveForIntent);

    await service.run('org-1', HISTORY);

    expect(retrieveForIntent).toHaveBeenCalledWith('org-1', 'LARGEST_INVOICES', 'este mês', {
      status: undefined,
      supplierName: undefined,
      categoryName: undefined,
    });
  });

  it('falha do provider na 1ª chamada devolve NOT_ANSWERED, nunca propaga a exceção', async () => {
    const complete = jest.fn().mockRejectedValue(new Error('falha de rede'));
    const { service } = buildService(complete);

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
  });

  it('falha do provider na 2ª chamada devolve NOT_ANSWERED, nunca propaga a exceção', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês' }))
      .mockRejectedValueOnce(new Error('falha de rede'));
    const { service } = buildService(complete, jest.fn().mockResolvedValue(FILLED_DATA_RESULT));

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
  });

  it('resposta final vazia (sem conteúdo) devolve NOT_ANSWERED', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(toolCallResponse('get_top_suppliers', { period: 'este mês' }))
      .mockResolvedValueOnce(textResponse(''));
    const { service } = buildService(complete, jest.fn().mockResolvedValue(FILLED_DATA_RESULT));

    const result = await service.run('org-1', HISTORY);

    expect(result).toEqual({ kind: 'NOT_ANSWERED' });
  });

  it('só usa a primeira tool call quando o provider devolve mais do que uma (bounded a 1)', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce({
        content: '',
        provider: 'mock',
        model: 'mock-echo-1',
        toolCalls: [
          { id: 'call-1', name: 'get_top_suppliers', arguments: JSON.stringify({ period: 'este mês' }) },
          { id: 'call-2', name: 'get_monthly_trend', arguments: JSON.stringify({ period: 'este ano' }) },
        ],
      })
      .mockResolvedValueOnce(textResponse('ok'));
    const retrieveForIntent = jest.fn().mockResolvedValue(FILLED_DATA_RESULT);
    const { service } = buildService(complete, retrieveForIntent);

    await service.run('org-1', HISTORY);

    expect(retrieveForIntent).toHaveBeenCalledTimes(1);
    expect(retrieveForIntent).toHaveBeenCalledWith('org-1', 'TOP_SUPPLIERS', 'este mês', { status: undefined, supplierName: undefined, categoryName: undefined });
  });
});
