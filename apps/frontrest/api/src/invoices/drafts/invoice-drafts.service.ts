import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import { PrismaService } from '@frontcore/database';
import type { Prisma } from '@frontcore/database';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import type { BackoffOptions, OcrProcessingJob, QueueProducer } from '@frontcore/queue';
import { QUEUE_PRODUCER } from '../../queue/queue-producer.token';
import { FiscalParsingService } from '../../fiscal-parsing/fiscal-parsing.service';
import type { FiscalExtractionResult } from '../../fiscal-parsing/types';
import { isFutureDate, isPlausibleYear } from '../../fiscal-parsing/utils';
import { AiInvoiceExtractor } from '../../ai-invoice-extraction/ai-invoice-extractor.service';
import { reconcileInvoiceExtraction } from '../../ai-invoice-extraction/invoice-extraction-merger';
import type { InvoiceExtractionReconciliation } from '../../ai-invoice-extraction/invoice-extraction-merger';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { ListInvoiceDraftsDto } from './dto/list-invoice-drafts.dto';
import type { InvoiceDraftItemDto } from './dto/invoice-draft-item.dto';
import type { SaveInvoiceDraftReviewDto } from './dto/save-invoice-draft-review.dto';

/** Tentativas do job OCR — mesma ordem de grandeza já usada noutras filas do FrontCore. */
const OCR_JOB_ATTEMPTS = 3;

/**
 * Backoff exponencial nativo do BullMQ (Fase 6.5): com attempts: 3 só há
 * 2 atrasos possíveis — 5s antes da tentativa 2, 10s antes da tentativa
 * 3 (delayMs × 2^(tentativa−2); não existe tentativa 4, logo nunca há um
 * 3º atraso) — suficiente para uma falha transitória de Redis/Storage/
 * provider OCR se resolver sozinha, sem martelar o broker em loop
 * imediato. Nenhuma lógica de retry/atraso é reimplementada aqui — só a
 * política é configurada, o BullMQ é quem agenda e conta as tentativas.
 * Confirmado experimentalmente (validação Docker, Fase 6.5): tentativa 2
 * a +5s, tentativa 3 a +~10-11s.
 */
const OCR_JOB_BACKOFF: BackoffOptions = { type: 'exponential', delayMs: 5000 };

/**
 * `jobId` determinístico — dois `add()` para o mesmo draft nunca duplicam
 * o job. Separador `-`, nunca `:` — o BullMQ rejeita `:` num custom id
 * (`Error: Custom Id cannot contain :`, usa `:` como separador interno de
 * namespace nas chaves Redis); descoberto na validação real desta fase.
 */
function ocrJobId(invoiceDraftId: string): string {
  return `invoice-draft-ocr-${invoiceDraftId}`;
}

const INVOICE_DRAFT_INCLUDE = {
  supplier: true,
  category: true,
  storageObject: {
    select: {
      id: true,
      filename: true,
      contentType: true,
      size: true,
      createdAt: true,
    },
  },
  // Fase 6.14 — linhas de staging, sempre pela ordem do documento
  // original (`position`, nunca a ordem de inserção na base de dados).
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.InvoiceDraftInclude;

type InvoiceDraftWithRelations = Prisma.InvoiceDraftGetPayload<{
  include: typeof INVOICE_DRAFT_INCLUDE;
}>;

type InvoiceDraftItemRecord = InvoiceDraftWithRelations['items'][number];

const PROMOTED_INVOICE_INCLUDE = {
  supplier: true,
  category: true,
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.InvoiceInclude;

type PromotedInvoice = Prisma.InvoiceGetPayload<{
  include: typeof PROMOTED_INVOICE_INCLUDE;
}>;

export interface RunAiExtractionResult {
  reconciliation: InvoiceExtractionReconciliation;
  /** `true` quando as linhas sugeridas pela IA foram efetivamente escritas em `InvoiceDraftItem` — só acontece quando `itemsReviewedByHuman` ainda é `false` (Secção "Não sobrescrever correções humanas"). */
  itemsPersisted: boolean;
  items: InvoiceDraftItemRecord[];
}

/**
 * CRUD de rascunhos de fatura (Fase 6.3) + promoção explícita a Invoice +
 * publicação do job OCR após a criação (Fase 6.4). `InvoiceDraft` é uma
 * entidade separada de `Invoice` — ver
 * `docs/phases/phase-6.3-invoice-draft-foundation.md` para a justificação
 * completa. Validação de posse do `StorageObject` é feita diretamente via
 * Prisma (não via `UploadsService.findOne()`), mesmo padrão já usado por
 * `InvoicesService` para validar `Supplier`/`ExpenseCategory` — evita o
 * efeito colateral de gerar um URL assinado só para confirmar existência.
 */
@Injectable()
export class InvoiceDraftsService {
  private readonly logger = new Logger(InvoiceDraftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_PRODUCER) private readonly queueProducer: QueueProducer,
    private readonly fiscalParsingService: FiscalParsingService,
    private readonly aiInvoiceExtractor: AiInvoiceExtractor,
  ) {}

  /**
   * Cria o `InvoiceDraft` e, só depois de persistido com sucesso, publica
   * o job OCR correspondente. Não existe transação distribuída entre
   * PostgreSQL e Redis (fora do âmbito — sem transactional outbox nesta
   * fase): se a publicação falhar, o draft criado **não é apagado**
   * automaticamente (uma compensação nesse ponto seria enganadora — o
   * draft em si é válido, só falta o job) e a exceção propagada ao
   * cliente não expõe detalhes internos do Redis/BullMQ. Ver "Consistência
   * PostgreSQL/Redis" em
   * `docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.
   */
  async create(
    organizationId: string,
    dto: CreateInvoiceDraftDto,
  ): Promise<InvoiceDraftWithRelations> {
    await this.assertStorageObjectAvailable(organizationId, dto.storageObjectId);
    if (dto.supplierId) {
      await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    }
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }
    if (dto.issueDate) {
      this.assertPlausibleDate('Data de emissão', dto.issueDate, true);
    }
    if (dto.dueDate) {
      this.assertPlausibleDate('Data de vencimento', dto.dueDate, false);
    }

    const draft = await this.prisma.invoiceDraft.create({
      data: {
        organizationId,
        storageObjectId: dto.storageObjectId,
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        totalAmount: dto.totalAmount,
        notes: dto.notes,
      },
      include: INVOICE_DRAFT_INCLUDE,
    });

    try {
      await this.queueProducer.add<OcrProcessingJob>(
        OCR_PROCESSING_QUEUE,
        {
          invoiceDraftId: draft.id,
          storageObjectId: draft.storageObjectId,
          organizationId,
        },
        {
          jobId: ocrJobId(draft.id),
          attempts: OCR_JOB_ATTEMPTS,
          backoff: OCR_JOB_BACKOFF,
        },
      );
    } catch (error) {
      this.logger.error(
        `Falha ao publicar o job OCR para o InvoiceDraft ${draft.id} — o rascunho ` +
          `foi criado, mas fica sem processamento OCR agendado.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'O rascunho foi criado, mas não foi possível agendar o processamento OCR. Tente novamente mais tarde.',
      );
    }

    return draft;
  }

  async findAll(
    organizationId: string,
    query: ListInvoiceDraftsDto,
  ): Promise<Paginated<InvoiceDraftWithRelations>> {
    const { page, pageSize } = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const where: Prisma.InvoiceDraftWhereInput = {
      organizationId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.invoiceDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INVOICE_DRAFT_INCLUDE,
      }),
      this.prisma.invoiceDraft.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<InvoiceDraftWithRelations> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: { id, organizationId },
      include: INVOICE_DRAFT_INCLUDE,
    });
    if (!draft) {
      throw new NotFoundException('Rascunho de fatura não encontrado.');
    }
    return draft;
  }

  /**
   * Primeiro consumidor real de `FiscalParsingService` (Fase 6.7):
   * executa o pipeline de parsing fiscal sobre o `ocrText` já persistido
   * no draft e devolve o resultado — sem o persistir. `parse()` é puro e
   * síncrono, por isso repetir a chamada com o mesmo `ocrText` devolve
   * sempre o mesmo resultado (idempotente por construção, sem estado
   * criado ou alterado).
   */
  async parseFiscalData(
    organizationId: string,
    id: string,
  ): Promise<FiscalExtractionResult> {
    const draft = await this.findOne(organizationId, id);
    if (!draft.ocrText || draft.ocrText.trim().length === 0) {
      throw new BadRequestException(
        'Este rascunho ainda não tem texto OCR disponível para processamento fiscal.',
      );
    }
    return this.fiscalParsingService.parse(draft.ocrText);
  }

  /**
   * Extração estruturada de fatura (Fase 6.14) — corre o parsing fiscal
   * determinístico (`FiscalParsingService.parse()`, inalterado) e a
   * extração por IA (`AiInvoiceExtractor.extract()`, nunca lança —
   * indisponibilidade do provider degrada para "sem sugestão de IA",
   * nunca falha o pedido inteiro) em paralelo, reconcilia os dois
   * (`reconcileInvoiceExtraction()`) e devolve sempre a reconciliação —
   * os campos de cabeçalho (fornecedor/NIF/número/datas/moeda/totais)
   * nunca são persistidos automaticamente (mesma disciplina desde a
   * Fase 6.7/6.8: sugestões, nunca aplicadas sem ação explícita do
   * utilizador). As LINHAS são diferentes: só a IA as produz, por isso
   * só elas são persistidas aqui.
   *
   * **Correção pós-revisão Codex (achado 1 — race condition crítica,
   * 2ª ronda).** A 1ª correção só relia `itemsReviewedByHuman` dentro
   * da transação, sem qualquer lock — isso reduzia a janela da corrida
   * mas não a eliminava: duas transações concorrentes (esta e
   * `replaceItems()`/`saveReview()`) podiam ambas ler `false` em
   * `READ COMMITTED` antes de qualquer uma escrever, e a IA acabava por
   * apagar a correção humana na mesma. Agora TODOS os writers que tocam
   * `InvoiceDraft`/`InvoiceDraftItem` da mesma linha —
   * `runAiExtraction()`, `replaceItems()`, `saveReview()`, `promote()`
   * — adquirem primeiro `SELECT ... FOR UPDATE` sobre a MESMA linha
   * `InvoiceDraft` (`lockInvoiceDraftRow()`), antes de ler/escrever
   * qualquer estado relacionado com as linhas. Isto serializa
   * verdadeiramente os writers concorrentes: a leitura de
   * `itemsReviewedByHuman` feita a seguir ao lock vê sempre o último
   * valor committed, nunca um valor obsoleto lido em paralelo por outra
   * transação. A chamada ao provider (`this.aiInvoiceExtractor.extract()`)
   * continua SEMPRE fora de qualquer transação — nunca manter uma
   * transação Postgres aberta à espera de uma chamada de rede externa,
   * que pode demorar segundos; o lock só é adquirido depois de o
   * provider já ter respondido.
   *
   * **Achado 7 — semântica de `items: []`.** Uma extração IA VÁLIDA
   * (`aiOutcome.extraction !== null`, mesmo que `reconciliation.items`
   * seja `[]`) substitui sempre o staging automático anterior enquanto
   * `itemsReviewedByHuman` continuar `false` — incluindo ficar vazio,
   * se for esse o resultado real. Uma extração que FALHOU
   * (`aiOutcome.extraction === null` — provider indisponível, resposta
   * mal formada, etc.) nunca toca nas linhas existentes: não há
   * resultado válido para aplicar.
   *
   * **Achado 8 — atomicidade items/metadata.** A escrita de
   * `InvoiceDraftItem` e o upsert de `InvoiceDraftAiExtraction`
   * pertencem à MESMA transação — se um falhar, nenhum dos dois altera
   * nada (rollback conjunto), nunca uma persistência parcial da mesma
   * extração.
   */
  async runAiExtraction(organizationId: string, id: string): Promise<RunAiExtractionResult> {
    const draft = await this.findOne(organizationId, id);
    if (!draft.ocrText || draft.ocrText.trim().length === 0) {
      throw new BadRequestException(
        'Este rascunho ainda não tem texto OCR disponível para processamento fiscal.',
      );
    }

    const [deterministic, aiOutcome] = await Promise.all([
      this.fiscalParsingService.parse(draft.ocrText),
      this.aiInvoiceExtractor.extract(draft.ocrText),
    ]);
    const reconciliation = reconcileInvoiceExtraction(deterministic, aiOutcome.extraction);

    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoiceDraftRow(tx, id, organizationId);

      const currentDraft = await tx.invoiceDraft.findFirst({
        where: { id, organizationId },
        select: { itemsReviewedByHuman: true },
      });
      if (!currentDraft) {
        throw new NotFoundException('Rascunho de fatura não encontrado.');
      }

      let itemsPersisted = false;
      if (!currentDraft.itemsReviewedByHuman && aiOutcome.extraction !== null) {
        await tx.invoiceDraftItem.deleteMany({ where: { invoiceDraftId: id, organizationId } });
        if (reconciliation.items.length > 0) {
          await tx.invoiceDraftItem.createMany({
            data: reconciliation.items.map((item) => ({
              organizationId,
              invoiceDraftId: id,
              position: item.position,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              vatRate: item.vatRate,
              totalPrice: item.totalPrice,
            })),
          });
        }
        itemsPersisted = true;
      }

      if (aiOutcome.metadata) {
        await tx.invoiceDraftAiExtraction.upsert({
          where: { invoiceDraftId: id },
          create: {
            organizationId,
            invoiceDraftId: id,
            schemaVersion: '1',
            provider: aiOutcome.metadata.provider,
            model: aiOutcome.metadata.model,
            inputTokens: aiOutcome.metadata.inputTokens,
            outputTokens: aiOutcome.metadata.outputTokens,
            durationMs: aiOutcome.metadata.durationMs,
          },
          update: {
            schemaVersion: '1',
            provider: aiOutcome.metadata.provider,
            model: aiOutcome.metadata.model,
            inputTokens: aiOutcome.metadata.inputTokens,
            outputTokens: aiOutcome.metadata.outputTokens,
            durationMs: aiOutcome.metadata.durationMs,
            processedAt: new Date(),
          },
        });
      }

      const items = await tx.invoiceDraftItem.findMany({
        where: { invoiceDraftId: id, organizationId },
        orderBy: { position: 'asc' },
      });

      return { reconciliation, itemsPersisted, items };
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateInvoiceDraftDto,
  ): Promise<InvoiceDraftWithRelations> {
    await this.findOne(organizationId, id);

    if (dto.supplierId) {
      await this.assertSupplierBelongsToOrg(organizationId, dto.supplierId);
    }
    if (dto.categoryId) {
      await this.assertCategoryBelongsToOrg(organizationId, dto.categoryId);
    }
    // `typeof === 'string'` — nunca truthiness: `dto.issueDate` pode ser
    // `null` (limpar, nada a validar) ou `undefined` (não enviado); só
    // uma string precisa de passar pela validação de plausibilidade.
    if (typeof dto.issueDate === 'string') {
      this.assertPlausibleDate('Data de emissão', dto.issueDate, true);
    }
    if (typeof dto.dueDate === 'string') {
      this.assertPlausibleDate('Data de vencimento', dto.dueDate, false);
    }

    return this.prisma.invoiceDraft.update({
      where: { id },
      data: this.buildHeaderUpdateData(dto),
      include: INVOICE_DRAFT_INCLUDE,
    });
  }

  /**
   * Constrói o objeto `data` do `update()` de cabeçalho — extraído para
   * ser partilhado por `update()` e `saveReview()` (achado 9), nunca
   * duplicado entre os dois. Mesma distinção ausente/`null`/valor de
   * sempre (Fase 6.8): `undefined` não altera, `null` limpa, string
   * converte para `Date`.
   */
  private buildHeaderUpdateData(dto: UpdateInvoiceDraftDto): Prisma.InvoiceDraftUncheckedUpdateInput {
    return {
      supplierId: dto.supplierId,
      categoryId: dto.categoryId,
      number: dto.number,
      issueDate:
        dto.issueDate === undefined ? undefined : dto.issueDate === null ? null : new Date(dto.issueDate),
      dueDate: dto.dueDate === undefined ? undefined : dto.dueDate === null ? null : new Date(dto.dueDate),
      totalAmount: dto.totalAmount,
      notes: dto.notes,
    };
  }

  /**
   * Substitui integralmente as linhas do rascunho — mesma disciplina
   * "replace-all" de `InvoicesService.update()` (Secção "UI de
   * revisão": editar/adicionar/eliminar/reordenar cobertos por uma
   * única operação sobre o array completo, nunca um PATCH incremental
   * por linha). Marca sempre `itemsReviewedByHuman = true` — esta
   * chamada É a decisão explícita do utilizador sobre as linhas finais;
   * uma extração de IA seguinte (`runAiExtraction()`) nunca as volta a
   * substituir automaticamente a partir daqui (Secção "Não sobrescrever
   * correções humanas").
   *
   * **Correção pós-revisão Codex (achado 1, 2ª ronda).** Adquire
   * `SELECT ... FOR UPDATE` sobre a linha `InvoiceDraft`
   * (`lockInvoiceDraftRow()`) logo ao abrir a transação, ANTES de tocar
   * em `InvoiceDraftItem` — mesma convenção de `runAiExtraction()`/
   * `saveReview()`/`promote()`, para os quatro writers serializarem
   * sempre pela mesma linha, nunca por locks diferentes.
   */
  async replaceItems(
    organizationId: string,
    id: string,
    items: InvoiceDraftItemDto[],
  ): Promise<InvoiceDraftItemRecord[]> {
    await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoiceDraftRow(tx, id, organizationId);

      // Achado 11 (multi-tenant) — `organizationId` explícito também
      // aqui, nunca confiar só em `invoiceDraftId` para filtrar
      // `InvoiceDraftItem`, mesmo que `findOne()` já tenha confirmado a
      // posse do draft momentos antes.
      await tx.invoiceDraftItem.deleteMany({ where: { invoiceDraftId: id, organizationId } });
      if (items.length > 0) {
        await tx.invoiceDraftItem.createMany({
          data: items.map((item, index) => ({
            organizationId,
            invoiceDraftId: id,
            position: item.position ?? index + 1,
            description: item.description,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            unitPrice: item.unitPrice ?? null,
            vatRate: item.vatRate ?? null,
            totalPrice: item.totalPrice ?? null,
          })),
        });
      }
      await tx.invoiceDraft.update({ where: { id }, data: { itemsReviewedByHuman: true } });
      return tx.invoiceDraftItem.findMany({
        where: { invoiceDraftId: id, organizationId },
        orderBy: { position: 'asc' },
      });
    });
  }

  /**
   * Correção pós-revisão Codex (achado 9, MÉDIO). A UI de revisão
   * guardava cabeçalho (`update()`) e linhas (`replaceItems()`) como
   * dois pedidos HTTP independentes — se o primeiro tivesse sucesso e o
   * segundo falhasse, ficava um sucesso parcial nunca honestamente
   * refletido (o cabeçalho persistia no servidor, mas a UI nunca
   * aplicava esse resultado localmente). `saveReview()` grava ambos
   * dentro da MESMA transação Prisma — se qualquer parte falhar, nada
   * fica persistido desta chamada. Os dois endpoints antigos (`PATCH
   * :id`, `PUT :id/items`) continuam disponíveis sem alterações (nenhum
   * consumidor existente parte); esta é só a operação atómica preferida
   * para a UI de revisão a partir de agora. Mesma validação de
   * supplier/categoria/plausibilidade de datas de `update()` — corre
   * ANTES de abrir a transação (falha rápida, sem transação
   * desnecessária), a própria escrita corre sempre dentro dela.
   *
   * **Correção pós-revisão Codex (achado 1, 2ª ronda).** Adquire
   * `SELECT ... FOR UPDATE` sobre a linha `InvoiceDraft`
   * (`lockInvoiceDraftRow()`) logo ao abrir a transação, ANTES de
   * atualizar `patch`/`items` — mesma convenção de `runAiExtraction()`/
   * `replaceItems()`/`promote()`.
   */
  async saveReview(
    organizationId: string,
    id: string,
    input: SaveInvoiceDraftReviewDto,
  ): Promise<InvoiceDraftWithRelations> {
    await this.findOne(organizationId, id);

    if (input.patch) {
      if (input.patch.supplierId) {
        await this.assertSupplierBelongsToOrg(organizationId, input.patch.supplierId);
      }
      if (input.patch.categoryId) {
        await this.assertCategoryBelongsToOrg(organizationId, input.patch.categoryId);
      }
      if (typeof input.patch.issueDate === 'string') {
        this.assertPlausibleDate('Data de emissão', input.patch.issueDate, true);
      }
      if (typeof input.patch.dueDate === 'string') {
        this.assertPlausibleDate('Data de vencimento', input.patch.dueDate, false);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoiceDraftRow(tx, id, organizationId);

      if (input.patch) {
        await tx.invoiceDraft.update({ where: { id }, data: this.buildHeaderUpdateData(input.patch) });
      }
      if (input.items) {
        await tx.invoiceDraftItem.deleteMany({ where: { invoiceDraftId: id, organizationId } });
        if (input.items.length > 0) {
          await tx.invoiceDraftItem.createMany({
            data: input.items.map((item, index) => ({
              organizationId,
              invoiceDraftId: id,
              position: item.position ?? index + 1,
              description: item.description,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
              unitPrice: item.unitPrice ?? null,
              vatRate: item.vatRate ?? null,
              totalPrice: item.totalPrice ?? null,
            })),
          });
        }
        await tx.invoiceDraft.update({ where: { id }, data: { itemsReviewedByHuman: true } });
      }
    });

    return this.findOne(organizationId, id);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.invoiceDraft.delete({ where: { id } });
  }

  /**
   * Promove um rascunho a `Invoice` real: valida campos obrigatórios,
   * cria `Invoice` + `InvoiceItem[]` (a partir de `InvoiceDraftItem`,
   * Fase 6.14) + `InvoiceAttachment` (mesmo `storageObjectId`) e só
   * depois apaga o `InvoiceDraft` (cuja cascade também remove
   * `InvoiceDraftItem`/`InvoiceDraftAiExtraction`) — tudo numa única
   * transação Prisma: se qualquer passo falhar (incl. a criação de um
   * `InvoiceItem`), nada é escrito — `Invoice`/`InvoiceAttachment` nunca
   * persistem parcialmente, e `InvoiceDraft`/`InvoiceDraftItem`
   * permanecem exatamente como estavam (rollback completo, staging
   * intacto). Items carregados sempre com `invoiceDraftId` **e**
   * `organizationId` em simultâneo — nunca confiar só no primeiro.
   *
   * **Correção pós-revisão Codex (achado 6 — lost update; achado 1,
   * 2ª ronda — convenção única de locking).** A versão anterior lia
   * `draft`/`draftItems` ANTES de abrir a transação e usava esses
   * valores para construir a `Invoice` — uma alteração concorrente (ex.
   * `replaceItems()`, ou um `PATCH` ao cabeçalho) entre essa leitura e o
   * `DELETE` final do draft ficava perdida silenciosamente, promovendo
   * valores desatualizados. Agora: `SELECT ... FOR UPDATE`
   * (`lockInvoiceDraftRow()`, PARTILHADO com `runAiExtraction()`/
   * `replaceItems()`/`saveReview()` — nunca um lock diferente por
   * operação) bloqueia a linha do `InvoiceDraft` logo no início da
   * transação — qualquer escrita concorrente à mesma linha espera até
   * este COMMIT/ROLLBACK, nunca perdida; TODAS as leituras que
   * determinam os valores promovidos (`draft`, `draftItems`) e TODAS as
   * validações (campos obrigatórios, supplier/categoria, linhas
   * incompletas) passam a viver DENTRO da mesma transação, usando
   * sempre `tx`, nunca `this.prisma` solto. Forma mínima de controlo de
   * concorrência do Postgres para isto — sem coluna de versão nova, sem
   * lógica de retry otimista.
   *
   * `InvoiceItem.quantity`/`unitPrice`/`totalPrice` são obrigatórios ao
   * nível do schema (ao contrário de `InvoiceDraftItem`, onde são
   * sempre opcionais) — uma linha de staging incompleta bloqueia a
   * promoção (nunca inventa um valor em falta para "fazer passar",
   * mesma disciplina de "não inventar valores" do resto da fase).
   * Promoção sem nenhuma linha continua permitida, sem alteração —
   * `Invoice` sem `InvoiceItem` é válido ao nível do schema.
   */
  async promote(organizationId: string, id: string): Promise<PromotedInvoice> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoiceDraftRow(tx, id, organizationId);

      const draft = await tx.invoiceDraft.findFirst({ where: { id, organizationId } });
      if (!draft) {
        throw new NotFoundException('Rascunho de fatura não encontrado.');
      }

      const missingFields: string[] = [];
      if (!draft.supplierId) missingFields.push('supplierId');
      if (!draft.issueDate) missingFields.push('issueDate');
      if (draft.totalAmount === null) missingFields.push('totalAmount');
      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Não é possível promover o rascunho: campos obrigatórios em falta (${missingFields.join(', ')}).`,
        );
      }

      // Revalida — o supplier/categoria podem ter deixado de pertencer
      // à organização entre a criação do draft e a promoção. Usa `tx`
      // — nunca `this.prisma` — para ver sempre o mesmo snapshot
      // consistente desta transação.
      await this.assertSupplierBelongsToOrg(organizationId, draft.supplierId!, tx);
      if (draft.categoryId) {
        await this.assertCategoryBelongsToOrg(organizationId, draft.categoryId, tx);
      }

      const draftItems = await tx.invoiceDraftItem.findMany({
        where: { invoiceDraftId: id, organizationId },
        orderBy: { position: 'asc' },
      });
      const incompleteItems = draftItems.filter(
        (item) => item.quantity === null || item.unitPrice === null || item.totalPrice === null,
      );
      if (incompleteItems.length > 0) {
        throw new BadRequestException(
          `Não é possível promover o rascunho: ${incompleteItems.length} linha(s) sem quantidade/preço unitário/total preenchidos.`,
        );
      }

      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          supplierId: draft.supplierId!,
          categoryId: draft.categoryId,
          number: draft.number,
          issueDate: draft.issueDate!,
          dueDate: draft.dueDate,
          totalAmount: draft.totalAmount!,
          status: 'PENDING',
          notes: draft.notes,
          ...(draftItems.length > 0
            ? {
                items: {
                  create: draftItems.map((item) => ({
                    position: item.position,
                    description: item.description,
                    quantity: item.quantity!,
                    unit: item.unit,
                    unitPrice: item.unitPrice!,
                    vatRate: item.vatRate,
                    totalPrice: item.totalPrice!,
                  })),
                },
              }
            : {}),
        },
        include: PROMOTED_INVOICE_INCLUDE,
      });

      await tx.invoiceAttachment.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          storageObjectId: draft.storageObjectId,
        },
      });

      await tx.invoiceDraft.delete({ where: { id: draft.id } });

      return invoice;
    });
  }

  /**
   * Correção pós-revisão Codex (achado 1, 2ª ronda — CRÍTICO). Política
   * ÚNICA de locking, partilhada por TODOS os writers que podem competir
   * entre si sobre o mesmo `InvoiceDraft`/`InvoiceDraftItem`
   * (`runAiExtraction()`, `replaceItems()`, `saveReview()`,
   * `promote()`) — nunca um lock diferente por operação, que só
   * deslocaria a janela da corrida em vez de a eliminar. `SELECT ...
   * FOR UPDATE` bloqueia a linha `InvoiceDraft` (id + organizationId
   * SEMPRE em simultâneo — achado 11, nunca um lock sem tenant) até ao
   * fim da transação chamadora: uma segunda transação que tente
   * bloquear a MESMA linha espera pelo COMMIT/ROLLBACK da primeira, e só
   * depois lê o estado já atualizado — nunca um valor obsoleto lido em
   * paralelo. Tem de ser SEMPRE a primeira operação dentro da
   * transação, antes de qualquer leitura/escrita de `InvoiceDraftItem`
   * (nunca adquirir um lock sobre a linha filha antes da linha pai —
   * evita ciclos de deadlock entre estes quatro writers, que nunca
   * bloqueiam mais do que uma única linha `InvoiceDraft` de cada vez).
   */
  private async lockInvoiceDraftRow(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "InvoiceDraft" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException('Rascunho de fatura não encontrado.');
    }
  }

  private async assertStorageObjectAvailable(
    organizationId: string,
    storageObjectId: string,
  ): Promise<void> {
    const storageObject = await this.prisma.storageObject.findFirst({
      where: { id: storageObjectId, organizationId, key: { not: null } },
      select: { id: true },
    });
    if (!storageObject) {
      throw new NotFoundException('Objeto de storage não encontrado.');
    }

    const existingDraft = await this.prisma.invoiceDraft.findFirst({
      where: { storageObjectId },
      select: { id: true },
    });
    if (existingDraft) {
      throw new ConflictException(
        'Este objeto já está associado a um rascunho de fatura.',
      );
    }

    const existingAttachment = await this.prisma.invoiceAttachment.findFirst({
      where: { storageObjectId },
      select: { id: true },
    });
    if (existingAttachment) {
      throw new ConflictException(
        'Este objeto já está associado a uma fatura.',
      );
    }
  }

  /**
   * `client` opcional (correção pós-revisão Codex, achado 6) — omitido,
   * usa `this.prisma` (comportamento inalterado para `create()`); passado
   * explicitamente como `tx` por `promote()`, para a validação ver
   * sempre o mesmo snapshot consistente da transação que já bloqueou a
   * linha do `InvoiceDraft`, nunca uma leitura solta fora dela.
   */
  private async assertSupplierBelongsToOrg(
    organizationId: string,
    supplierId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const supplier = await client.supplier.findFirst({
      where: { id: supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
  }

  /**
   * Fecha uma lacuna estrutural real (validação manual, Fase 6.8+):
   * `@IsDateString()` só valida o formato ISO-8601, nunca a
   * plausibilidade — um `PATCH`/`POST` direto podia gravar `issueDate:
   * "2096-07-13"` sem qualquer erro, mesmo depois de
   * `InvoiceDateExtractor` já rejeitar esse mesmo valor no caminho de
   * extração. As duas camadas são independentes (extração nunca
   * persiste sozinha; persistência não passa pelos extractors) — sem
   * esta validação aqui, a persistência ficava sem nenhuma das duas
   * regras. Reutiliza `isPlausibleYear`/`isFutureDate` de
   * `fiscal-parsing/utils` — nunca duplica os limiares.
   */
  private assertPlausibleDate(label: string, isoDate: string, rejectFuture: boolean): void {
    const date = new Date(isoDate);
    if (!isPlausibleYear(date)) {
      throw new BadRequestException(`${label} tem um ano implausível.`);
    }
    if (rejectFuture && isFutureDate(date)) {
      throw new BadRequestException(`${label} não pode ser uma data futura.`);
    }
  }

  private async assertCategoryBelongsToOrg(
    organizationId: string,
    categoryId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const category = await client.expenseCategory.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Categoria de despesa não encontrada.');
    }
  }
}
