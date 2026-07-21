import { FinancialRetrievalService } from './financial-retrieval.service';
import type { DashboardService } from '../../dashboard/dashboard.service';
import type { FinancialDashboardSummary, LargestInvoice } from '../../dashboard/dashboard.service';
import type { FinancialEntityResolverService, EntityMentionResolution } from './entity-resolver.service';
import type { FinancialConversationContextV1 } from './financial-conversation-context';

const NOW = new Date('2026-07-16T12:00:00Z');

const FILLED_SUMMARY: FinancialDashboardSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
  byStatus: [
    { status: 'PENDING', count: 2, totalAmount: '316.00' },
    { status: 'OVERDUE', count: 2, totalAmount: '54.00' },
  ],
  monthlyTrend: [{ month: '2026-07', count: 4, totalAmount: '370.00' }],
  byCategory: [{ categoryId: 'cat-1', categoryName: 'Hosting', count: 3, totalAmount: '354.00' }],
  topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }],
};

const EMPTY_SUMMARY: FinancialDashboardSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
  byStatus: [],
  monthlyTrend: [],
  byCategory: [],
  topSuppliers: [],
};

const NONE: EntityMentionResolution = { kind: 'NONE' };

/** Fase 8.6 — resumo mínimo com período e totais próprios, para os testes de PERIOD_COMPARISON (dois períodos, cada um com o seu próprio resumo). */
function summaryWith(
  period: { from: string; to: string },
  totals: Partial<FinancialDashboardSummary['totals']>,
): FinancialDashboardSummary {
  return {
    ...EMPTY_SUMMARY,
    period,
    totals: { ...EMPTY_SUMMARY.totals, ...totals },
  };
}

describe('FinancialRetrievalService', () => {
  function buildService(
    getFinancialSummary: jest.Mock,
    options: {
      getLargestInvoices?: jest.Mock;
      resolveSupplierMention?: jest.Mock;
      resolveCategoryMention?: jest.Mock;
    } = {},
  ) {
    const dashboardService = {
      getFinancialSummary,
      getLargestInvoices: options.getLargestInvoices ?? jest.fn(),
    } as unknown as DashboardService;
    const entityResolver = {
      resolveSupplierMention: options.resolveSupplierMention ?? jest.fn().mockResolvedValue(NONE),
      resolveCategoryMention: options.resolveCategoryMention ?? jest.fn().mockResolvedValue(NONE),
    } as unknown as FinancialEntityResolverService;
    return { service: new FinancialRetrievalService(dashboardService, entityResolver), getFinancialSummary, entityResolver };
  }

  it('UNSUPPORTED nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Qual é a melhor receita para bacalhau?', [], NOW);

    expect(result).toEqual({ kind: 'UNSUPPORTED' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('PERIOD_MISSING nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Quanto gastei?', [], NOW);

    expect(result).toEqual({ kind: 'PERIOD_MISSING' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('PERIOD_AMBIGUOUS nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Quanto gastei no Natal?', [], NOW);

    expect(result).toEqual({ kind: 'PERIOD_AMBIGUOUS' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('usa o organizationId autenticado e o período resolvido a partir da mensagem', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    await service.retrieve('org-42', 'Quanto gastei este mês?', [], NOW);

    expect(getFinancialSummary).toHaveBeenCalledWith('org-42', { from: '2026-07-01', to: '2026-07-31' });
  });

  it('FINANCIAL_SUMMARY devolve só totals — nenhum outro bloco', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'FINANCIAL_SUMMARY', totals: FILLED_SUMMARY.totals },
      filters: {},
    });
  });

  it('OUTSTANDING_BALANCE calcula Pendente + Vencida via Decimal, nunca inclui Paga', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto tenho por pagar este mês?', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 4, outstandingAmount: '370.00' },
      filters: {},
    });
  });

  it('OUTSTANDING_BALANCE com zero faturas pendentes/vencidas devolve zero, nunca omite o campo', async () => {
    const onlyPaid: FinancialDashboardSummary = {
      ...FILLED_SUMMARY,
      byStatus: [{ status: 'PAID', count: 1, totalAmount: '80.00' }],
    };
    const { service } = buildService(jest.fn().mockResolvedValue(onlyPaid));

    const result = await service.retrieve('org-1', 'Quanto tenho por pagar este mês?', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 0, outstandingAmount: '0.00' },
      filters: {},
    });
  });

  it('BY_STATUS devolve só byStatus', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Valores por estado este mês', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'BY_STATUS', byStatus: FILLED_SUMMARY.byStatus },
      filters: {},
    });
  });

  it('BY_CATEGORY devolve só byCategory', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Principais categorias este mês', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'BY_CATEGORY', byCategory: FILLED_SUMMARY.byCategory },
      filters: {},
    });
  });

  it('TOP_SUPPLIERS devolve só topSuppliers', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Principais fornecedores este mês', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'TOP_SUPPLIERS', topSuppliers: FILLED_SUMMARY.topSuppliers },
      filters: {},
    });
  });

  it('MONTHLY_TREND devolve só monthlyTrend', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Evolução mensal este ano', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'MONTHLY_TREND', monthlyTrend: FILLED_SUMMARY.monthlyTrend },
      filters: {},
    });
  });

  it('consulta válida sem faturas devolve DATA com arrays/zeros, nunca UNSUPPORTED nem ERROR', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(EMPTY_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', [], NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'FINANCIAL_SUMMARY', totals: EMPTY_SUMMARY.totals },
      filters: {},
    });
  });

  it('erro do DashboardService devolve ERROR, nunca propaga a exceção', async () => {
    const { service } = buildService(jest.fn().mockRejectedValue(new Error('falha interna de base de dados')));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', [], NOW);

    expect(result).toEqual({ kind: 'ERROR' });
  });

  it('nunca envia dados de outra organização — só o organizationId pedido é usado na query', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    await service.retrieve('org-only-this-one', 'Quanto gastei este mês?', [], NOW);

    expect(getFinancialSummary).toHaveBeenCalledTimes(1);
    expect(getFinancialSummary).toHaveBeenCalledWith('org-only-this-one', expect.any(Object));
  });

  describe('Fase 8.3 — recuperação por histórico (intenção/período)', () => {
    it('"sim este mês" recupera a intenção da mensagem anterior (regressão real)', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieve(
        'org-1',
        'sim este mes',
        ['Faz um resumo financeiro da empresa.'],
        NOW,
      );

      expect(result).toEqual({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'FINANCIAL_SUMMARY', totals: FILLED_SUMMARY.totals },
        filters: {},
      });
      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
    });

    it('pergunta nova sem período recupera o período de uma mensagem anterior (regressão real)', async () => {
      const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieve(
        'org-1',
        'Qual é o fornecedor onde mais gastamos?',
        ['Existem faturas pendentes?', 'sim este mes', 'Faz um resumo financeiro da empresa.'],
        NOW,
      );

      expect(result).toEqual({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'TOP_SUPPLIERS', topSuppliers: FILLED_SUMMARY.topSuppliers },
        filters: {},
      });
    });

    it('usa sempre a mensagem anterior MAIS RECENTE que resolve, nunca uma mais antiga', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      // "Este mês" (mais recente) deve vencer sobre "este ano" (mais antigo) — ordem: mais recente primeiro.
      await service.retrieve(
        'org-1',
        'Qual é o fornecedor onde mais gastamos?',
        ['Resumo deste mês', 'Resumo deste ano'],
        NOW,
      );

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
    });

    it('sem intenção nem período em nenhuma mensagem (atual ou histórico) continua UNSUPPORTED', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      const result = await service.retrieve('org-1', 'Qual é a melhor receita para bacalhau?', ['Olá', 'Bom dia'], NOW);

      expect(result).toEqual({ kind: 'UNSUPPORTED' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('mensagem atual sem intenção nem período próprios nunca recupera intenção do histórico (exige período próprio primeiro)', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      // "Olá" não tem período próprio — não deve tentar recuperar a intenção de "Quanto gastei este mês?".
      const result = await service.retrieve('org-1', 'Olá', ['Quanto gastei este mês?'], NOW);

      expect(result).toEqual({ kind: 'UNSUPPORTED' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('histórico vazio nunca lança — comportamento idêntico a omitir o parâmetro', async () => {
      const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieve('org-1', 'Quanto tenho por pagar este mês?', [], NOW);

      expect(result.kind).toBe('DATA');
    });

    it('período ambíguo na mensagem atual, sem recuperação possível no histórico, preserva PERIOD_AMBIGUOUS', async () => {
      const { service } = buildService(jest.fn());

      const result = await service.retrieve('org-1', 'Quanto tenho por pagar no Natal?', ['Olá'], NOW);

      expect(result).toEqual({ kind: 'PERIOD_AMBIGUOUS' });
    });
  });

  describe('Fase 8.4 — LARGEST_INVOICES (maiores faturas individuais)', () => {
    it('devolve as faturas individuais reais, via DashboardService.getLargestInvoices', async () => {
      const invoices: LargestInvoice[] = [
        { id: 'inv-1', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-10', status: 'PAID', totalAmount: '500.00' },
      ];
      const getLargestInvoices = jest.fn().mockResolvedValue({ period: { from: '2026-07-01', to: '2026-07-31' }, invoices });
      const { service } = buildService(jest.fn(), { getLargestInvoices });

      const result = await service.retrieve('org-1', 'Quais são as maiores faturas deste mês?', [], NOW);

      expect(result).toEqual({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'LARGEST_INVOICES', invoices },
        filters: {},
      });
      expect(getLargestInvoices).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
    });

    it('erro do DashboardService devolve ERROR, nunca propaga', async () => {
      const getLargestInvoices = jest.fn().mockRejectedValue(new Error('falha'));
      const { service } = buildService(jest.fn(), { getLargestInvoices });

      const result = await service.retrieve('org-1', 'Quais são as maiores faturas deste mês?', [], NOW);

      expect(result).toEqual({ kind: 'ERROR' });
    });
  });

  describe('Fase 8.4 — filtro por estado específico ("quantas pagas/vencidas/pendentes")', () => {
    it('encaminha o status resolvido pela intenção para DashboardService, e devolve-o em filters', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieve('org-1', 'Quantas faturas pagas este mês?', [], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31', status: 'PAID' });
      expect(result).toMatchObject({ kind: 'DATA', filters: { status: 'PAID' } });
    });
  });

  describe('Fase 8.4 — filtro por fornecedor/categoria nomeado', () => {
    it('resolve o fornecedor mencionado e encaminha o id para DashboardService', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), { resolveSupplierMention });

      const result = await service.retrieve('org-1', 'Quanto gastei com a Hetzner este mês?', [], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31', supplierId: 'sup-1' });
      expect(result).toMatchObject({ kind: 'DATA', filters: { supplierId: 'sup-1', supplierName: 'Hetzner' } });
    });

    it('entidade ambígua (duas correspondências distintas) devolve ENTITY_AMBIGUOUS, nunca escolhe uma arbitrariamente', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'AMBIGUOUS' });
      const { service, getFinancialSummary } = buildService(jest.fn(), { resolveSupplierMention });

      const result = await service.retrieve('org-1', 'Quanto gastei este mês?', [], NOW);

      expect(result).toEqual({ kind: 'ENTITY_AMBIGUOUS' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('regressão real: fornecedor e categoria com o mesmo nome (ex. "Hetzner") nunca são combinados como filtro AND — o fornecedor prevalece', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const resolveCategoryMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'cat-hetzner', name: 'Hetzner' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveSupplierMention,
        resolveCategoryMention,
      });

      const result = await service.retrieve('org-1', 'Quanto gastei com a Hetzner este mês?', [], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31', supplierId: 'sup-1' });
      expect(result).toMatchObject({ kind: 'DATA', filters: { supplierId: 'sup-1', supplierName: 'Hetzner' } });
      expect((result as { filters: object }).filters).not.toHaveProperty('categoryId');
    });

    it('fornecedor e categoria com nomes DIFERENTES continuam combinados normalmente (nunca afetado pela regra de colisão)', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const resolveCategoryMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'cat-1', name: 'Hosting' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveSupplierMention,
        resolveCategoryMention,
      });

      const result = await service.retrieve('org-1', 'Quanto gastei em Hosting com a Hetzner este mês?', [], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        supplierId: 'sup-1',
        categoryId: 'cat-1',
      });
      expect(result).toMatchObject({
        kind: 'DATA',
        filters: { supplierId: 'sup-1', supplierName: 'Hetzner', categoryId: 'cat-1', categoryName: 'Hosting' },
      });
    });
  });

  describe('Fase 8.4 — continuidade conversacional estruturada (filtros)', () => {
    it('"E só da Hetzner?" (continuação) recupera intenção/período do histórico e aplica o fornecedor da mensagem atual', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), { resolveSupplierMention });

      const result = await service.retrieve('org-1', 'E só da Hetzner?', ['Quantas faturas pagas este mês?'], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'PAID',
        supplierId: 'sup-1',
      });
      expect(result).toMatchObject({ filters: { status: 'PAID', supplierId: 'sup-1', supplierName: 'Hetzner' } });
    });

    it('"Mostra apenas as vencidas." substitui o estado herdado pelo indicado na mensagem atual', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), { resolveSupplierMention });

      // Histórico: pergunta anterior tinha filtro de fornecedor (Hetzner, resolvido pelo mesmo mock aqui por simplicidade).
      const result = await service.retrieve('org-1', 'Mostra apenas as vencidas.', ['Quanto gastei com a Hetzner este mês?'], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'OVERDUE',
        supplierId: 'sup-1',
      });
      expect(result).toMatchObject({ filters: { status: 'OVERDUE', supplierId: 'sup-1' } });
    });

    it('sem sinal de continuação, uma pergunta financeira nova NUNCA herda filtros de uma mensagem anterior não relacionada', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieve('org-1', 'Quanto gastei este mês?', ['Quantas faturas pagas este mês?'], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
      expect(result).toMatchObject({ filters: {} });
    });
  });

  describe('Fase 8.5 — continuidade de filtros explícitos (prioridade absoluta da mensagem atual)', () => {
    it.each([
      ['só as pagas', 'PAID'],
      ['apenas as canceladas', 'CANCELLED'],
      ['só as vencidas', 'OVERDUE'],
      ['só as pendentes', 'PENDING'],
      ['e dessas, quantas estão pagas?', 'PAID'],
    ] as const)('"%s" como continuação aplica status=%s da mensagem atual, nunca o herdado', async (message, expectedStatus) => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      // Histórico com um filtro de estado DIFERENTE do pedido pela mensagem atual —
      // prova que o estado herdado nunca sobrevive quando a mensagem atual tem o seu próprio.
      const result = await service.retrieve('org-1', message, ['Quantas faturas pagas este mês?'], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: expectedStatus,
      });
      expect(result).toMatchObject({ kind: 'DATA', filters: { status: expectedStatus } });
    });

    it('substituição explícita do ESTADO herdado — mensagem atual muda só o estado, fornecedor/categoria herdados mantêm-se', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const resolveCategoryMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'cat-1', name: 'Hosting' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveSupplierMention,
        resolveCategoryMention,
      });

      const result = await service.retrieve(
        'org-1',
        'só as canceladas',
        ['Quanto gastei em Hosting com a Hetzner este mês, das pagas?'],
        NOW,
      );

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'CANCELLED',
        supplierId: 'sup-1',
        categoryId: 'cat-1',
      });
      expect(result).toMatchObject({
        filters: { status: 'CANCELLED', supplierId: 'sup-1', categoryId: 'cat-1' },
      });
    });

    it('substituição explícita do FORNECEDOR herdado — mensagem atual menciona outro fornecedor, estado herdado mantém-se', async () => {
      const resolveSupplierMention = jest
        .fn()
        .mockResolvedValueOnce({ kind: 'RESOLVED', id: 'sup-nos', name: 'NOS' }) // mensagem atual
        .mockResolvedValueOnce({ kind: 'RESOLVED', id: 'sup-hetzner', name: 'Hetzner' }); // recuperação do histórico
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveSupplierMention,
      });

      const result = await service.retrieve(
        'org-1',
        'e da NOS?',
        ['Quantas faturas pagas da Hetzner este mês?'],
        NOW,
      );

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'PAID',
        supplierId: 'sup-nos',
      });
      expect(result).toMatchObject({ filters: { status: 'PAID', supplierId: 'sup-nos', supplierName: 'NOS' } });
    });

    it('substituição explícita da CATEGORIA herdada — mensagem atual menciona outra categoria, estado herdado mantém-se', async () => {
      const resolveCategoryMention = jest
        .fn()
        .mockResolvedValueOnce({ kind: 'RESOLVED', id: 'cat-eletricidade', name: 'Eletricidade' }) // mensagem atual
        .mockResolvedValueOnce({ kind: 'RESOLVED', id: 'cat-hosting', name: 'Hosting' }); // recuperação do histórico
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveCategoryMention,
      });

      const result = await service.retrieve(
        'org-1',
        'e em Eletricidade?',
        ['Quantas faturas pagas em Hosting este mês?'],
        NOW,
      );

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'PAID',
        categoryId: 'cat-eletricidade',
      });
      expect(result).toMatchObject({
        filters: { status: 'PAID', categoryId: 'cat-eletricidade', categoryName: 'Eletricidade' },
      });
    });

    it('herança por dimensão independente — substitui só o estado, herda fornecedor E categoria, nunca troca o objeto inteiro', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const resolveCategoryMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'cat-1', name: 'Hosting' });
      const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), {
        resolveSupplierMention,
        resolveCategoryMention,
      });

      const result = await service.retrieve(
        'org-1',
        'só as vencidas',
        ['Quanto gastei em Hosting com a Hetzner este mês, das pagas?'],
        NOW,
      );

      expect(result).toMatchObject({
        filters: {
          status: 'OVERDUE', // substituído pela mensagem atual
          supplierId: 'sup-1', // herdado, mensagem atual não menciona fornecedor
          categoryId: 'cat-1', // herdado, mensagem atual não menciona categoria
        },
      });
    });

    it('mensagem não financeira fora de continuação com palavra de estado isolada nunca cria filtro nem intenção falsos', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      const result = await service.retrieve('org-1', 'Isto já está pago.', [], NOW);

      expect(result).toEqual({ kind: 'UNSUPPORTED' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('recuperação de intenção E filtro do histórico via extractor — mensagem atual sem intenção nem estado próprios', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      // "e essas?" não resolve nenhuma intenção, período nem estado por si só —
      // recupera os três do histórico: intenção via recoverIntent(), período via
      // recoverPeriod(), estado via resolveStatusFilter() aplicado a cada mensagem
      // anterior (recoverFilters()), nunca via FinancialIntentResolution.statusFilter
      // (removido nesta fase).
      const result = await service.retrieve('org-1', 'e essas?', ['Quantas vencidas este mês?'], NOW);

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'OVERDUE',
      });
      expect(result).toMatchObject({
        kind: 'DATA',
        data: { intent: 'FINANCIAL_SUMMARY' },
        filters: { status: 'OVERDUE' },
      });
    });
  });

  describe('Fase 8.3 — retrieveForIntent (usado pelas AI Tools)', () => {
    it('intenção já conhecida + período em texto livre devolve DATA, mesma fonte que o caminho principal', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

      const result = await service.retrieveForIntent('org-1', 'TOP_SUPPLIERS', 'este mês', {}, NOW);

      expect(result).toEqual({
        kind: 'DATA',
        period: { from: '2026-07-01', to: '2026-07-31' },
        data: { intent: 'TOP_SUPPLIERS', topSuppliers: FILLED_SUMMARY.topSuppliers },
        filters: {},
      });
      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
    });

    it('período em texto livre não resolvível devolve PERIOD_AMBIGUOUS, nunca lança', async () => {
      const { service } = buildService(jest.fn());

      const result = await service.retrieveForIntent('org-1', 'FINANCIAL_SUMMARY', 'no Natal', {}, NOW);

      expect(result).toEqual({ kind: 'PERIOD_AMBIGUOUS' });
    });

    it('nunca recupera por histórico — só usa o período explícito da tool', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      const result = await service.retrieveForIntent('org-1', 'FINANCIAL_SUMMARY', '', {}, NOW);

      expect(result).toEqual({ kind: 'PERIOD_MISSING' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('Fase 8.4 — filtros opcionais da tool (status/supplierName/categoryName) resolvidos e encaminhados', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY), { resolveSupplierMention });

      const result = await service.retrieveForIntent(
        'org-1',
        'FINANCIAL_SUMMARY',
        'este mês',
        { status: 'PAID', supplierName: 'Hetzner' },
        NOW,
      );

      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {
        from: '2026-07-01',
        to: '2026-07-31',
        status: 'PAID',
        supplierId: 'sup-1',
      });
      expect(result).toMatchObject({ filters: { status: 'PAID', supplierId: 'sup-1', supplierName: 'Hetzner' } });
    });

    it('Fase 8.4 — nome de fornecedor ambíguo devolve ENTITY_AMBIGUOUS, nunca escolhe arbitrariamente', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'AMBIGUOUS' });
      const { service, getFinancialSummary } = buildService(jest.fn(), { resolveSupplierMention });

      const result = await service.retrieveForIntent('org-1', 'FINANCIAL_SUMMARY', 'este mês', { supplierName: 'H' }, NOW);

      expect(result).toEqual({ kind: 'ENTITY_AMBIGUOUS' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });
  });

  describe('Fase 8.6 — PERIOD_COMPARISON (comparação de dois períodos nomeados)', () => {
    it('"Compara maio com junho" chama DashboardService duas vezes e devolve a comparação determinística', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summaryWith({ from: '2026-05-01', to: '2026-05-31' }, { totalAmount: '400.00', activeInvoiceCount: 4 }))
        .mockResolvedValueOnce(summaryWith({ from: '2026-06-01', to: '2026-06-30' }, { totalAmount: '200.00', activeInvoiceCount: 2 }));
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Compara maio com junho.', [], NOW);

      expect(getFinancialSummary).toHaveBeenCalledTimes(2);
      expect(getFinancialSummary).toHaveBeenNthCalledWith(1, 'org-1', { from: '2026-05-01', to: '2026-05-31' });
      expect(getFinancialSummary).toHaveBeenNthCalledWith(2, 'org-1', { from: '2026-06-01', to: '2026-06-30' });
      expect(result).toEqual({
        kind: 'DATA',
        period: { from: '2026-05-01', to: '2026-05-31' },
        data: {
          intent: 'PERIOD_COMPARISON',
          current: { period: { from: '2026-05-01', to: '2026-05-31' }, totals: expect.objectContaining({ totalAmount: '400.00' }) },
          previous: { period: { from: '2026-06-01', to: '2026-06-30' }, totals: expect.objectContaining({ totalAmount: '200.00' }) },
          comparison: {
            totalAmount: {
              current: '400.00',
              previous: '200.00',
              absoluteChange: '200.00',
              percentageChange: 100,
              direction: 'increase',
            },
            activeInvoiceCount: expect.objectContaining({ direction: 'increase' }),
          },
        },
        filters: {},
      });
    });

    it('"Este mês versus o mês passado" resolve os dois períodos relativos à data de referência', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(EMPTY_SUMMARY);
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Este mês versus o mês passado.', [], NOW);

      expect(getFinancialSummary).toHaveBeenNthCalledWith(1, 'org-1', { from: '2026-07-01', to: '2026-07-31' });
      expect(getFinancialSummary).toHaveBeenNthCalledWith(2, 'org-1', { from: '2026-06-01', to: '2026-06-30' });
      expect(result).toMatchObject({ kind: 'DATA', data: { intent: 'PERIOD_COMPARISON' } });
    });

    it('período anterior com total zero → percentageChange null, nunca uma divisão por zero', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summaryWith({ from: '2026-05-01', to: '2026-05-31' }, { totalAmount: '150.00', activeInvoiceCount: 3 }))
        .mockResolvedValueOnce(summaryWith({ from: '2026-06-01', to: '2026-06-30' }, { totalAmount: '0.00', activeInvoiceCount: 0 }));
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Compara maio com junho.', [], NOW);

      expect(result).toMatchObject({
        data: {
          comparison: {
            totalAmount: { percentageChange: null, direction: 'increase' },
            activeInvoiceCount: { percentageChange: null, direction: 'increase' },
          },
        },
      });
    });

    it('filtros (estado/fornecedor/categoria) aplicam-se aos dois períodos, sem uma segunda lógica de filtros', async () => {
      const resolveSupplierMention = jest.fn().mockResolvedValue({ kind: 'RESOLVED', id: 'sup-1', name: 'Hetzner' });
      const getFinancialSummary = jest.fn().mockResolvedValue(EMPTY_SUMMARY);
      const { service } = buildService(getFinancialSummary, { resolveSupplierMention });

      const result = await service.retrieve('org-1', 'Compara maio com junho da Hetzner.', [], NOW);

      expect(getFinancialSummary).toHaveBeenNthCalledWith(1, 'org-1', {
        from: '2026-05-01',
        to: '2026-05-31',
        status: undefined,
        supplierId: 'sup-1',
        categoryId: undefined,
      });
      expect(getFinancialSummary).toHaveBeenNthCalledWith(2, 'org-1', {
        from: '2026-06-01',
        to: '2026-06-30',
        status: undefined,
        supplierId: 'sup-1',
        categoryId: undefined,
      });
      expect(result).toMatchObject({ filters: { supplierId: 'sup-1', supplierName: 'Hetzner' } });
    });

    it('um lado da comparação sem período reconhecível (ex. comparação de categorias, fora do âmbito) devolve PERIOD_MISSING, nunca dados fabricados', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      const result = await service.retrieve('org-1', 'Compara a categoria Hosting com a Manutenção.', [], NOW);

      expect(result).toEqual({ kind: 'PERIOD_MISSING' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('PERIOD_COMPARISON nunca é recuperado do histórico — só a mensagem atual decide, ao contrário de intenção/período nos outros intents (Fase 8.3)', async () => {
      const { service, getFinancialSummary } = buildService(jest.fn());

      // A mensagem anterior tem a forma de uma comparação, mas a mensagem
      // atual, sozinha, não tem nenhum sinal financeiro nem de
      // comparação — nunca deve "herdar" PERIOD_COMPARISON do histórico
      // (esse mecanismo, que existe para intenção/período singular desde
      // a Fase 8.3, não se estende a esta fase — decisão explícita, ver
      // "fora do âmbito" em
      // docs/phases/phase-8.6-financial-period-comparison-foundation.md).
      const result = await service.retrieve('org-1', 'Qual é a capital de Portugal?', ['Compara maio com junho.'], NOW);

      expect(result).toEqual({ kind: 'UNSUPPORTED' });
      expect(getFinancialSummary).not.toHaveBeenCalled();
    });

    it('"E comparado com o mês passado?" (comparação relativa a contexto, fora do âmbito) nunca produz um resultado PERIOD_COMPARISON', async () => {
      // Esta frase não tem a forma sintática "X com/versus Y" (só um
      // período nomeado, "mês passado", nunca dois) — resolveFinancialIntent()
      // continua UNSUPPORTED para ela (ver financial-intent.resolver.spec.ts);
      // o mecanismo de recuperação de intenção por histórico, já existente
      // desde a Fase 8.3 para outros intents, pode recuperar uma intenção
      // diferente de PERIOD_COMPARISON a partir de uma mensagem anterior —
      // o único comportamento que esta fase garante é nunca fabricar uma
      // comparação de dois períodos a partir disto.
      const { service } = buildService(jest.fn().mockResolvedValue(EMPTY_SUMMARY));

      const result = await service.retrieve('org-1', 'E comparado com o mês passado?', ['Quanto gastei em junho?'], NOW);

      if (result.kind === 'DATA') {
        expect(result.data.intent).not.toBe('PERIOD_COMPARISON');
      }
    });

    it('erro do DashboardService devolve ERROR, nunca lança', async () => {
      const getFinancialSummary = jest.fn().mockRejectedValue(new Error('db down'));
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Compara maio com junho.', [], NOW);

      expect(result).toEqual({ kind: 'ERROR' });
    });
  });

  describe('Fase 8.7 — recuperação via snapshot persistido (previousContext)', () => {
    const SNAPSHOT: FinancialConversationContextV1 = {
      version: 1,
      intent: 'FINANCIAL_SUMMARY',
      period: { from: '2026-07-01', to: '2026-07-31' },
      filters: { status: 'PENDING', supplierId: 'sup-1', supplierName: 'Hetzner' },
      recordedAt: '2026-07-16T10:00:00.000Z',
    };

    it('uma continuação sem intenção nem período próprios recupera ambos do snapshot, mesmo com recentUserMessages vazio (fora da janela de histórico)', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(FILLED_SUMMARY);
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'E os fornecedores?', [], NOW, SNAPSHOT);

      expect(result.kind).toBe('DATA');
      expect(getFinancialSummary).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
      );
    });

    it('os filtros herdados vêm do snapshot, nunca de recoverFilters() (texto), quando previousContext existe', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(FILLED_SUMMARY);
      const resolveSupplierMention = jest.fn().mockResolvedValue(NONE);
      const { service } = buildService(getFinancialSummary, { resolveSupplierMention });

      const result = await service.retrieve('org-1', 'Mostra só as vencidas.', [], NOW, SNAPSHOT);

      expect(result.kind).toBe('DATA');
      if (result.kind === 'DATA') {
        // "vencidas" resolve o seu próprio estado (OVERDUE) na mensagem
        // atual — substitui sempre o herdado (PENDING) nessa dimensão,
        // mas o fornecedor herdado do snapshot mantém-se.
        expect(result.filters.status).toBe('OVERDUE');
        expect(result.filters.supplierId).toBe('sup-1');
      }
      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', expect.objectContaining({ supplierId: 'sup-1', status: 'OVERDUE' }));
    });

    it('sem sinal de continuação, o snapshot nunca é consultado para filtros (mesma disciplina da Fase 8.4)', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(FILLED_SUMMARY);
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Quanto gastei este mês?', [], NOW, SNAPSHOT);

      expect(result.kind).toBe('DATA');
      if (result.kind === 'DATA') {
        expect(result.filters.supplierId).toBeUndefined();
      }
    });

    it('sem previousContext (null), continua a recuperar por texto do histórico — comportamento anterior a esta fase preservado', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(FILLED_SUMMARY);
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'E os fornecedores?', ['Quanto gastei este mês?'], NOW, null);

      expect(result.kind).toBe('DATA');
    });

    it('PERIOD_COMPARISON nunca lê previousContext — a decisão da Fase 8.6 de nunca recuperar por histórico mantém-se', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summaryWith({ from: '2026-05-01', to: '2026-05-31' }, { totalAmount: '10.00' }))
        .mockResolvedValueOnce(summaryWith({ from: '2026-04-01', to: '2026-04-30' }, { totalAmount: '5.00' }));
      const { service } = buildService(getFinancialSummary);

      const result = await service.retrieve('org-1', 'Compara maio com abril.', [], NOW, SNAPSHOT);

      expect(result.kind).toBe('DATA');
      if (result.kind === 'DATA') {
        expect(result.data.intent).toBe('PERIOD_COMPARISON');
      }
      // Os filtros do snapshot (continuação, Fase 8.7) não se aplicam a
      // uma mensagem sem sinal de continuação — "compara maio com abril"
      // não ativa `hasContinuationSignal()`.
      expect(getFinancialSummary).toHaveBeenCalledWith('org-1', expect.objectContaining({ supplierId: undefined }));
    });
  });
});
