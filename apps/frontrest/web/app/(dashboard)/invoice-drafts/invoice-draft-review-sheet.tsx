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
  updateInvoiceDraft,
  deleteInvoiceDraft,
  promoteInvoiceDraft,
  getInvoiceDraftFiscalSuggestions,
} from '../../../lib/invoice-drafts';
import type { InvoiceDraft, DraftFiscalSuggestions, UpdateInvoiceDraftInput } from '../../../lib/invoice-drafts';
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
  accessToken: string;
  canManage: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onPromoted: () => void;
}

export function InvoiceDraftReviewSheet({
  open,
  onOpenChange,
  draftId,
  accessToken,
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

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [suggestions, setSuggestions] = useState<DraftFiscalSuggestions | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);

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
    setSaveError(null);
    setPromoteError(null);
    getInvoiceDraft(accessToken, draftId)
      .then((next) => {
        applyDraft(next);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rascunho.');
        setLoading(false);
      });
  }, [open, draftId, accessToken, applyDraft]);

  // Listas para os selects — só quando MANAGER+ (MEMBER nunca edita).
  useEffect(() => {
    if (!open || !canManage) return;
    listSuppliers(accessToken, { pageSize: PICKER_PAGE_SIZE })
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
    listExpenseCategories(accessToken)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open, canManage, accessToken]);

  // Polling do estado OCR — só enquanto PENDING/PROCESSING, cancelado ao
  // fechar, desmontar, ou assim que chega a COMPLETED/FAILED.
  useEffect(() => {
    if (!open || !draftId || !draft) return;
    if (draft.ocrStatus !== 'PENDING' && draft.ocrStatus !== 'PROCESSING') return;

    let cancelled = false;
    const timer = setInterval(() => {
      getInvoiceDraft(accessToken, draftId)
        .then((next) => {
          if (cancelled) return;
          setDraft(next);
          // Só o snapshot de estado OCR muda por polling — o formulário
          // do utilizador (formValues) nunca é tocado aqui, mesmo que
          // outros campos do draft tenham mudado entretanto.
          setSavedValues(draftToFormValues(next));
        })
        .catch(() => {
          /* falha pontual de polling não interrompe o ciclo — tenta na próxima iteração */
        });
    }, OCR_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, draftId, draft, accessToken]);

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
    getInvoiceDraftFiscalSuggestions(accessToken, draftId)
      .then((result) => {
        setSuggestions(result);
        setParsingLoading(false);
      })
      .catch((err) => {
        setParsingError(err instanceof Error ? err.message : 'Erro ao obter sugestões fiscais.');
        setParsingLoading(false);
      });
  }, [draftId, draft, accessToken, suggestions, parsingLoading]);

  function applySuggestions() {
    if (!suggestions) return;
    setFormValues((prev) => ({
      ...prev,
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

  async function handleSave() {
    if (!draftId) return;
    const patch = buildPatch(formValues, savedValues);
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateInvoiceDraft(accessToken, draftId, patch);
      applyDraft(updated);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao guardar alterações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draftId) return;
    setDeleting(true);
    try {
      await deleteInvoiceDraft(accessToken, draftId);
      setDeleteConfirmOpen(false);
      onDeleted();
    } catch (err) {
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
      await promoteInvoiceDraft(accessToken, draftId);
      setPromoteConfirmOpen(false);
      onPromoted();
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Erro ao promover rascunho.');
    } finally {
      setPromoting(false);
    }
  }

  const isDirty = Object.keys(buildPatch(formValues, savedValues)).length > 0;
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
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, supplierId: event.target.value }))
                      }
                    >
                      <option value="">Por atribuir</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
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
                    <FieldLabel>Data de vencimento</FieldLabel>
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
