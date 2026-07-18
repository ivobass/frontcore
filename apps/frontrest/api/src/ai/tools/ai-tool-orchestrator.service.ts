import { Inject, Injectable } from '@nestjs/common';
import type { AiCompletionProvider, AiCompletionResponse, AiMessage } from '@frontcore/ai';
import type { InvoiceStatus } from '@frontcore/database';
import { AI_COMPLETION_PROVIDER } from '../ai-completion-provider.token';
import { FinancialRetrievalService } from '../financial-retrieval/financial-retrieval.service';
import { buildFinancialContextMessage } from '../financial-retrieval/financial-context.builder';
import { FINANCIAL_TOOL_DEFINITIONS, TOOL_NAME_TO_INTENT } from './financial-tool.registry';

const VALID_STATUSES = new Set<string>(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']);

interface ParsedToolArguments {
  period?: unknown;
  status?: unknown;
  supplierName?: unknown;
  categoryName?: unknown;
}

/**
 * Regras fixas da tentativa assistida por tools — nunca dependem de
 * dados de nenhuma organização (mesma disciplina de `ASSISTANT_RULES`
 * em `ai-tenant-context.service.ts`). Só usada quando o retrieval
 * determinístico (Fase 8.1, reforçado nas Fases 8.3/8.4) já não
 * conseguiu resolver a pergunta sozinho — a tool, quando chamada,
 * devolve sempre dados reais e já calculados
 * (`FinancialRetrievalService.retrieveForIntent()`, com os mesmos
 * filtros fechados de estado/fornecedor/categoria da Fase 8.4), nunca
 * um espaço para o modelo inventar.
 */
const TOOL_ATTEMPT_RULES = `És o assistente financeiro do FrontRest, a responder a um utilizador autenticado de uma organização específica.

Não foi possível identificar automaticamente a intenção ou o período desta pergunta. Tens disponíveis ferramentas de consulta financeira só de leitura, que devolvem sempre dados reais e já calculados desta organização — nunca calcules nem estimes tu próprio nenhum valor.

Regras obrigatórias:
- Usa no máximo uma ferramenta, e só se for claramente aplicável à pergunta.
- Nunca inventes valores, datas, fornecedores, categorias, faturas ou estados.
- Nunca sugiras nem finjas alterar qualquer fatura, fornecedor ou categoria, e nunca afirmes que executaste, aprovaste ou registaste qualquer ação.
- Se nenhuma ferramenta for aplicável, não chames nenhuma.
- Responde sempre em português de Portugal, nunca em português do Brasil — nunca uses "você".`;

export type AiToolOrchestratorResult =
  | {
      kind: 'ANSWERED';
      content: string;
      provider: string;
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { kind: 'NOT_ANSWERED' };

/**
 * Orquestrador de tool calling do Chat IA (Fase 8.3) — específico do
 * FrontRest, nunca em `packages/ai` (que continua completamente
 * genérico, sem qualquer conhecimento de faturas). Só chamado por
 * `AiChatService` quando `FinancialRetrievalService.retrieve()` já
 * devolveu um `kind` diferente de `DATA` — nunca substitui o caminho
 * determinístico, só oferece uma segunda oportunidade, limitada a no
 * máximo uma tool call e duas chamadas ao provider (nunca um loop
 * aberto — sem agentes autónomos). Texto livre do modelo sem nenhuma
 * tool chamada nunca é usado como resposta final — só o resultado real
 * de uma tool, ou o fallback determinístico decidido por quem chama
 * este orquestrador. Garantia estrutural: a 2ª chamada ao provider só
 * acontece quando `retrieveForIntent()` devolve `kind === 'DATA'` —
 * qualquer outro resultado (`PERIOD_MISSING`, `PERIOD_AMBIGUOUS`,
 * `ERROR`, `UNSUPPORTED`) devolve `NOT_ANSWERED` de imediato, sem
 * construir nenhuma mensagem `tool` nem confiar em texto do modelo
 * gerado sem dados reais por trás.
 */
@Injectable()
export class AiToolOrchestratorService {
  constructor(
    @Inject(AI_COMPLETION_PROVIDER) private readonly provider: AiCompletionProvider,
    private readonly financialRetrieval: FinancialRetrievalService,
  ) {}

  async run(organizationId: string, history: AiMessage[]): Promise<AiToolOrchestratorResult> {
    const systemMessage: AiMessage = { role: 'system', content: TOOL_ATTEMPT_RULES };
    const messages: AiMessage[] = [systemMessage, ...history];

    let firstResponse: AiCompletionResponse;
    try {
      firstResponse = await this.provider.complete({ messages, tools: FINANCIAL_TOOL_DEFINITIONS });
    } catch {
      return { kind: 'NOT_ANSWERED' };
    }

    const toolCall = firstResponse.toolCalls?.[0];
    if (!toolCall) {
      // Texto livre sem tool nunca é usado como resposta final — o
      // fallback determinístico decide o que o utilizador vê.
      return { kind: 'NOT_ANSWERED' };
    }

    const intent = TOOL_NAME_TO_INTENT[toolCall.name];
    if (!intent) {
      // Nome de tool fora da allow-list (nunca oferecido, mas nunca
      // confiado só por isso) — nunca executado.
      return { kind: 'NOT_ANSWERED' };
    }

    const args = this.parseToolArguments(toolCall.arguments);
    if (!args || typeof args.period !== 'string' || args.period.trim().length === 0) {
      return { kind: 'NOT_ANSWERED' };
    }

    // organizationId vem sempre do chamador autenticado — nunca de
    // `args`, mesmo que o modelo tente incluir um campo semelhante (o
    // schema da tool nunca declara esse parâmetro, e mesmo que
    // estivesse presente aqui, seria ignorado). Filtros opcionais (Fase
    // 8.4) — `status` só aceite se corresponder exatamente a um dos 4
    // estados reais, nunca uma string arbitrária do modelo; nomes de
    // fornecedor/categoria são sempre resolvidos de forma segura dentro
    // de `retrieveForIntent()` (nunca confiados como um id).
    const rawFilters = {
      status: this.parseStatusArgument(args.status),
      supplierName: typeof args.supplierName === 'string' ? args.supplierName : undefined,
      categoryName: typeof args.categoryName === 'string' ? args.categoryName : undefined,
    };
    const retrievalResult = await this.financialRetrieval.retrieveForIntent(organizationId, intent, args.period, rawFilters);
    if (retrievalResult.kind !== 'DATA') {
      // Nunca converter um resultado não-DATA numa mensagem `tool` para
      // depois confiar na resposta textual do modelo — a 2ª chamada ao
      // provider só é feita quando existem dados financeiros reais.
      return { kind: 'NOT_ANSWERED' };
    }
    const toolResultContent = buildFinancialContextMessage(retrievalResult);

    const followUpMessages: AiMessage[] = [
      ...messages,
      { role: 'assistant', content: firstResponse.content ?? '', toolCalls: firstResponse.toolCalls },
      { role: 'tool', content: toolResultContent, toolCallId: toolCall.id, name: toolCall.name },
    ];

    let finalResponse: AiCompletionResponse;
    try {
      // Sem `tools` desta vez — força uma resposta textual final, nunca uma segunda tool call.
      finalResponse = await this.provider.complete({ messages: followUpMessages });
    } catch {
      return { kind: 'NOT_ANSWERED' };
    }

    if (!finalResponse.content) {
      return { kind: 'NOT_ANSWERED' };
    }

    return {
      kind: 'ANSWERED',
      content: finalResponse.content,
      provider: finalResponse.provider,
      model: finalResponse.model,
      inputTokens: finalResponse.usage?.inputTokens,
      outputTokens: finalResponse.usage?.outputTokens,
    };
  }

  private parseToolArguments(raw: string): ParsedToolArguments | null {
    try {
      return JSON.parse(raw) as ParsedToolArguments;
    } catch {
      return null;
    }
  }

  private parseStatusArgument(value: unknown): InvoiceStatus | undefined {
    return typeof value === 'string' && VALID_STATUSES.has(value) ? (value as InvoiceStatus) : undefined;
  }
}
