import { Injectable } from '@nestjs/common';
import type { AiMessage } from '@frontcore/ai';
import type { FinancialRetrievalResult } from './financial-retrieval/financial-retrieval.service';
import { buildFinancialContextMessage } from './financial-retrieval/financial-context.builder';

/**
 * Regras fixas do assistente — nunca dependem de dados de nenhuma
 * organização. Declaram explicitamente os limites pedidos: só responder
 * com os dados fornecidos, admitir insuficiência, nunca inventar valores/
 * datas/fornecedores/faturas, nunca alterar dados nem fingir que executou
 * qualquer ação, nunca recalcular um total já fornecido (ex. "Por
 * pagar"), responder sempre em português de Portugal com os estados
 * traduzidos, e que o isolamento multi-tenant já está garantido antes
 * deste texto existir — o modelo nunca é fronteira de autorização, só
 * recebe dados já filtrados e já selecionados para a pergunta concreta.
 */
const ASSISTANT_RULES = `És o assistente financeiro do FrontRest, a responder a um utilizador autenticado de uma organização específica.

Regras obrigatórias:
- Responde só com base nos dados financeiros fornecidos abaixo, desta organização.
- Se os dados não forem suficientes para responder com confiança, diz isso explicitamente — nunca adivinhes nem estimes um valor que não esteja presente.
- Nunca inventes valores, datas, fornecedores, categorias, faturas ou estados que não estejam listados abaixo.
- Nunca sugiras nem finjas alterar qualquer fatura, fornecedor ou categoria, e nunca afirmes que executaste, aprovaste ou registaste qualquer ação — respondes só a perguntas, nunca escreves no domínio financeiro.
- Os dados abaixo pertencem exclusivamente à organização autenticada — não existe nenhum outro dado disponível.
- "Por pagar" significa sempre Pendente + Vencida — nunca inclui faturas Pagas.
- Quando os dados abaixo já incluem um valor calculado (ex. "Por pagar"), usa sempre esse valor diretamente — nunca o recalcules, estimes ou infiras a partir de outros números.
- Se te pedirem para explicares como chegaste a um valor, explica usando exclusivamente os dados fornecidos abaixo — nunca inventes operações matemáticas nem dados adicionais.
- Responde sempre em português de Portugal, nunca em português do Brasil — nunca uses "você".
- Usa sempre os nomes traduzidos dos estados das faturas (Pendente, Paga, Vencida, Cancelada) — nunca os nomes internos em inglês (PENDING, PAID, OVERDUE, CANCELLED).`;

/**
 * Contexto financeiro por tenant (Fase 8, redesenhado nas Fases 8.1 e
 * 8.3) — pequeno, read-only. Desde a Fase 8.3, só é chamado quando
 * `AiChatService` já confirmou um resultado `DATA` do retrieval
 * financeiro (`FinancialRetrievalService`) — os outros 4 resultados
 * (`UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS`/`ERROR`) nunca
 * chegam aqui nem ao provider, ver `AiChatService.sendMessage()` e
 * `buildDeterministicReply()`. Esta classe fica só a compor as regras
 * fixas com o bloco de dados já resolvido — sem I/O, sem depender de
 * `FinancialRetrievalService`.
 */
@Injectable()
export class AiTenantContextService {
  /** Mensagem `system` completa (regras + dados) para o pedido de completion — só chamada com um resultado `DATA`. */
  buildSystemMessage(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): AiMessage {
    const dataSection = buildFinancialContextMessage(result);
    return {
      role: 'system',
      content: `${ASSISTANT_RULES}\n\n${dataSection}`,
    };
  }
}
