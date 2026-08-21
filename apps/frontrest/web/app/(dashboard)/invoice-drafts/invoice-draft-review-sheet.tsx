'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Input,
  Textarea,
  FormField,
  FieldLabel,
  Badge,
  Spinner,
  Alert,
  AlertDescription,
} from '@frontcore/ui';
import {
  getInvoiceDraft,
  deleteInvoiceDraft,
  promoteInvoiceDraft,
  getInvoiceDraftFiscalSuggestions,
  runAiInvoiceExtraction,
  saveInvoiceDraftReview,
} from '../../../lib/invoice-drafts';
import type {
  InvoiceDraft,
  InvoiceDraftItem,
  DraftFiscalSuggestions,
  UpdateInvoiceDraftInput,
  InvoiceDraftItemInput,
  InvoiceExtractionReconciliation,
  ReconciledField,
} from '../../../lib/invoice-drafts';
import { isSessionLifecycleError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';
import { listSuppliers } from '../../../lib/suppliers';
import type { Supplier } from '../../../lib/suppliers';
import { listExpenseCategories } from '../../../lib/expense-categories';
import type { ExpenseCategory } from '../../../lib/expense-categories';
import { formatCurrency, formatDate } from '../../../lib/format';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import { fullWidthSelectClassName } from '../invoices/constants';
import { OCR_STATUS_BADGE_VARIANT, OCR_STATUS_LABELS, OCR_POLL_INTERVAL_MS } from './constants';

const PICKER_PAGE_SIZE = 100;

/** Forma editável do formulário — tudo string, `''` representa "sem valor" (mapeado para `null` no PATCH). */
interface DraftFormValues {
  supplierId: string;
  categoryId: string;
  number: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  notes: string;
}

const EMPTY_FORM: DraftFormValues = {
  supplierId: '',
  categoryId: '',
  number: '',
  issueDate: '',
  dueDate: '',
  totalAmount: '',
  notes: '',
};

function draftToFormValues(draft: InvoiceDraft): DraftFormValues {
  return {
    supplierId: draft.supplierId ?? '',
    categoryId: draft.categoryId ?? '',
    number: draft.number ?? '',
    issueDate: draft.issueDate ? draft.issueDate.slice(0, 10) : '',
    dueDate: draft.dueDate ? draft.dueDate.slice(0, 10) : '',
    totalAmount: draft.totalAmount ?? '',
    notes: draft.notes ?? '',
  };
}

/** Forma editável de uma linha (Fase 6.14) — tudo string, `''` = "sem valor" (mapeado para `null` no PUT). */
interface DraftItemFormRow {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  totalPrice: string;
}

const EMPTY_ITEM_ROW: DraftItemFormRow = {
  description: '',
  quantity: '',
  unit: '',
  unitPrice: '',
  vatRate: '',
  totalPrice: '',
};

function draftItemToFormRow(item: InvoiceDraftItem): DraftItemFormRow {
  return {
    description: item.description,
    quantity: item.quantity ?? '',
    unit: item.unit ?? '',
    unitPrice: item.unitPrice ?? '',
    vatRate: item.vatRate ?? '',
    totalPrice: item.totalPrice ?? '',
  };
}

/** `position` é sempre o índice no array (1-based) — a ordem das linhas na UI é sempre a ordem final, nunca um campo independente que possa dessincronizar. */
function buildItemsPayload(rows: DraftItemFormRow[]): InvoiceDraftItemInput[] {
  return rows.map((row, index) => ({
    position: index + 1,
    description: row.description,
    quantity: row.quantity === '' ? null : Number(row.quantity),
    unit: row.unit === '' ? null : row.unit,
    unitPrice: row.unitPrice === '' ? null : Number(row.unitPrice),
    vatRate: row.vatRate === '' ? null : Number(row.vatRate),
    totalPrice: row.totalPrice === '' ? null : Number(row.totalPrice),
  }));
}

const RECONCILED_HEADER_FIELDS: Array<{
  key: keyof Omit<InvoiceExtractionReconciliation, 'items'>;
  label: string;
}> = [
  { key: 'supplierName', label: 'Fornecedor (IA)' },
  { key: 'supplierTaxId', label: 'NIF' },
  { key: 'invoiceNumber', label: 'Número' },
  { key: 'issueDate', label: 'Emissão' },
  { key: 'dueDate', label: 'Vencimento' },
  { key: 'currency', label: 'Moeda' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'vatAmount', label: 'IVA' },
  { key: 'total', label: 'Total' },
];

const RECONCILIATION_STATUS_LABELS: Record<ReconciledField<string>['status'], string> = {
  agreement: 'concordância',
  conflict: 'conflito',
  deterministic_only: 'só determinístico',
  ai_only: 'só IA',
  empty: 'sem dados',
  manual: 'manual',
};

/**
 * Normaliza um nome de fornecedor para comparação — ignora maiúsculas/
 * minúsculas, hífens (incluindo variantes en/em dash), pontuação
 * simples e espaços múltiplos. Nunca ignora acentos — não pedido, e
 * fundir "Café"/"Cafe" arrisca juntar fornecedores genuinamente
 * distintos.
 */
function normalizeSupplierName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[.,;:!?'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza um NIF para comparação — ignora espaços/hífens e maiúsculas/minúsculas (ex. prefixo "PT"). */
function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Resultado da resolução de fornecedor — nunca um simples `string | null`,
 * porque "não encontrado" e "encontrado mas em conflito" exigem avisos
 * diferentes ao utilizador (ver `resolveSupplierMatch`).
 */
type SupplierMatch =
  | { status: 'matched'; supplierId: string }
  | { status: 'conflicting_tax_id'; matchedSupplierName: string }
  | { status: 'not_found' };

/**
 * Resolve um fornecedor já existente a partir das sugestões do parsing
 * fiscal — nunca cria um fornecedor novo. Regra pensada para dois casos
 * reais em tensão:
 *
 * 1. **Caso comum, seguro**: um fornecedor criado manualmente sem
 *    preencher o campo NIF (opcional no formulário de fornecedores, ver
 *    `supplier-form-dialog.tsx`) tem `taxId: null`. O parsing quase
 *    sempre sugere um NIF quando o documento o contém — desistir assim
 *    que o NIF sugerido não bate certo faria a maioria dos fornecedores
 *    reais nunca corresponder por nome, mesmo com o nome idêntico
 *    (achado real, validação manual: "Farmacia Monumental"/NIF
 *    511234740). Por isso, quando a procura por NIF falha, tenta-se o
 *    nome a seguir — mas só quando o fornecedor homónimo **não tem
 *    nenhum NIF registado**: nesse caso, a ausência de NIF local é
 *    consistente com "ainda não preenchido", não com "é outro
 *    fornecedor".
 * 2. **Caso perigoso, a evitar**: se o fornecedor homónimo **já tem** um
 *    NIF registado — que, pela definição deste ramo, é necessariamente
 *    diferente do sugerido, porque a procura por NIF já falhou —, isso
 *    já não é "NIF por preencher": é um sinal real de que existem dois
 *    fornecedores distintos com o mesmo nome (ex. duas filiais, franchise,
 *    homónimos genuínos), cada um com o seu NIF próprio. Selecionar
 *    automaticamente aqui arriscaria associar o rascunho ao fornecedor
 *    errado sem o utilizador reparar — por isso este caso nunca recua
 *    para nome; fica como `conflicting_tax_id`, com aviso explícito, e o
 *    utilizador decide.
 *
 * Sem NIF sugerido (`suggestions.supplierTaxId` ausente), o único sinal
 * disponível é o nome — comportamento inalterado desde a correção
 * anterior.
 */
function resolveSupplierMatch(suggestions: DraftFiscalSuggestions, suppliers: Supplier[]): SupplierMatch {
  if (suggestions.supplierTaxId) {
    const suggestedTaxId = normalizeTaxId(suggestions.supplierTaxId.value);
    const byTaxId = suppliers.find(
      (supplier) => supplier.taxId && normalizeTaxId(supplier.taxId) === suggestedTaxId,
    );
    if (byTaxId) return { status: 'matched', supplierId: byTaxId.id };

    if (suggestions.supplier) {
      const suggestedName = normalizeSupplierName(suggestions.supplier.value.name);
      const byName = suppliers.find((supplier) => normalizeSupplierName(supplier.name) === suggestedName);
      if (byName) {
        // Fornecedor homónimo já tem um NIF (diferente do sugerido,
        // porque a procura acima falhou) — não é "por preencher", é um
        // conflito real. Nunca decidir isto sozinho.
        if (byName.taxId) {
          return { status: 'conflicting_tax_id', matchedSupplierName: byName.name };
        }
        return { status: 'matched', supplierId: byName.id };
      }
    }
    return { status: 'not_found' };
  }

  if (suggestions.supplier) {
    const suggestedName = normalizeSupplierName(suggestions.supplier.value.name);
    const byName = suppliers.find((supplier) => normalizeSupplierName(supplier.name) === suggestedName);
    if (byName) return { status: 'matched', supplierId: byName.id };
  }

  return { status: 'not_found' };
}

/** Só as chaves com valor diferente do guardado entram no payload — campo inalterado fica ausente (Fase 6.8: "não alterar"). */
function buildPatch(current: DraftFormValues, saved: DraftFormValues): UpdateInvoiceDraftInput {
  const patch: UpdateInvoiceDraftInput = {};
  if (current.supplierId !== saved.supplierId) {
    patch.supplierId = current.supplierId === '' ? null : current.supplierId;
  }
  if (current.categoryId !== saved.categoryId) {
    patch.categoryId = current.categoryId === '' ? null : current.categoryId;
  }
  if (current.number !== saved.number) {
    patch.number = current.number === '' ? null : current.number;
  }
  if (current.issueDate !== saved.issueDate) {
    patch.issueDate = current.issueDate === '' ? null : current.issueDate;
  }
  if (current.dueDate !== saved.dueDate) {
    patch.dueDate = current.dueDate === '' ? null : current.dueDate;
  }
  if (current.totalAmount !== saved.totalAmount) {
    patch.totalAmount = current.totalAmount === '' ? null : Number(current.totalAmount);
  }
  if (current.notes !== saved.notes) {
    patch.notes = current.notes === '' ? null : current.notes;
  }
  return patch;
}

export interface InvoiceDraftReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string | null;
  /**
   * Chamada autenticada centralizada (`useSession().authFetch`,
   * `lib/session-context.tsx`) — lê sempre os tokens mais recentes,
   * renova a sessão uma única vez num 401, e termina a sessão de forma
   * uniforme (`sessionExpired()`) se a renovação falhar. Correção final
   * pós-revisão Codex — substitui os props anteriores `accessToken`/
   * `refreshToken`/`onTokensRefreshed`/`onSessionExpired`: cobre agora
   * TODOS os pedidos autenticados desta folha (abertura, polling,
   * sugestões fiscais, listas auxiliares, guardar, eliminar, promover),
   * não só guardar/eliminar/promover.
   */
  authFetch: AuthFetch;
  canManage: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onPromoted: () => void;
}

export function InvoiceDraftReviewSheet({
  open,
  onOpenChange,
  draftId,
  authFetch,
  canManage,
  onSaved,
  onDeleted,
  onPromoted,
}: InvoiceDraftReviewSheetProps) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedValues, setSavedValues] = useState<DraftFormValues>(EMPTY_FORM);
  const [formValues, setFormValues] = useState<DraftFormValues>(EMPTY_FORM);

  const [savedItemRows, setSavedItemRows] = useState<DraftItemFormRow[]>([]);
  const [itemRows, setItemRows] = useState<DraftItemFormRow[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [suggestions, setSuggestions] = useState<DraftFiscalSuggestions | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [supplierWarning, setSupplierWarning] = useState<string | null>(null);

  const [aiReconciliation, setAiReconciliation] = useState<InvoiceExtractionReconciliation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const applyDraft = useCallback((next: InvoiceDraft) => {
    setDraft(next);
    const values = draftToFormValues(next);
    setSavedValues(values);
    setFormValues(values);
    const rows = next.items.map(draftItemToFormRow);
    setSavedItemRows(rows);
    setItemRows(rows);
  }, []);

  // Carrega o rascunho ao abrir/trocar de id — reinicia todo o estado
  // derivado (sugestões, formulário) para não misturar dados de um
  // rascunho anterior.
  useEffect(() => {
    if (!open || !draftId) return;
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setParsingError(null);
    setSupplierWarning(null);
    setSaveError(null);
    setPromoteError(null);
    setItemsError(null);
    setAiReconciliation(null);
    setAiError(null);
    authFetch((token) => getInvoiceDraft(token, draftId))
      .then((next) => {
        applyDraft(next);
        setLoading(false);
      })
      .catch((err) => {
        if (isSessionLifecycleError(err)) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar rascunho.');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId, applyDraft]);

  // Listas para os selects — só quando MANAGER+ (MEMBER nunca edita).
  useEffect(() => {
    if (!open || !canManage) return;
    authFetch((token) => listSuppliers(token, { pageSize: PICKER_PAGE_SIZE }))
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
    authFetch((token) => listExpenseCategories(token))
      .then(setCategories)
      .catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canManage]);

  // Polling do estado OCR — só enquanto PENDING/PROCESSING, cancelado ao
  // fechar, desmontar, ou assim que chega a COMPLETED/FAILED.
  useEffect(() => {
    if (!open || !draftId || !draft) return;
    if (draft.ocrStatus !== 'PENDING' && draft.ocrStatus !== 'PROCESSING') return;

    let cancelled = false;
    const timer = setInterval(() => {
      authFetch((token) => getInvoiceDraft(token, draftId))
        .then((next) => {
          if (cancelled) return;
          setDraft(next);
          // Só o snapshot de estado OCR muda por polling — o formulário
          // do utilizador (formValues/itemRows) nunca é tocado aqui,
          // mesmo que outros campos do draft tenham mudado entretanto.
          setSavedValues(draftToFormValues(next));
          setSavedItemRows(next.items.map(draftItemToFormRow));
        })
        .catch(() => {
          /* falha pontual de polling não interrompe o ciclo — tenta na próxima iteração (`authFetch` já renovou a sessão silenciosamente ou terminou-a se o refresh também falhou) */
        });
    }, OCR_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId, draft]);

  // Parsing fiscal automático quando o OCR chega a COMPLETED — o
  // endpoint é puro/sem persistência (Fase 6.7), por isso é seguro
  // pedir sem ação explícita do utilizador. Nunca aplica os valores ao
  // formulário nem os persiste sozinho; erro tratado num estado próprio
  // (`parsingError`), nunca misturado com `ocrError`.
  useEffect(() => {
    if (!draftId || !draft) return;
    if (draft.ocrStatus !== 'COMPLETED') return;
    if (suggestions || parsingLoading) return;

    setParsingLoading(true);
    setParsingError(null);
    authFetch((token) => getInvoiceDraftFiscalSuggestions(token, draftId))
      .then((result) => {
        setSuggestions(result);
        setParsingLoading(false);
      })
      .catch((err) => {
        if (isSessionLifecycleError(err)) return;
        setParsingError(err instanceof Error ? err.message : 'Erro ao obter sugestões fiscais.');
        setParsingLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, draft, suggestions, parsingLoading]);

  async function applySuggestions() {
    if (!suggestions) return;

    // A lista de fornecedores só é carregada uma vez, quando a folha
    // abre (efeito acima) — se o utilizador criar um fornecedor
    // entretanto (ex. noutro separador, sem fechar esta folha) e voltar
    // a clicar aqui, `suppliers` fica desatualizada: nem o Select nem
    // resolveSupplierMatch() veem o fornecedor novo, mesmo que já
    // exista na base de dados (achado real, validação manual —
    // "Farmacia Esperanca"). Por isso recarrega-se aqui, no momento em
    // que a resolução é realmente feita — nunca polling, só a fonte de
    // dados correta no momento certo. Falha pontual a recarregar usa o
    // que já estava carregado, em vez de bloquear a ação.
    let currentSuppliers = suppliers;
    try {
      const fresh = await authFetch((token) => listSuppliers(token, { pageSize: PICKER_PAGE_SIZE }));
      currentSuppliers = fresh.items;
      setSuppliers(fresh.items);
    } catch {
      /* mantém a lista já carregada — melhor resolver com dados possivelmente desatualizados do que falhar a ação inteira */
    }

    // Resolve o fornecedor sugerido contra a lista recarregada — nunca
    // cria um fornecedor novo. Sem correspondência (ou em conflito), o
    // Select mantém o valor atual (nunca limpa uma escolha manual já
    // feita) e um aviso explica porquê, em vez de falhar silenciosamente.
    let warning: string | null = null;
    let supplierId = formValues.supplierId;
    if (suggestions.supplierTaxId || suggestions.supplier) {
      const match = resolveSupplierMatch(suggestions, currentSuppliers);
      if (match.status === 'matched') {
        supplierId = match.supplierId;
      } else if (match.status === 'conflicting_tax_id') {
        warning = `Fornecedor sugerido "${match.matchedSupplierName}" existe na lista, mas com um NIF diferente do sugerido (${suggestions.supplierTaxId?.value}). Verifique e associe manualmente.`;
      } else {
        const suggestedName = suggestions.supplier?.value.name;
        warning = suggestedName
          ? `Fornecedor sugerido "${suggestedName}" não existe na lista de fornecedores. Crie ou associe o fornecedor manualmente.`
          : 'Fornecedor sugerido não existe na lista de fornecedores. Crie ou associe o fornecedor manualmente.';
      }
    }
    setSupplierWarning(warning);

    setFormValues((prev) => ({
      ...prev,
      supplierId,
      number: suggestions.invoice.number?.value ?? prev.number,
      issueDate: suggestions.invoice.issueDate?.value
        ? suggestions.invoice.issueDate.value.slice(0, 10)
        : prev.issueDate,
      dueDate: suggestions.invoice.dueDate?.value
        ? suggestions.invoice.dueDate.value.slice(0, 10)
        : prev.dueDate,
      totalAmount:
        suggestions.totals?.value.totalAmount !== undefined
          ? String(suggestions.totals.value.totalAmount)
          : prev.totalAmount,
    }));
  }

  function updateItemRow(index: number, patch: Partial<DraftItemFormRow>) {
    setItemRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addItemRow() {
    setItemRows((prev) => [...prev, { ...EMPTY_ITEM_ROW }]);
  }

  function removeItemRow(index: number) {
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  }

  function moveItemRow(index: number, direction: -1 | 1) {
    setItemRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * Fase 6.14 — corre o parsing determinístico + a extração por IA
   * (uma única chamada estruturada) e reconcilia os dois. Ação
   * explícita (nunca automática, ao contrário do parsing fiscal
   * determinístico/gratuito) — envolve sempre uma chamada real a um
   * provider de IA. Recarrega sempre `items`/`itemsReviewedByHuman` a
   * partir da resposta (fonte de verdade do backend, que só escreve as
   * linhas quando ainda não tinham sido revistas manualmente) — nunca
   * aplica `reconciliation.items` diretamente ao formulário.
   */
  async function handleRunAiExtraction() {
    if (!draftId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await authFetch((token) => runAiInvoiceExtraction(token, draftId));
      setAiReconciliation(result.reconciliation);
      setDraft((prev) =>
        prev
          ? { ...prev, items: result.items, itemsReviewedByHuman: prev.itemsReviewedByHuman || result.itemsPersisted }
          : prev,
      );
      const rows = result.items.map(draftItemToFormRow);
      setSavedItemRows(rows);
      setItemRows(rows);
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setAiError(err instanceof Error ? err.message : 'Erro ao analisar com IA.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    if (!draftId) return;
    const patch = buildPatch(formValues, savedValues);
    const itemsChanged = JSON.stringify(itemRows) !== JSON.stringify(savedItemRows);
    if (Object.keys(patch).length === 0 && !itemsChanged) return;

    if (itemsChanged && itemRows.some((row) => row.description.trim() === '')) {
      setItemsError('Todas as linhas precisam de uma descrição.');
      return;
    }
    setItemsError(null);

    setSaving(true);
    setSaveError(null);
    try {
      // Correção pós-revisão Codex (achado 9) — cabeçalho e linhas são
      // gravados num único pedido atómico (`PATCH :id/review`, mesma
      // transação Prisma no backend). Antes, dois pedidos independentes
      // (`PATCH :id` + `PUT :id/items`) podiam deixar um sucesso parcial
      // silencioso: se o cabeçalho gravasse e as linhas falhassem, o
      // servidor ficava com o cabeçalho atualizado, mas a UI nunca
      // aplicava esse resultado nem distinguia esse caso de "nada foi
      // guardado". Com um único pedido, ou os dois persistem, ou nenhum.
      const latestDraft = await authFetch((token) =>
        saveInvoiceDraftReview(token, draftId, {
          ...(Object.keys(patch).length > 0 ? { patch } : {}),
          ...(itemsChanged ? { items: buildItemsPayload(itemRows) } : {}),
        }),
      );
      applyDraft(latestDraft);
      onSaved();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setSaveError(err instanceof Error ? err.message : 'Erro ao guardar alterações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draftId) return;
    setDeleting(true);
    try {
      await authFetch((token) => deleteInvoiceDraft(token, draftId));
      setDeleteConfirmOpen(false);
      onDeleted();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setSaveError(err instanceof Error ? err.message : 'Erro ao eliminar rascunho.');
    } finally {
      setDeleting(false);
    }
  }

  async function handlePromote() {
    if (!draftId) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      await authFetch((token) => promoteInvoiceDraft(token, draftId));
      setPromoteConfirmOpen(false);
      onPromoted();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setPromoteError(err instanceof Error ? err.message : 'Erro ao promover rascunho.');
    } finally {
      setPromoting(false);
    }
  }

  const isDirty =
    Object.keys(buildPatch(formValues, savedValues)).length > 0 ||
    JSON.stringify(itemRows) !== JSON.stringify(savedItemRows);
  const canPromote = Boolean(draft?.supplierId && draft?.issueDate && draft?.totalAmount);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Revisão do rascunho</SheetTitle>
            <SheetDescription>
              {draft?.storageObject.filename ?? 'A carregar…'}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {draft ? (
            <div className="flex flex-col gap-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Estado OCR:</span>
                <Badge variant={OCR_STATUS_BADGE_VARIANT[draft.ocrStatus]}>
                  {OCR_STATUS_LABELS[draft.ocrStatus]}
                </Badge>
                {draft.ocrConfidence !== null ? (
                  <span className="text-sm text-muted-foreground">
                    {Math.round(draft.ocrConfidence)}% confiança
                  </span>
                ) : null}
              </div>

              {draft.ocrStatus === 'FAILED' && draft.ocrError ? (
                <Alert variant="destructive">
                  <AlertDescription>{draft.ocrError}</AlertDescription>
                </Alert>
              ) : null}

              {parsingLoading ? (
                <p className="text-sm text-muted-foreground">A obter sugestões fiscais…</p>
              ) : null}
              {parsingError ? (
                <Alert variant="destructive">
                  <AlertDescription>Sugestões fiscais: {parsingError}</AlertDescription>
                </Alert>
              ) : null}

              {suggestions ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Sugestões do parsing fiscal</p>
                    {canManage ? (
                      <Button variant="outline" size="sm" onClick={applySuggestions}>
                        Aplicar sugestões
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Transitórias — só preenchem o formulário depois de "Aplicar sugestões"; nunca
                    persistidas automaticamente.
                  </p>
                  {suggestions.supplier ? (
                    <p className="text-sm">
                      Fornecedor sugerido: {suggestions.supplier.value.name}
                      {suggestions.supplierTaxId ? ` (NIF ${suggestions.supplierTaxId.value})` : ''}{' '}
                      <span className="text-muted-foreground">
                        — {Math.round(suggestions.supplier.confidence)}% confiança
                      </span>
                    </p>
                  ) : null}
                  {suggestions.invoice.number ? (
                    <p className="text-sm">
                      Número: {suggestions.invoice.number.value}{' '}
                      <span className="text-muted-foreground">
                        — {Math.round(suggestions.invoice.number.confidence)}% confiança
                      </span>
                    </p>
                  ) : null}
                  {suggestions.invoice.issueDate ? (
                    <p className="text-sm">
                      Emissão: {formatDate(suggestions.invoice.issueDate.value)}{' '}
                      <span className="text-muted-foreground">
                        — {Math.round(suggestions.invoice.issueDate.confidence)}% confiança
                      </span>
                    </p>
                  ) : null}
                  {suggestions.invoice.dueDate ? (
                    <p className="text-sm">
                      Vencimento: {formatDate(suggestions.invoice.dueDate.value)}{' '}
                      <span className="text-muted-foreground">
                        — {Math.round(suggestions.invoice.dueDate.confidence)}% confiança
                      </span>
                    </p>
                  ) : null}
                  {suggestions.totals ? (
                    <p className="text-sm">
                      Total: {formatCurrency(String(suggestions.totals.value.totalAmount))}{' '}
                      <span className="text-muted-foreground">
                        — {Math.round(suggestions.totals.confidence)}% confiança
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canManage ? (
                <div className="flex flex-col gap-4">
                  <FormField>
                    <FieldLabel>Fornecedor</FieldLabel>
                    <select
                      className={fullWidthSelectClassName}
                      value={formValues.supplierId}
                      onChange={(event) => {
                        setSupplierWarning(null);
                        setFormValues((prev) => ({ ...prev, supplierId: event.target.value }));
                      }}
                    >
                      <option value="">Por atribuir</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    {supplierWarning ? (
                      <Alert variant="warning" className="mt-2">
                        <AlertDescription>{supplierWarning}</AlertDescription>
                      </Alert>
                    ) : null}
                  </FormField>

                  <FormField>
                    <FieldLabel>Categoria</FieldLabel>
                    <select
                      className={fullWidthSelectClassName}
                      value={formValues.categoryId}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, categoryId: event.target.value }))
                      }
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField>
                    <FieldLabel>Número</FieldLabel>
                    <Input
                      value={formValues.number}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, number: event.target.value }))
                      }
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Data de emissão</FieldLabel>
                    <Input
                      type="date"
                      value={formValues.issueDate}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, issueDate: event.target.value }))
                      }
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Data de vencimento (opcional)</FieldLabel>
                    <Input
                      type="date"
                      value={formValues.dueDate}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, dueDate: event.target.value }))
                      }
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Total</FieldLabel>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formValues.totalAmount}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, totalAmount: event.target.value }))
                      }
                    />
                  </FormField>

                  <FormField>
                    <FieldLabel>Notas</FieldLabel>
                    <Textarea
                      value={formValues.notes}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                  </FormField>

                  {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
                  {promoteError ? (
                    <p className="text-sm text-destructive">{promoteError}</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Fornecedor:</span>{' '}
                    {draft.supplier?.name ?? 'Por atribuir'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Categoria:</span>{' '}
                    {draft.category?.name ?? '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Número:</span> {draft.number ?? '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Emissão:</span>{' '}
                    {formatDate(draft.issueDate)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Vencimento:</span>{' '}
                    {formatDate(draft.dueDate)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Total:</span>{' '}
                    {draft.totalAmount ? formatCurrency(draft.totalAmount) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Notas:</span> {draft.notes ?? '—'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Linhas</FieldLabel>
                  {canManage ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRunAiExtraction}
                        disabled={!draft.ocrText || aiLoading}
                      >
                        {aiLoading ? 'A analisar…' : 'Analisar com IA'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={addItemRow}>
                        Adicionar linha
                      </Button>
                    </div>
                  ) : null}
                </div>

                {aiError ? <p className="text-sm text-destructive">Extração IA: {aiError}</p> : null}

                {aiReconciliation ? (
                  <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Reconciliação determinístico + IA (cabeçalho)</p>
                    {RECONCILED_HEADER_FIELDS.map(({ key, label }) => {
                      const field = aiReconciliation[key];
                      if (field.status === 'empty') return null;
                      if (field.status === 'conflict') {
                        return (
                          <p key={key} className="text-sm">
                            {label}: <span className="text-destructive">conflito</span> — determinístico "
                            {field.deterministicValue}" vs IA "{field.aiValue}"
                          </p>
                        );
                      }
                      return (
                        <p key={key} className="text-sm">
                          {label}: {field.suggestedValue}{' '}
                          <span className="text-muted-foreground">
                            ({RECONCILIATION_STATUS_LABELS[field.status]})
                          </span>
                        </p>
                      );
                    })}
                  </div>
                ) : null}

                {itemsError ? <p className="text-sm text-destructive">{itemsError}</p> : null}

                {canManage ? (
                  itemRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma linha — adicione manualmente ou analise com IA.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="p-1 font-normal">Descrição</th>
                            <th className="p-1 font-normal">Qtd</th>
                            <th className="p-1 font-normal">Unidade</th>
                            <th className="p-1 font-normal">Preço Unitário</th>
                            <th className="p-1 font-normal">IVA %</th>
                            <th className="p-1 font-normal">Total</th>
                            <th className="p-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {itemRows.map((row, index) => (
                            <tr key={index}>
                              <td className="p-1">
                                <Input
                                  aria-label={`Descrição da linha ${index + 1}`}
                                  value={row.description}
                                  onChange={(event) => updateItemRow(index, { description: event.target.value })}
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  aria-label={`Quantidade da linha ${index + 1}`}
                                  type="number"
                                  value={row.quantity}
                                  onChange={(event) => updateItemRow(index, { quantity: event.target.value })}
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  aria-label={`Unidade da linha ${index + 1}`}
                                  value={row.unit}
                                  onChange={(event) => updateItemRow(index, { unit: event.target.value })}
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  aria-label={`Preço unitário da linha ${index + 1}`}
                                  type="number"
                                  value={row.unitPrice}
                                  onChange={(event) => updateItemRow(index, { unitPrice: event.target.value })}
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  aria-label={`IVA da linha ${index + 1}`}
                                  type="number"
                                  value={row.vatRate}
                                  onChange={(event) => updateItemRow(index, { vatRate: event.target.value })}
                                />
                              </td>
                              <td className="p-1">
                                <Input
                                  aria-label={`Total da linha ${index + 1}`}
                                  type="number"
                                  value={row.totalPrice}
                                  onChange={(event) => updateItemRow(index, { totalPrice: event.target.value })}
                                />
                              </td>
                              <td className="whitespace-nowrap p-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Mover linha ${index + 1} para cima`}
                                  onClick={() => moveItemRow(index, -1)}
                                  disabled={index === 0}
                                >
                                  ↑
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Mover linha ${index + 1} para baixo`}
                                  onClick={() => moveItemRow(index, 1)}
                                  disabled={index === itemRows.length - 1}
                                >
                                  ↓
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => removeItemRow(index)}
                                >
                                  Remover
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : draft.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem linhas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="p-1 font-normal">Descrição</th>
                          <th className="p-1 font-normal">Qtd</th>
                          <th className="p-1 font-normal">Unidade</th>
                          <th className="p-1 font-normal">Preço Unitário</th>
                          <th className="p-1 font-normal">IVA %</th>
                          <th className="p-1 font-normal">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.items.map((item) => (
                          <tr key={item.id}>
                            <td className="p-1">{item.description}</td>
                            <td className="p-1">{item.quantity ?? '—'}</td>
                            <td className="p-1">{item.unit ?? '—'}</td>
                            <td className="p-1">{item.unitPrice ? formatCurrency(item.unitPrice) : '—'}</td>
                            <td className="p-1">{item.vatRate ? `${item.vatRate}%` : '—'}</td>
                            <td className="p-1">{item.totalPrice ? formatCurrency(item.totalPrice) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {canManage ? (
            <SheetFooter className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!draft}
              >
                Eliminar rascunho
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!draft || !isDirty || saving}
              >
                {saving ? 'A guardar…' : 'Guardar alterações'}
              </Button>
              <Button
                onClick={() => setPromoteConfirmOpen(true)}
                disabled={!draft || !canPromote || isDirty || promoting}
              >
                Promover a fatura
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Eliminar rascunho"
        description="Tem a certeza que quer eliminar este rascunho? Esta ação não pode ser revertida."
        loading={deleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={promoteConfirmOpen}
        onOpenChange={setPromoteConfirmOpen}
        title="Promover a fatura"
        description="O rascunho será convertido numa fatura definitiva e eliminado de seguida. Esta ação não pode ser revertida."
        confirmLabel="Promover"
        loading={promoting}
        onConfirm={handlePromote}
      />
    </>
  );
}
