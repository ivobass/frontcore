import type { FiscalExtractionResult } from '../fiscal-parsing/types';
import type { AiInvoiceExtractionV1, AiInvoiceLineV1 } from './types/ai-invoice-extraction';
import { isDecimalEqual } from './ai-invoice-extraction.validators';

/**
 * Reconciliação entre `FiscalExtractionResult` (determinístico,
 * `fiscal-parsing/`) e `AiInvoiceExtractionV1` (IA,
 * `ai-invoice-extractor.service.ts`) — camada de domínio própria (Fase
 * 6.14), separada de `@frontcore/ai` e nunca dentro de
 * `runDocumentExtractors()` (esse motor resolve conflitos POR CAMPO
 * entre extractors do MESMO tipo — regex vs. regex — só por confiança;
 * aqui as duas fontes são estruturalmente diferentes, e um empate nunca
 * pode ser resolvido silenciosamente, tem de ficar visível para revisão
 * humana). Política de combinação: iguais → `'agreement'`; diferentes
 * (não vazios) → `'conflict'`, nunca escolhido automaticamente
 * (`suggestedValue: null`); um vazio e o outro presente → o presente
 * como sugestão; ambos vazios → `'empty'`; um valor `manual` já
 * decidido pelo utilizador (Secção "Não sobrescrever correções
 * humanas") tem sempre prioridade absoluta, nunca reavaliado contra
 * determinístico/IA.
 */

export type ReconciliationStatus = 'agreement' | 'conflict' | 'deterministic_only' | 'ai_only' | 'empty' | 'manual';

export interface ReconciledField<T> {
  status: ReconciliationStatus;
  deterministicValue: T | null;
  aiValue: T | null;
  /** Valor a apresentar/pré-preencher na UI — nunca definido (`null`) num conflito ou quando ambas as fontes estão vazias; nunca escolhido arbitrariamente. */
  suggestedValue: T | null;
}

export interface InvoiceExtractionReconciliation {
  supplierName: ReconciledField<string>;
  supplierTaxId: ReconciledField<string>;
  invoiceNumber: ReconciledField<string>;
  issueDate: ReconciledField<string>;
  dueDate: ReconciledField<string>;
  currency: ReconciledField<string>;
  /** Determinístico nunca produz subtotal (`FiscalExtractionResult` não tem esse campo) — `deterministicValue` é sempre `null` aqui; documentado, não um bug. */
  subtotal: ReconciledField<string>;
  vatAmount: ReconciledField<string>;
  total: ReconciledField<string>;
  /** Só a IA extrai linhas — sem contraparte determinística para reconciliar; passagem direta de `AiInvoiceExtractionV1.items`. */
  items: AiInvoiceLineV1[];
}

/**
 * Valores já corrigidos explicitamente pelo utilizador, por campo —
 * `undefined` = "nunca corrigido" (reconciliação normal aplica-se);
 * `null`/valor = "o utilizador já decidiu isto" (prioridade absoluta,
 * nunca reavaliada). Quem chama decide a fonte desta informação; hoje
 * (Fase 6.14) os campos de cabeçalho de `InvoiceDraft` nunca são
 * escritos automaticamente por esta reconciliação (mesma disciplina já
 * estabelecida desde a Fase 6.7/6.8 — sugestões nunca persistidas sem
 * ação explícita), por isso nenhum chamador real passa isto ainda; o
 * parâmetro existe e está testado para o dia em que existir
 * rastreabilidade por campo de "já corrigido manualmente".
 */
export interface ManualInvoiceExtractionValues {
  supplierName?: string | null;
  supplierTaxId?: string | null;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency?: string | null;
  subtotal?: string | null;
  vatAmount?: string | null;
  total?: string | null;
}

export function reconcileInvoiceExtraction(
  deterministic: FiscalExtractionResult,
  ai: AiInvoiceExtractionV1 | null,
  manual: ManualInvoiceExtractionValues = {},
): InvoiceExtractionReconciliation {
  const deterministicTotal = deterministic.totals?.value.totalAmount ?? null;
  const deterministicVatAmount = deterministic.vat?.value.amount ?? null;

  return {
    supplierName: reconcileField(
      deterministic.supplier?.value.name ?? null,
      ai?.supplier.name ?? null,
      manual.supplierName,
      isStringEqual,
    ),
    supplierTaxId: reconcileField(
      deterministic.supplierTaxId?.value ?? null,
      ai?.supplier.taxId ?? null,
      manual.supplierTaxId,
      isStringEqual,
    ),
    invoiceNumber: reconcileField(
      deterministic.invoice.number?.value ?? null,
      ai?.invoice.number ?? null,
      manual.invoiceNumber,
      isStringEqual,
    ),
    issueDate: reconcileField(
      dateToIsoDay(deterministic.invoice.issueDate?.value ?? null),
      ai?.invoice.issueDate ?? null,
      manual.issueDate,
      isStringEqual,
    ),
    dueDate: reconcileField(
      dateToIsoDay(deterministic.invoice.dueDate?.value ?? null),
      ai?.invoice.dueDate ?? null,
      manual.dueDate,
      isStringEqual,
    ),
    currency: reconcileField(
      deterministic.invoice.currency?.value ?? null,
      ai?.invoice.currency ?? null,
      manual.currency,
      isStringEqual,
    ),
    subtotal: reconcileField(null, ai?.totals.subtotal ?? null, manual.subtotal, isAmountEqual),
    vatAmount: reconcileField(
      amountToFixedString(deterministicVatAmount),
      ai?.totals.vatAmount ?? null,
      manual.vatAmount,
      isAmountEqual,
    ),
    total: reconcileField(
      amountToFixedString(deterministicTotal),
      ai?.totals.total ?? null,
      manual.total,
      isAmountEqual,
    ),
    items: ai?.items ?? [],
  };
}

function reconcileField<T>(
  deterministicValue: T | null,
  aiValue: T | null,
  manualValue: T | null | undefined,
  isEqual: (a: T, b: T) => boolean,
): ReconciledField<T> {
  if (manualValue !== undefined) {
    return { status: 'manual', deterministicValue, aiValue, suggestedValue: manualValue };
  }

  const deterministicEmpty = deterministicValue === null;
  const aiEmpty = aiValue === null;

  if (deterministicEmpty && aiEmpty) {
    return { status: 'empty', deterministicValue: null, aiValue: null, suggestedValue: null };
  }
  if (deterministicEmpty) {
    return { status: 'ai_only', deterministicValue: null, aiValue, suggestedValue: aiValue };
  }
  if (aiEmpty) {
    return { status: 'deterministic_only', deterministicValue, aiValue: null, suggestedValue: deterministicValue };
  }
  if (isEqual(deterministicValue, aiValue)) {
    return { status: 'agreement', deterministicValue, aiValue, suggestedValue: deterministicValue };
  }
  return { status: 'conflict', deterministicValue, aiValue, suggestedValue: null };
}

function isStringEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Correção pós-revisão Codex — usa sempre o mesmo validador decimal
 * estrito do parser (`ai-invoice-extraction.validators.ts`), nunca
 * `Number.parseFloat` permissivo (que aceita prefixos parciais como
 * `"123.00abc"` → `123`, ou vírgula decimal sem validação real). Só
 * concorda quando AMBOS os lados são strings canónicas válidas — nunca
 * concorda silenciosamente com um valor mal formado. O lado
 * determinístico já chega sempre canónico (`amountToFixedString()`,
 * abaixo); o lado IA já vem validado pelo parser estrito
 * (`parseAiInvoiceExtraction()`) antes de chegar aqui — esta função
 * nunca é a primeira linha de defesa, só uma garantia adicional.
 */
function isAmountEqual(a: string, b: string): boolean {
  return isDecimalEqual(a, b);
}

function amountToFixedString(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function dateToIsoDay(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}
