import { AiTenantContextService } from './ai-tenant-context.service';
import type { FinancialRetrievalService } from './financial-retrieval/financial-retrieval.service';
import type { FinancialRetrievalResult } from './financial-retrieval/financial-retrieval.service';

const NOW = new Date('2026-07-16T12:00:00Z');

describe('AiTenantContextService', () => {
  function buildService(retrieve: jest.Mock) {
    const financialRetrieval = { retrieve } as unknown as FinancialRetrievalService;
    return new AiTenantContextService(financialRetrieval);
  }

  it('delega no FinancialRetrievalService com a organização autenticada, a mensagem e a data de referência', async () => {
    const retrieve = jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult);
    const service = buildService(retrieve);

    await service.buildSystemMessage('org-1', 'Quanto gastei este mês?', NOW);

    expect(retrieve).toHaveBeenCalledWith('org-1', 'Quanto gastei este mês?', NOW);
  });

  it('devolve uma mensagem "system" com as regras obrigatórias', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Olá', NOW);

    expect(message.role).toBe('system');
    expect(message.content).toContain('Responde só com base nos dados financeiros fornecidos');
    expect(message.content).toContain('nunca adivinhes');
    expect(message.content).toContain('Nunca inventes valores, datas, fornecedores, categorias, faturas');
    expect(message.content).toContain('Nunca sugiras nem finjas alterar');
    expect(message.content).toContain('nunca afirmes que executaste');
  });

  it('regras incluem a definição de "Por pagar" e a proibição de recalcular um total já fornecido', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Olá', NOW);

    expect(message.content).toContain('"Por pagar" significa sempre Pendente + Vencida — nunca inclui faturas Pagas.');
    expect(message.content).toContain('nunca o recalcules, estimes ou infiras a partir de outros números');
  });

  it('regras exigem explicações baseadas exclusivamente nos dados fornecidos, nunca em operações inventadas', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Olá', NOW);

    expect(message.content).toContain('nunca inventes operações matemáticas nem dados adicionais');
  });

  it('regras exigem português de Portugal, proíbem "você" e exigem estados traduzidos', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Olá', NOW);

    expect(message.content).toContain('Responde sempre em português de Portugal');
    expect(message.content).toContain('nunca uses "você"');
    expect(message.content).toContain('Usa sempre os nomes traduzidos dos estados das faturas (Pendente, Paga, Vencida, Cancelada)');
  });

  it('pergunta não suportada produz orientação explícita, sem dados financeiros', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Qual é a melhor receita para bacalhau?', NOW);

    expect(message.content).toContain('fora das consultas financeiras disponíveis');
  });

  it('período em falta produz um pedido de clarificação, nunca assume o mês atual', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'PERIOD_MISSING' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Quanto gastei?', NOW);

    expect(message.content).toContain('não foi possível identificar um período');
  });

  it('período ambíguo produz um pedido de clarificação distinto', async () => {
    const service = buildService(jest.fn().mockResolvedValue({ kind: 'PERIOD_AMBIGUOUS' } satisfies FinancialRetrievalResult));

    const message = await service.buildSystemMessage('org-1', 'Quanto gastei no Natal?', NOW);

    expect(message.content).toContain('não foi possível interpretar com segurança');
  });

  it('período sem faturas produz uma nota explícita, sem inventar dados', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: {
          intent: 'FINANCIAL_SUMMARY',
          totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
        },
      } satisfies FinancialRetrievalResult),
    );

    const message = await service.buildSystemMessage('org-1', 'Quanto gastei este mês?', NOW);

    expect(message.content).toContain('Sem faturas confirmadas neste período.');
  });

  it('inclui os dados selecionados pelo retrieval quando existem', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: {
          intent: 'BY_STATUS',
          byStatus: [
            { status: 'PENDING', count: 2, totalAmount: '316.00' },
            { status: 'OVERDUE', count: 2, totalAmount: '54.00' },
          ],
        },
      } satisfies FinancialRetrievalResult),
    );

    const message = await service.buildSystemMessage('org-1', 'Valores por estado este mês', NOW);

    expect(message.content).toContain('Por estado: Pendente: 2 fatura(s), 316.00 EUR; Vencida: 2 fatura(s), 54.00 EUR.');
  });

  it('a linha "Por estado" nunca expõe os enums internos (PENDING/OVERDUE/PAID/CANCELLED)', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: {
          intent: 'BY_STATUS',
          byStatus: [{ status: 'PENDING', count: 2, totalAmount: '316.00' }],
        },
      } satisfies FinancialRetrievalResult),
    );

    const message = await service.buildSystemMessage('org-1', 'Valores por estado este mês', NOW);
    const statusLine = message.content.split('\n').find((line) => line.startsWith('Por estado:'));

    expect(statusLine).toBeDefined();
    expect(statusLine).not.toMatch(/\b(PENDING|OVERDUE|PAID|CANCELLED)\b/);
  });

  it('calcula "Por pagar" como Pendente + Vencida, nunca incluindo Paga, de forma determinística (Prisma.Decimal, não number)', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 4, outstandingAmount: '370.00' },
      } satisfies FinancialRetrievalResult),
    );

    const message = await service.buildSystemMessage('org-1', 'Quanto tenho por pagar este mês?', NOW);

    expect(message.content).toContain('Por pagar (Pendente + Vencida): 4 fatura(s), 370.00 EUR.');
  });

  it('"Por pagar" com zero faturas pendentes/vencidas devolve 0, nunca omite a linha', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 0, outstandingAmount: '0.00' },
      } satisfies FinancialRetrievalResult),
    );

    const message = await service.buildSystemMessage('org-1', 'Quanto tenho por pagar este mês?', NOW);

    expect(message.content).toContain('Por pagar (Pendente + Vencida): 0 fatura(s), 0.00 EUR.');
  });

  it('nunca inclui dados de outra organização — o organizationId pedido é o único encaminhado ao retrieval', async () => {
    const retrieve = jest.fn().mockResolvedValue({ kind: 'UNSUPPORTED' } satisfies FinancialRetrievalResult);
    const service = buildService(retrieve);

    await service.buildSystemMessage('org-only-this-one', 'Olá', NOW);

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('org-only-this-one', 'Olá', NOW);
  });
});
