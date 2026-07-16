import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `message` sem `@MaxLength` fixo no decorator — o limite real
 * (`AI_CHAT_MAX_MESSAGE_LENGTH`, `ai-chat.config.ts`) é configurável via
 * ambiente, por isso é validado em `AiChatService`, não aqui (um
 * decorator não pode ler `AiChatConfig`). `@MaxLength` aqui só como um
 * teto estrutural alto, para nunca aceitar um corpo absurdamente grande
 * antes até de chegar ao service.
 */
const STRUCTURAL_MAX_LENGTH = 20000;

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  @IsNotEmpty({ message: 'A mensagem não pode estar vazia.' })
  @MaxLength(STRUCTURAL_MAX_LENGTH)
  message!: string;
}
