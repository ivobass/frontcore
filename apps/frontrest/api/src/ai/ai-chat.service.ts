import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@frontcore/database';
import type { AiConversation, AiMessage as AiMessageRow, AiMessageRole } from '@frontcore/database';
import { AiProviderError } from '@frontcore/ai';
import type { AiCompletionProvider, AiMessage } from '@frontcore/ai';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import { AI_COMPLETION_PROVIDER } from './ai-completion-provider.token';
import { AiTenantContextService } from './ai-tenant-context.service';
import { FinancialRetrievalService } from './financial-retrieval/financial-retrieval.service';
import { buildDeterministicReply } from './financial-retrieval/financial-context.builder';
import {
  buildFinancialConversationContext,
  parseFinancialConversationContext,
} from './financial-retrieval/financial-conversation-context';
import type { FinancialConversationContextV1 } from './financial-retrieval/financial-conversation-context';
import { AiToolOrchestratorService } from './tools/ai-tool-orchestrator.service';
import { classifyMessageRelevance } from './router/financial-relevance.classifier';
import { loadAiChatConfig, type AiChatConfig } from './ai-chat.config';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';

const PREVIEW_LENGTH = 120;

/** Marcadores das mensagens `ASSISTANT` respondidas sem nenhuma chamada ao provider confiada como final (Fase 8.3) — nunca confundíveis com uma resposta real de `mock`/`ollama`/`openrouter` numa auditoria. */
const DETERMINISTIC_PROVIDER = 'deterministic';
const DETERMINISTIC_MODEL = 'financial-retrieval-fallback';

export interface ChatMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface ConversationSummaryView {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Derivado da primeira mensagem da conversa (Fase 8.3) — título curto para a barra lateral, nunca persistido. */
  titlePreview: string | null;
}

export interface ConversationDetailView extends ConversationSummaryView {
  messages: ChatMessageView[];
}

export interface SendChatMessageResult {
  conversationId: string;
  message: ChatMessageView;
}

interface AssistantReply {
  content: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Orquestra o chat IA (Fase 8) — primeiro consumidor real de
 * `AiCompletionProvider`. Nunca conhece `OllamaAiProvider` diretamente,
 * só o tipo `AiCompletionProvider` injetado via `AI_COMPLETION_PROVIDER`
 * (`ai.module.ts`). O modelo nunca é fronteira de autorização — todo o
 * isolamento por organização/utilizador acontece nas queries Prisma
 * abaixo, antes de qualquer dado ser construído para o provider.
 *
 * Fase 8.4 — router híbrido antes de qualquer retrieval financeiro:
 * `classifyMessageRelevance()` decide `GENERAL` (sem nenhum sinal
 * financeiro-adjacente, defensivo — nunca só por um regex de intenção
 * falhar) vs. o caminho financeiro. Para conteúdo financeiro, o
 * provider só é chamado a confiar na resposta como final em duas
 * situações: (1) `FinancialRetrievalService.retrieve()` devolveu
 * `DATA` (dados reais já resolvidos, com filtros combinados —
 * estado/fornecedor/categoria — quando aplicáveis); (2)
 * `AiToolOrchestratorService.run()` devolveu `ANSWERED` (uma tool
 * read-only foi chamada e devolveu dados reais, o que só acontece
 * quando `retrieveForIntent()` também devolve `DATA` — ver
 * `AiToolOrchestratorService`). `ERROR`/`ENTITY_AMBIGUOUS` nunca
 * tentam o orquestrador nem o provider — vão direto ao fallback
 * determinístico. Em qualquer outro caso financeiro, a resposta é o
 * texto determinístico de `buildDeterministicReply()` — nunca texto
 * livre do modelo sem dados estruturados reais por trás. Para
 * `GENERAL`, o provider é chamado diretamente com um `system prompt`
 * mínimo e separado, sem tools nem dados da organização — nunca faz
 * nenhuma alegação financeira, por isso a garantia "nunca confiar sem
 * `DATA`" (que é sobre alegações financeiras) não se aplica aqui.
 *
 * Fase 8.7 — antes de classificar/resolver, lê `conversation.financialContext`
 * (snapshot versionado, `parseFinancialConversationContext()`) e passa-o
 * a `classifyMessageRelevance()`/`FinancialRetrievalService.retrieve()`
 * como fonte de recuperação preferida (mais fiável que reanalisar texto
 * livre do histórico — ver `financial-retrieval.service.ts`). Sempre que
 * o retrieval determinístico OU o orquestrador de tools produz um
 * resultado `DATA` real, o snapshot é reconstruído
 * (`buildFinancialConversationContext()`) e persistido na mesma
 * transação da mensagem `ASSISTANT`
 * (`persistAssistantReply()`) — nunca escrito a partir de texto livre
 * do modelo. Qualquer outro resultado (`UNSUPPORTED`/`PERIOD_MISSING`/
 * `PERIOD_AMBIGUOUS`/`ENTITY_AMBIGUOUS`/`ERROR`, e o caminho `GENERAL`)
 * nunca toca a coluna — o último snapshot bem-sucedido permanece válido
 * para a próxima mensagem. Isolamento por organização/utilizador/
 * conversa é sempre o já garantido por `findOwnedConversation()` — a
 * coluna vive na mesma linha, sem mecanismo novo.
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly config: AiChatConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_COMPLETION_PROVIDER) private readonly provider: AiCompletionProvider,
    private readonly tenantContext: AiTenantContextService,
    private readonly financialRetrieval: FinancialRetrievalService,
    private readonly toolOrchestrator: AiToolOrchestratorService,
  ) {
    this.config = loadAiChatConfig();
  }

  /**
   * Fluxo: valida → resolve/cria conversa (sempre organizationId+userId
   * autenticados, nunca vindos do pedido) → persiste USER → carrega
   * histórico → classifica a mensagem (Fase 8.4, `GENERAL` vs.
   * financeira) → `GENERAL` chama o provider com o `system prompt`
   * mínimo, sem retrieval nem tools; caso contrário resolve retrieval
   * financeiro (Fase 8.1, reforçado nas Fases 8.3/8.4) → `DATA` chama o
   * provider com contexto real; `UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS`
   * tentam o orquestrador de tools (Fase 8.3) antes de cair no fallback
   * determinístico; `ERROR`/`ENTITY_AMBIGUOUS` vão direto ao fallback
   * determinístico, sem tentar o orquestrador nem o provider → persiste
   * ASSISTANT. Se o provider falhar (caminho `GENERAL` ou `DATA`), a
   * mensagem USER já persistida fica (nunca apagada) e nenhuma
   * mensagem ASSISTANT falsa é criada — o erro devolvido ao cliente é
   * sempre sanitizado (ver `mapProviderError`).
   */
  async sendMessage(
    organizationId: string,
    userId: string,
    dto: SendChatMessageDto,
  ): Promise<SendChatMessageResult> {
    const content = dto.message.trim();
    if (content.length === 0) {
      throw new BadRequestException('A mensagem não pode estar vazia.');
    }
    if (content.length > this.config.maxMessageLength) {
      throw new BadRequestException(
        `A mensagem excede o limite de ${this.config.maxMessageLength} caracteres.`,
      );
    }

    const conversation = dto.conversationId
      ? await this.findOwnedConversation(organizationId, userId, dto.conversationId)
      : await this.prisma.aiConversation.create({ data: { organizationId, userId } });

    await this.prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'USER', content },
    });

    // Carregado depois de persistir a mensagem USER atual — as "últimas N
    // mensagens" já a incluem como a mais recente, sem a duplicar
    // manualmente no pedido ao provider. Reutilizado também para a
    // recuperação de intenção/período por histórico (Fase 8.3) e para
    // o orquestrador de tools (Fase 8.3) — sem query nova.
    const history = await this.loadHistoryMessages(conversation.id);
    const recentUserMessages = this.extractRecentUserMessages(history);

    // Fase 8.7 — snapshot financeiro versionado desta conversa (`null`
    // até à primeira resolução DATA, ou em conversas anteriores a esta
    // fase). Nunca lido de outra conversa/organização/utilizador — vem
    // da mesma linha já isolada por `findOwnedConversation()`/`create()`
    // acima.
    const previousContext = parseFinancialConversationContext(conversation.financialContext);

    // Fase 8.4 — router híbrido: classifica antes de tentar qualquer
    // retrieval financeiro. `GENERAL` só quando não existe nenhum sinal
    // financeiro-adjacente (defensivo — nunca por o regex de intenção
    // falhar, ver `classifyMessageRelevance()`) — caminho totalmente
    // separado, sem tools financeiras, sem dados da organização, com um
    // `system prompt` mínimo próprio. A garantia "nunca confiar sem
    // `DATA`" continua absoluta para qualquer alegação financeira — este
    // caminho nunca faz nenhuma. Fase 8.7 — `previousContext !== null`
    // também conta como contexto financeiro recente para uma continuação.
    if (classifyMessageRelevance(content, recentUserMessages, previousContext !== null) === 'GENERAL') {
      const systemMessage = this.tenantContext.buildGeneralSystemMessage();
      let response;
      try {
        response = await this.provider.complete({ messages: [systemMessage, ...history] });
      } catch (error) {
        throw this.mapProviderError(error);
      }
      return this.persistAssistantReply(conversation.id, {
        content: response.content,
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
      });
    }

    const retrievalResult = await this.financialRetrieval.retrieve(
      organizationId,
      content,
      recentUserMessages,
      undefined,
      previousContext,
    );

    if (retrievalResult.kind === 'DATA') {
      const systemMessage = this.tenantContext.buildSystemMessage(retrievalResult);
      let response;
      try {
        response = await this.provider.complete({ messages: [systemMessage, ...history] });
      } catch (error) {
        throw this.mapProviderError(error);
      }
      return this.persistAssistantReply(
        conversation.id,
        {
          content: response.content,
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
        },
        buildFinancialConversationContext(retrievalResult),
      );
    }

    // Fase 8.3 — antes do fallback determinístico, tenta uma oportunidade
    // adicional via tool calling (bounded, read-only), mas só quando faz
    // sentido: `UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS` podem
    // beneficiar de uma tool escolhida pelo modelo; `ERROR`/`ENTITY_AMBIGUOUS`
    // (Fase 8.4 — nome de fornecedor/categoria ambíguo) já são problemas
    // bem compreendidos que uma tool não resolveria melhor — nunca chamam
    // o orquestrador nem o provider, vão direto ao fallback determinístico.
    // Nunca reabre a possibilidade de alucinação:
    // `AiToolOrchestratorService` só devolve `ANSWERED` quando uma tool
    // real foi executada com sucesso — texto livre do modelo sem tool
    // nunca chega até aqui.
    if (retrievalResult.kind !== 'ERROR' && retrievalResult.kind !== 'ENTITY_AMBIGUOUS') {
      const toolResult = await this.toolOrchestrator.run(organizationId, history);
      if (toolResult.kind === 'ANSWERED') {
        // Fase 8.7 — o snapshot também é atualizado quando a resposta
        // veio de uma tool (`toolResult.retrievalResult`, sempre DATA
        // real) — uma continuação depois de um turno respondido por
        // tool calling recupera exatamente da mesma forma que uma
        // continuação depois do caminho determinístico principal.
        return this.persistAssistantReply(
          conversation.id,
          toolResult,
          buildFinancialConversationContext(toolResult.retrievalResult),
        );
      }
    }

    // Fallback determinístico final: sem dados estruturados reais (nem
    // do retrieval nem de nenhuma tool), a resposta nunca vem de texto
    // livre do modelo.
    return this.persistAssistantReply(conversation.id, {
      content: buildDeterministicReply(retrievalResult),
      provider: DETERMINISTIC_PROVIDER,
      model: DETERMINISTIC_MODEL,
    });
  }

  async listConversations(
    organizationId: string,
    userId: string,
    query: ListConversationsDto,
  ): Promise<Paginated<ConversationSummaryView>> {
    const { page, pageSize } = normalizePagination({ page: query.page, pageSize: query.pageSize });
    const where = { organizationId, userId };

    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Fase 8.3 — primeira mensagem (não a última) para derivar o título curto da barra lateral.
        include: { messages: { orderBy: { createdAt: 'asc' as const }, take: 1 } },
      }),
      this.prisma.aiConversation.count({ where }),
    ]);

    return {
      items: items.map((conversation) => this.toSummaryView(conversation)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getConversation(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<ConversationDetailView> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, organizationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' as const } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    return {
      ...this.toSummaryView({ ...conversation, messages: conversation.messages.slice(0, 1) }),
      messages: conversation.messages.map((message) => this.toMessageView(message)),
    };
  }

  /**
   * Eliminação física (Fase 8.3) — `onDelete: Cascade` já provisionado
   * no schema (`AiMessage.conversation`) elimina as mensagens
   * automaticamente, sem migration nova. Mesma verificação de
   * propriedade de `findOwnedConversation()` — conversa de outra
   * organização ou de outro utilizador devolve o mesmo 404 genérico.
   */
  async deleteConversation(organizationId: string, userId: string, id: string): Promise<void> {
    await this.findOwnedConversation(organizationId, userId, id);
    await this.prisma.aiConversation.delete({ where: { id } });
  }

  /**
   * `findFirst` com `organizationId` **e** `userId` no `where` — uma
   * conversa de outra organização ou de outro utilizador da mesma
   * organização devolve exatamente o mesmo 404 genérico que uma conversa
   * inexistente (nunca distinguível pela resposta, exigido pela Fase 8).
   */
  private async findOwnedConversation(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<AiConversation> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, organizationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    return conversation;
  }

  private async loadHistoryMessages(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: this.config.historyLimit,
    });
    // Carregadas descendente por eficiência do índice
    // (`AiMessage_conversationId_createdAt_idx`); invertidas aqui para
    // cronológica ascendente antes de chegarem ao provider.
    return rows.reverse().map((row) => ({
      role: this.toAiMessageRole(row.role),
      content: row.content,
    }));
  }

  /**
   * Mensagens `USER` anteriores à atual, mais recente primeiro (Fase
   * 8.3) — reaproveita o mesmo `history` já carregado para
   * `provider.complete()`, sem query nova. A mensagem atual é sempre a
   * última entrada de `history` (já persistida e recarregada) — por
   * isso excluída aqui via `.slice(0, -1)`.
   */
  private extractRecentUserMessages(history: AiMessage[]): string[] {
    return history
      .slice(0, -1)
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .reverse();
  }

  private toAiMessageRole(role: AiMessageRole): 'user' | 'assistant' {
    return role === 'ASSISTANT' ? 'assistant' : 'user';
  }

  private toMessageView(row: AiMessageRow): ChatMessageView {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSummaryView(
    conversation: AiConversation & { messages: AiMessageRow[] },
  ): ConversationSummaryView {
    const first = conversation.messages[0];
    return {
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      titlePreview: first ? this.truncate(first.content, PREVIEW_LENGTH) : null,
    };
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }

  /**
   * Persiste a mensagem `ASSISTANT` (real, com provider/model/tokens, ou
   * o marcador determinístico da Fase 8.3) e atualiza `updatedAt` da
   * conversa — mesma transação em ambos os caminhos. Fase 8.7 —
   * `financialContext` (opcional, só passado pelos dois caminhos com
   * `DATA` real — retrieval determinístico e tool calling) é escrito na
   * mesma transação; omitido, a coluna existente nunca é tocada (o
   * último snapshot bem-sucedido permanece válido).
   */
  private async persistAssistantReply(
    conversationId: string,
    reply: AssistantReply,
    financialContext?: FinancialConversationContextV1,
  ): Promise<SendChatMessageResult> {
    // Forma callback do `$transaction` — mesmo padrão já usado por
    // `InvoiceDraftsService.promote()`, e o único que o mock partilhado
    // de testes (`test/utils/mock-prisma.ts`) implementa.
    const assistantMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.aiMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: reply.content,
          provider: reply.provider,
          model: reply.model,
          inputTokens: reply.inputTokens,
          outputTokens: reply.outputTokens,
        },
      });
      await tx.aiConversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
          ...(financialContext ? { financialContext: financialContext as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      return message;
    });

    return {
      conversationId,
      message: this.toMessageView(assistantMessage),
    };
  }

  /**
   * Nunca propaga `error.message`/`error.cause` do provider ao cliente —
   * só texto fixo em pt-PT por `code` (mesma taxonomia sanitizada de
   * `AiProviderError`, Fase 6.11, estendida na Fase 8.2 com
   * `authentication`/`rate_limit` — códigos reais desde que
   * `OpenRouterAiProvider` existe). `timeout` → 504, indisponibilidade/
   * configuração/autenticação → 503 (erro do lado do servidor, nunca do
   * pedido do cliente), limite de taxa → 429, resposta inválida/
   * desconhecido → 502. O detalhe real do erro (`error.message`/
   * `error.cause`, nunca expostos ao cliente) é registado aqui, uma
   * única vez, no ponto exato onde a taxonomia sanitizada é decidida —
   * mesmo padrão já usado por `InvoiceDraftsService` para falhas
   * técnicas não expostas ao pedido HTTP.
   */
  private mapProviderError(error: unknown): HttpException {
    if (error instanceof AiProviderError) {
      this.logger.error(
        `Falha do provider de IA (code=${error.code}): ${error.message}`,
        error.cause instanceof Error ? error.cause.stack : undefined,
      );
      switch (error.code) {
        case 'timeout':
          return new GatewayTimeoutException(
            'O assistente de IA demorou demasiado tempo a responder. Tenta novamente.',
          );
        case 'provider_unavailable':
          return new ServiceUnavailableException(
            'O assistente de IA está indisponível de momento. Tenta novamente mais tarde.',
          );
        case 'model_not_found':
        case 'authentication':
          return new ServiceUnavailableException(
            'O assistente de IA não está configurado corretamente. Contacta o suporte.',
          );
        case 'rate_limit':
          return new HttpException(
            'O assistente de IA está a receber demasiados pedidos de momento. Tenta novamente dentro de instantes.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        case 'invalid_response':
        case 'unknown':
        default:
          return new BadGatewayException(
            'O assistente de IA devolveu uma resposta inválida. Tenta novamente.',
          );
      }
    }
    this.logger.error(
      'Falha inesperada ao chamar o provider de IA (não é AiProviderError).',
      error instanceof Error ? error.stack : undefined,
    );
    return new BadGatewayException(
      'Não foi possível obter resposta do assistente de IA. Tenta novamente.',
    );
  }
}
