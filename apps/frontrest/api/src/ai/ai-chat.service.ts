import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import { PrismaService } from '@frontcore/database';
import type { AiConversation, AiMessage as AiMessageRow, AiMessageRole } from '@frontcore/database';
import { AiProviderError } from '@frontcore/ai';
import type { AiCompletionProvider, AiMessage } from '@frontcore/ai';
import { normalizePagination, type Paginated } from '@frontcore/shared';
import { AI_COMPLETION_PROVIDER } from './ai-completion-provider.token';
import { AiTenantContextService } from './ai-tenant-context.service';
import { loadAiChatConfig, type AiChatConfig } from './ai-chat.config';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';

const PREVIEW_LENGTH = 120;

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
  lastMessagePreview: string | null;
}

export interface ConversationDetailView extends ConversationSummaryView {
  messages: ChatMessageView[];
}

export interface SendChatMessageResult {
  conversationId: string;
  message: ChatMessageView;
}

/**
 * Orquestra o chat IA (Fase 8) — primeiro consumidor real de
 * `AiCompletionProvider`. Nunca conhece `OllamaAiProvider` diretamente,
 * só o tipo `AiCompletionProvider` injetado via `AI_COMPLETION_PROVIDER`
 * (`ai.module.ts`). O modelo nunca é fronteira de autorização — todo o
 * isolamento por organização/utilizador acontece nas queries Prisma
 * abaixo, antes de qualquer dado ser construído para o provider.
 */
@Injectable()
export class AiChatService {
  private readonly config: AiChatConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_COMPLETION_PROVIDER) private readonly provider: AiCompletionProvider,
    private readonly tenantContext: AiTenantContextService,
  ) {
    this.config = loadAiChatConfig();
  }

  /**
   * Fluxo: valida → resolve/cria conversa (sempre organizationId+userId
   * autenticados, nunca vindos do pedido) → persiste USER → constrói
   * contexto → chama o provider → persiste ASSISTANT. Se o provider
   * falhar, a mensagem USER já persistida fica (nunca apagada) e nenhuma
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

    const systemMessage = await this.tenantContext.buildSystemMessage(organizationId);
    // Carregada depois de persistir a mensagem USER atual — as "últimas N
    // mensagens" já a incluem como a mais recente, sem a duplicar
    // manualmente no pedido ao provider.
    const history = await this.loadHistoryMessages(conversation.id);

    let responseContent: string;
    let responseProvider: string;
    let responseModel: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      const response = await this.provider.complete({
        messages: [systemMessage, ...history],
      });
      responseContent = response.content;
      responseProvider = response.provider;
      responseModel = response.model;
      inputTokens = response.usage?.inputTokens;
      outputTokens = response.usage?.outputTokens;
    } catch (error) {
      throw this.mapProviderError(error);
    }

    // Forma callback do `$transaction` — mesmo padrão já usado por
    // `InvoiceDraftsService.promote()`, e o único que o mock partilhado
    // de testes (`test/utils/mock-prisma.ts`) implementa.
    const assistantMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: responseContent,
          provider: responseProvider,
          model: responseModel,
          inputTokens,
          outputTokens,
        },
      });
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      return message;
    });

    return {
      conversationId: conversation.id,
      message: this.toMessageView(assistantMessage),
    };
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
        include: { messages: { orderBy: { createdAt: 'desc' as const }, take: 1 } },
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
      ...this.toSummaryView({ ...conversation, messages: conversation.messages.slice(-1) }),
      messages: conversation.messages.map((message) => this.toMessageView(message)),
    };
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
    const last = conversation.messages[0];
    return {
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessagePreview: last ? this.truncate(last.content, PREVIEW_LENGTH) : null,
    };
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }

  /**
   * Nunca propaga `error.message`/`error.cause` do provider — só texto
   * fixo em pt-PT por `code` (mesma taxonomia sanitizada de
   * `AiProviderError`, Fase 6.11). `timeout` → 504, indisponibilidade/
   * configuração → 503, resposta inválida/desconhecido → 502 — nenhum
   * destes é um erro do cliente (o pedido HTTP em si era válido).
   */
  private mapProviderError(error: unknown): HttpException {
    if (error instanceof AiProviderError) {
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
          return new ServiceUnavailableException(
            'O assistente de IA não está configurado corretamente. Contacta o suporte.',
          );
        case 'invalid_response':
        case 'unknown':
        default:
          return new BadGatewayException(
            'O assistente de IA devolveu uma resposta inválida. Tenta novamente.',
          );
      }
    }
    return new BadGatewayException(
      'Não foi possível obter resposta do assistente de IA. Tenta novamente.',
    );
  }
}
