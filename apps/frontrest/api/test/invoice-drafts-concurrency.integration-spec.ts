import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@frontcore/database';
import type { Prisma } from '@frontcore/database';
import { InvoiceDraftsService } from '../src/invoices/drafts/invoice-drafts.service';
import { FiscalParsingService } from '../src/fiscal-parsing/fiscal-parsing.service';
import {
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
} from '../src/fiscal-parsing/extractors';
import type { AiInvoiceExtractor } from '../src/ai-invoice-extraction/ai-invoice-extractor.service';

/**
 * Correção pós-revisão Codex (Fase 6.14, 2ª ronda — achado CRÍTICO 2).
 * A revisão apontou que testes com Prisma mockado (`$transaction` a
 * invocar o callback de imediato, síncrono) NUNCA conseguem provar que
 * `SELECT ... FOR UPDATE` serializa genuinamente writers concorrentes —
 * só o Postgres real tem essa semântica. Esta suite corre contra o
 * Postgres de desenvolvimento local (`docker compose`, `DATABASE_URL`
 * de `test/setup-env-integration.ts`), isolada num `Organization` de
 * teste criado e apagado por esta suite, NUNCA contra dados reais
 * permanentes — corre só com `pnpm test:integration`, nunca faz parte
 * de `pnpm test`/`pnpm test:e2e` (Fase 4.4: nenhum desses vai contra
 * uma base de dados real).
 *
 * **Correção pós-revisão Codex (3ª ronda) — determinismo da ordem de
 * lock.** A versão anterior (`A`/`B`, um único teste cada) libertava o
 * lock manual e deixava o scheduler do Postgres decidir qual dos dois
 * writers concorrentes o adquiria primeiro — só provava a propriedade
 * "independentemente da ordem, o resultado final é coerente", nunca as
 * DUAS ordens de aquisição em concreto. Esta suite força
 * deterministicamente cada ordem: antes de arrancar o 2º writer,
 * espera-se que o 1º já esteja genuinamente em fila, bloqueado no seu
 * `SELECT ... FOR UPDATE`; só depois arranca o 2º, e só depois de
 * confirmar que AMBOS estão em fila é que o lock manual é libertado.
 * Como o Postgres concede locks de linha em fila (FIFO) entre pedidos
 * em conflito, o writer cujo pedido foi registado primeiro na fila é
 * SEMPRE o primeiro a ser servido. Quatro cenários cobrem as duas
 * ordens possíveis dos dois pares de writers que competem: A1 (humano
 * ganha primeiro) / A2 (IA ganha primeiro); B1 (`replaceItems()` ganha
 * primeiro) / B2 (`promote()` ganha primeiro). O teste C (rollback)
 * mantém-se inalterado — já adequado.
 *
 * **Correção pós-revisão Codex (4ª ronda) — identificação concreta do
 * writer bloqueado.** A barreira da 3ª ronda (`waitForLockWaiters()`)
 * contava `count(DISTINCT pid) FROM pg_locks WHERE NOT granted` a
 * nível GLOBAL — provava que "existem N backends bloqueados algures",
 * nunca que o backend bloqueado era especificamente o do writer que
 * este teste acabou de arrancar. Corrigido: cada writer de cada
 * cenário passa a ter a sua própria ligação Postgres DEDICADA
 * (`createDedicatedWriter()`, `connection_limit=1` na
 * `datasourceUrl`), cujo `pg_backend_pid()` é capturado imediatamente
 * a seguir a `$connect()` — como só existe UMA ligação física nesse
 * pool, esse pid identifica inequivocamente esse writer para o resto
 * do teste (nenhuma outra query, de nenhum outro writer, pode alguma
 * vez usar essa mesma ligação). `waitUntilPidBlocked(pid)` espera,
 * consultando `pg_locks` diretamente (nunca `setTimeout` arbitrário),
 * até EXATAMENTE esse pid aparecer com um pedido `NOT granted` — a
 * prova passa a estar ligada ao writer concreto do cenário, nunca a
 * uma contagem agregada que podia, em teoria, ser satisfeita por
 * qualquer backend.
 */
describe('InvoiceDraftsService — concorrência real contra Postgres (Fase 6.14, correção pós-revisão Codex)', () => {
  let prisma: PrismaService;
  let service: InvoiceDraftsService;
  let aiExtractor: { extract: jest.Mock };
  let organizationId: string;
  let supplierId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: { name: 'Concurrency Test Org', slug: `concurrency-test-${randomUUID()}` },
    });
    organizationId = organization.id;

    const supplier = await prisma.supplier.create({
      data: { organizationId, name: 'Fornecedor de Teste' },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    // O teste B pode ter promovido um InvoiceDraft a Invoice real —
    // apagar sempre antes do Supplier (FK `Invoice.supplierId`).
    await prisma.invoice.deleteMany({ where: { organizationId } });
    await prisma.supplier.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    aiExtractor = { extract: jest.fn() };
    service = new InvoiceDraftsService(
      prisma,
      { add: jest.fn().mockResolvedValue({ id: 'job-1' }), close: jest.fn() } as never,
      new FiscalParsingService([
        new SupplierExtractor(),
        new CustomerExtractor(),
        new InvoiceNumberExtractor(),
        new InvoiceDateExtractor(),
        new DueDateExtractor(),
        new CurrencyExtractor(),
        new TotalsExtractor(),
        new VatExtractor(),
        new TaxNumberExtractor(),
      ]),
      aiExtractor as unknown as AiInvoiceExtractor,
    );
  });

  /** Cria um `StorageObject` + `InvoiceDraft` isolados para um único teste — sempre apagados em `afterEach`. */
  async function createDraft(overrides: Partial<Prisma.InvoiceDraftUncheckedCreateInput> = {}) {
    const storageObject = await prisma.storageObject.create({
      data: {
        organizationId,
        filename: 'fatura.pdf',
        contentType: 'application/pdf',
        size: 1,
        key: `test-${randomUUID()}`,
      },
    });
    const draft = await prisma.invoiceDraft.create({
      data: {
        organizationId,
        storageObjectId: storageObject.id,
        ocrText: 'Fornecedor: Acme Lda\nNIF: 123456789\nTotal: 100,00 EUR',
        itemsReviewedByHuman: false,
        ...overrides,
      },
    });
    return draft.id;
  }

  async function deleteDraftIfExists(draftId: string) {
    const draft = await prisma.invoiceDraft.findUnique({ where: { id: draftId }, select: { storageObjectId: true } });
    if (!draft) return;
    await prisma.invoiceDraft.deleteMany({ where: { id: draftId } });
    await prisma.storageObject.deleteMany({ where: { id: draft.storageObjectId } });
  }

  /**
   * Bloqueia manualmente a linha `InvoiceDraft` (mesma query `FOR
   * UPDATE` de `lockInvoiceDraftRow()`) numa transação à parte, para
   * forçar DOIS writers reais a competirem genuinamente pelo mesmo
   * lock — nunca uma simulação de timing com `setTimeout`. Devolve uma
   * função `release()` que liberta o lock (permite ao Postgres
   * conceder a um dos dois writers bloqueados) e uma promise que só
   * resolve depois de essa transação manual fechar por completo.
   */
  async function acquireManualLock(draftId: string) {
    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const lockAcquiredPromise = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const manualTxPromise = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InvoiceDraft" WHERE id = ${draftId} FOR UPDATE`;
      lockAcquired();
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    });
    await lockAcquiredPromise;
    return {
      release: async () => {
        releaseLock();
        await manualTxPromise;
      },
    };
  }

  /** `connection_limit=1` acrescentado à `DATABASE_URL` base — nunca reescreve outros parâmetros já presentes (ex. `schema=public`). */
  function singleConnectionDatabaseUrl(): string {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('connection_limit', '1');
    return url.toString();
  }

  interface DedicatedWriter {
    /** `pg_backend_pid()` da ÚNICA ligação física deste writer — identifica-o inequivocamente em `pg_locks`. */
    pid: number;
    service: InvoiceDraftsService;
    aiExtractor: { extract: jest.Mock };
    disconnect: () => Promise<void>;
  }

  /**
   * Correção pós-revisão Codex (4ª ronda) — cria uma `InvoiceDraftsService`
   * ligada através de UMA ÚNICA ligação Postgres física, dedicada e
   * nunca partilhada com o resto da suite nem com o outro writer do
   * mesmo cenário (`datasourceUrl` com `connection_limit=1`). Captura
   * `pg_backend_pid()` logo a seguir a `$connect()` — como só existe
   * esta ligação no pool desta instância, TODAS as queries seguintes
   * deste writer (incl. a transação real do método chamado) usam
   * sempre este MESMO pid, permitindo identificá-lo com precisão em
   * `pg_locks`, nunca inferir a partir de uma contagem agregada.
   */
  async function createDedicatedWriter(): Promise<DedicatedWriter> {
    const dedicatedPrisma = new PrismaService({ datasourceUrl: singleConnectionDatabaseUrl() });
    await dedicatedPrisma.$connect();
    const [{ pid }] = await dedicatedPrisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;

    const aiExtractor = { extract: jest.fn() };
    const dedicatedService = new InvoiceDraftsService(
      dedicatedPrisma,
      { add: jest.fn().mockResolvedValue({ id: 'job-1' }), close: jest.fn() } as never,
      new FiscalParsingService([
        new SupplierExtractor(),
        new CustomerExtractor(),
        new InvoiceNumberExtractor(),
        new InvoiceDateExtractor(),
        new DueDateExtractor(),
        new CurrencyExtractor(),
        new TotalsExtractor(),
        new VatExtractor(),
        new TaxNumberExtractor(),
      ]),
      aiExtractor as unknown as AiInvoiceExtractor,
    );

    return {
      pid,
      service: dedicatedService,
      aiExtractor,
      disconnect: () => dedicatedPrisma.$disconnect(),
    };
  }

  /**
   * Quantos pedidos de lock NÃO concedidos este `pid` concreto tem
   * neste momento sobre `InvoiceDraft` — consultado diretamente em
   * `pg_locks`, a fonte de verdade do scheduler de locks do Postgres.
   *
   * **Verificado empiricamente** (`docker exec` + `pg_locks`/
   * `pg_stat_activity` reais, várias sessões concorrentes, com 1 e com
   * 2 waiters simultâneos) antes de confiar nesta query: um `SELECT
   * ... FOR UPDATE` bloqueado NUNCA aparece como `locktype = 'tuple'
   * AND NOT granted` quando é o ÚNICO à espera — o lock de `tuple` em
   * si é concedido de imediato; o bloqueio real acontece um nível
   * acima, como `locktype = 'transactionid' AND NOT granted`
   * (`XactLockTableWait()` pela conclusão da transação detentora). MAS
   * com um 2º (ou mais) waiter já em fila, esse 2º waiter aparece antes
   * com `locktype = 'tuple' AND NOT granted` (compete primeiro pelo
   * lock físico da linha, só depois pelo `transactionid`) — por isso
   * esta contagem nunca filtra por `locktype`: só por `pid` (o writer
   * concreto identificado por `createDedicatedWriter()`) e `NOT
   * granted`, o sinal fiável comum a ambos os casos.
   */
  async function countBlockedRequestsForPid(pid: number): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM pg_locks
      WHERE pid = ${pid} AND NOT granted
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Espera DETERMINISTICAMENTE até o `pid` concreto de um
   * `DedicatedWriter` estar genuinamente bloqueado no seu próprio
   * `SELECT ... FOR UPDATE` — nunca um `setTimeout` arbitrário a
   * "torcer" por tempo suficiente. O `setTimeout` usado aqui é só o
   * intervalo de poll entre consultas reais a `pg_locks`; a condição de
   * paragem é sempre o estado real do Postgres, para este pid
   * concreto, nunca um tempo fixo nem uma contagem agregada que
   * qualquer backend pudesse satisfazer.
   */
  async function waitUntilPidBlocked(pid: number, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    let last = -1;
    while (Date.now() - start < timeoutMs) {
      last = await countBlockedRequestsForPid(pid);
      if (last >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`Timeout à espera que o pid ${pid} ficasse bloqueado no lock de InvoiceDraft (última contagem: ${last}).`);
  }

  const AI_EXTRACTION = {
    schemaVersion: '1' as const,
    supplier: { name: 'Acme Lda', taxId: '123456789' },
    invoice: { number: null, issueDate: null, dueDate: null, currency: 'EUR' },
    totals: { subtotal: null, vatAmount: null, total: '100.00' },
    items: [
      {
        position: 1,
        description: 'Linha sugerida pela IA',
        quantity: '1',
        unit: null,
        unitPrice: '100.00',
        vatRate: null,
        totalPrice: '100.00',
      },
    ],
  };
  const AI_METADATA = { provider: 'test', model: 'test-model', inputTokens: 10, outputTokens: 5, durationMs: 1 };

  it('A1. IA vs revisão humana — humano ganha o lock primeiro (ordem forçada deterministicamente, writers identificados por pid): correção humana permanece, IA relê true e não escreve', async () => {
    const draftId = await createDraft();
    const human = await createDedicatedWriter();
    const ai = await createDedicatedWriter();
    try {
      const lock = await acquireManualLock(draftId);
      ai.aiExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION, metadata: AI_METADATA });

      // 1º: o writer humano (ligação dedicada, pid = human.pid) pede o
      // lock — espera-se especificamente POR ESTE pid, nunca por uma
      // contagem agregada que qualquer backend pudesse satisfazer.
      const humanPromise = human.service.replaceItems(organizationId, draftId, [
        { description: 'Linha corrigida pelo humano', quantity: 1, unitPrice: 50, totalPrice: 50 } as never,
      ]);
      await waitUntilPidBlocked(human.pid);

      // Só agora a IA (ligação dedicada, pid = ai.pid) entra na disputa
      // — o Postgres serve pedidos em conflito por ordem de chegada à
      // fila (FIFO): como o pedido do humano já lá está, o da IA fica
      // OBRIGATORIAMENTE atrás, nunca à mercê do scheduler.
      const aiPromise = ai.service.runAiExtraction(organizationId, draftId);
      await waitUntilPidBlocked(ai.pid);

      await lock.release();
      await humanPromise;
      const aiResult = await aiPromise;

      const finalDraft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
      const finalItems = await prisma.invoiceDraftItem.findMany({
        where: { invoiceDraftId: draftId },
        orderBy: { position: 'asc' },
      });

      // A IA adquiriu o lock DEPOIS do humano — relê itemsReviewedByHuman
      // já true, nunca escreve.
      expect(aiResult.itemsPersisted).toBe(false);
      expect(finalDraft.itemsReviewedByHuman).toBe(true);
      expect(finalItems).toHaveLength(1);
      expect(finalItems[0].description).toBe('Linha corrigida pelo humano');
    } finally {
      await deleteDraftIfExists(draftId);
      await human.disconnect();
      await ai.disconnect();
    }
  });

  it('A2. IA vs revisão humana — IA ganha o lock primeiro (ordem forçada deterministicamente, writers identificados por pid): estado final contém exclusivamente as linhas humanas', async () => {
    const draftId = await createDraft();
    const human = await createDedicatedWriter();
    const ai = await createDedicatedWriter();
    try {
      const lock = await acquireManualLock(draftId);
      ai.aiExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION, metadata: AI_METADATA });

      // 1º: a IA (pid = ai.pid) pede o lock (o provider já respondeu —
      // `extract()` resolve de imediato — a chamada real que fica
      // bloqueada é o `SELECT ... FOR UPDATE` dentro da transação).
      const aiPromise = ai.service.runAiExtraction(organizationId, draftId);
      await waitUntilPidBlocked(ai.pid);

      // Só agora o humano (pid = human.pid) entra na disputa — o seu
      // pedido fica OBRIGATORIAMENTE atrás do da IA na fila FIFO do
      // Postgres.
      const humanPromise = human.service.replaceItems(organizationId, draftId, [
        { description: 'Linha corrigida pelo humano', quantity: 1, unitPrice: 50, totalPrice: 50 } as never,
      ]);
      await waitUntilPidBlocked(human.pid);

      await lock.release();
      const aiResult = await aiPromise;
      await humanPromise;

      const finalDraft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
      const finalItems = await prisma.invoiceDraftItem.findMany({
        where: { invoiceDraftId: draftId },
        orderBy: { position: 'asc' },
      });

      // A IA adquiriu o lock PRIMEIRO — itemsReviewedByHuman ainda era
      // false, por isso chegou a gravar o staging da IA...
      expect(aiResult.itemsPersisted).toBe(true);
      // ...mas replaceItems() corre a seguir e substitui-o
      // incondicionalmente (é a decisão explícita do utilizador) — o
      // estado final nunca contém a sugestão da IA.
      expect(finalDraft.itemsReviewedByHuman).toBe(true);
      expect(finalItems).toHaveLength(1);
      expect(finalItems[0].description).toBe('Linha corrigida pelo humano');
    } finally {
      await deleteDraftIfExists(draftId);
      await human.disconnect();
      await ai.disconnect();
    }
  });

  function draftReadyToPromote(overrides: Partial<Prisma.InvoiceDraftUncheckedCreateInput> = {}) {
    return { supplierId, issueDate: new Date('2026-07-01'), totalAmount: 100, ...overrides };
  }

  it('B1. replaceItems vs promote — replaceItems ganha o lock primeiro (ordem forçada deterministicamente, writers identificados por pid): a Invoice promovida reflete SEMPRE a linha atualizada', async () => {
    const draftId = await createDraft(draftReadyToPromote());
    await prisma.invoiceDraftItem.create({
      data: {
        organizationId,
        invoiceDraftId: draftId,
        position: 1,
        description: 'Linha original',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    });
    const replacer = await createDedicatedWriter();
    const promoter = await createDedicatedWriter();

    try {
      const lock = await acquireManualLock(draftId);

      // 1º: replaceItems() (pid = replacer.pid) pede o lock.
      const replacePromise = replacer.service.replaceItems(organizationId, draftId, [
        { description: 'Linha atualizada', quantity: 1, unitPrice: 75, totalPrice: 75 } as never,
      ]);
      await waitUntilPidBlocked(replacer.pid);

      // Só agora promote() (pid = promoter.pid) entra na disputa — fica
      // OBRIGATORIAMENTE atrás na fila FIFO.
      const promotePromise = promoter.service.promote(organizationId, draftId);
      await waitUntilPidBlocked(promoter.pid);

      await lock.release();
      // replaceItems() ganhou o lock primeiro — comita a linha nova
      // antes de promote() sequer começar a ler.
      await replacePromise;
      // promote() só lê DEPOIS de replaceItems() ter comitado — dentro
      // da sua própria transação, sempre o estado mais recente, nunca
      // um snapshot anterior ao lock.
      const invoice = await promotePromise;

      expect(invoice.items.map((item) => item.description)).toEqual(['Linha atualizada']);
      const draftStillExists = await prisma.invoiceDraft.findUnique({ where: { id: draftId } });
      expect(draftStillExists).toBeNull();
    } finally {
      // `promote()` já apagou o InvoiceDraft — idempotente.
      await deleteDraftIfExists(draftId);
      await replacer.disconnect();
      await promoter.disconnect();
    }
  });

  it('B2. replaceItems vs promote — promote ganha o lock primeiro (ordem forçada deterministicamente, writers identificados por pid): Invoice reflete a linha original, replaceItems falha 404, nenhuma linha órfã', async () => {
    const draftId = await createDraft(draftReadyToPromote());
    await prisma.invoiceDraftItem.create({
      data: {
        organizationId,
        invoiceDraftId: draftId,
        position: 1,
        description: 'Linha original',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    });
    const promoter = await createDedicatedWriter();
    const replacer = await createDedicatedWriter();

    try {
      const lock = await acquireManualLock(draftId);

      // 1º: promote() (pid = promoter.pid) pede o lock.
      const promotePromise = promoter.service.promote(organizationId, draftId);
      await waitUntilPidBlocked(promoter.pid);

      // Só agora replaceItems() (pid = replacer.pid) entra na disputa —
      // fica OBRIGATORIAMENTE atrás na fila FIFO.
      const replacePromise = replacer.service.replaceItems(organizationId, draftId, [
        { description: 'Linha atualizada', quantity: 1, unitPrice: 75, totalPrice: 75 } as never,
      ]);
      await waitUntilPidBlocked(replacer.pid);

      await lock.release();
      // promote() ganhou o lock primeiro — lê a linha original, cria a
      // Invoice e apaga o InvoiceDraft (cascade remove InvoiceDraftItem).
      const invoice = await promotePromise;
      // replaceItems() só chega ao seu SELECT ... FOR UPDATE depois de
      // promote() comitar — a linha já não existe, falha 404, nunca
      // escreve linhas órfãs.
      await expect(replacePromise).rejects.toThrow(NotFoundException);

      expect(invoice.items.map((item) => item.description)).toEqual(['Linha original']);
      const orphanItems = await prisma.invoiceDraftItem.findMany({ where: { invoiceDraftId: draftId } });
      expect(orphanItems).toHaveLength(0);
    } finally {
      // `promote()` já apagou o InvoiceDraft — idempotente.
      await deleteDraftIfExists(draftId);
      await promoter.disconnect();
      await replacer.disconnect();
    }
  });

  it('C. rollback real: falha a meio da escrita das linhas desfaz também o cabeçalho já escrito na mesma transação — nunca um estado parcial', async () => {
    const draftId = await createDraft({ number: 'ORIGINAL-123' });

    try {
      // `position` duplicada entre as duas linhas viola
      // `@@unique([invoiceDraftId, position])` — falha real do
      // Postgres a meio da transação, depois do `UPDATE` do cabeçalho
      // já ter corrido dentro da MESMA transação.
      await expect(
        service.saveReview(organizationId, draftId, {
          patch: { number: 'NUNCA-DEVIA-PERSISTIR' },
          items: [
            { description: 'Linha 1', unitPrice: 1, quantity: 1, totalPrice: 1, position: 1 } as never,
            { description: 'Linha 2', unitPrice: 1, quantity: 1, totalPrice: 1, position: 1 } as never,
          ],
        }),
      ).rejects.toThrow();

      const finalDraft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
      const finalItems = await prisma.invoiceDraftItem.findMany({ where: { invoiceDraftId: draftId } });

      // Nem o cabeçalho nem as linhas foram alterados — rollback completo.
      expect(finalDraft.number).toBe('ORIGINAL-123');
      expect(finalItems).toHaveLength(0);
    } finally {
      await deleteDraftIfExists(draftId);
    }
  });
});
