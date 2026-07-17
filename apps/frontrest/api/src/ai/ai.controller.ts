import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Body, Query } from '@nestjs/common';
import { CurrentUser, type AuthenticatedIdentity } from '@frontcore/auth';
import { AiChatService } from './ai-chat.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';

/**
 * Sem `@Roles` em nenhuma rota — qualquer utilizador autenticado da
 * organização pode usar o chat (mesmo alcance de `GET /invoices`,
 * `GET /dashboard/financial-summary`). `organizationId`/`userId` vêm
 * sempre de `CurrentUser()`, nunca do corpo/query/path do pedido.
 */
@Controller('ai')
export class AiController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('chat')
  sendMessage(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.aiChatService.sendMessage(identity.organizationId, identity.userId, dto);
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: ListConversationsDto,
  ) {
    return this.aiChatService.listConversations(identity.organizationId, identity.userId, query);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.aiChatService.getConversation(identity.organizationId, identity.userId, id);
  }

  /** Fase 8.3 — eliminação física (cascata já provisionada no schema), isolada por organização e utilizador. */
  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConversation(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.aiChatService.deleteConversation(identity.organizationId, identity.userId, id);
  }
}
