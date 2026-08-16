'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { cn } from '@frontcore/ui';
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
  FieldError,
} from '@frontcore/ui';
import { createInvoice, updateInvoice } from '../../../lib/invoices';
import type { Invoice, InvoiceInput, InvoiceStatus } from '../../../lib/invoices';
import { isSessionLifecycleError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';
import type { Supplier } from '../../../lib/suppliers';
import type { ExpenseCategory } from '../../../lib/expense-categories';
import { STATUS_LABELS, fullWidthSelectClassName } from './constants';

export interface InvoiceFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamada autenticada centralizada (`useSession().authFetch`) — ver `invoice-draft-review-sheet.tsx` para o desenho completo. */
  authFetch: AuthFetch;
  invoice: Invoice | null;
  suppliers: Supplier[];
  categories: ExpenseCategory[];
  onSuccess: () => void;
}

interface ItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemRow = { description: '', quantity: '1', unitPrice: '' };

interface FormState {
  supplierId: string;
  categoryId: string;
  number: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
}

function emptyForm(suppliers: Supplier[]): FormState {
  return {
    supplierId: suppliers[0]?.id ?? '',
    categoryId: '',
    number: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    status: 'PENDING',
    notes: '',
  };
}

/** Formulário de criação/edição de fatura, em `Sheet` (`@frontcore/ui`) — mais espaço para os items. */
export function InvoiceFormSheet({
  open,
  onOpenChange,
  authFetch,
  invoice,
  suppliers,
  categories,
  onSuccess,
}: InvoiceFormSheetProps) {
  const [form, setForm] = useState<FormState>(() => emptyForm(suppliers));
  const [items, setItems] = useState<ItemRow[]>([EMPTY_ITEM]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(invoice);

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setForm({
        supplierId: invoice.supplierId,
        categoryId: invoice.categoryId ?? '',
        number: invoice.number ?? '',
        issueDate: invoice.issueDate.slice(0, 10),
        dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
        status: invoice.status,
        notes: invoice.notes ?? '',
      });
      setItems(
        invoice.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );
    } else {
      setForm(emptyForm(suppliers));
      setItems([EMPTY_ITEM]);
    }
    setError(null);
  }, [open, invoice, suppliers]);

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addItem() {
    setItems((current) => [...current, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  const previewTotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || '0');
    const unitPrice = Number(item.unitPrice || '0');
    return sum + quantity * unitPrice;
  }, 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.supplierId) {
      setError('Selecione um fornecedor.');
      return;
    }
    if (items.length === 0 || items.some((item) => !item.description || !item.unitPrice)) {
      setError('Cada linha da fatura precisa de descrição e preço unitário.');
      return;
    }

    setSaving(true);
    try {
      const payload: InvoiceInput = {
        supplierId: form.supplierId,
        categoryId: form.categoryId || undefined,
        number: form.number || undefined,
        issueDate: form.issueDate,
        dueDate: form.dueDate || undefined,
        status: form.status,
        notes: form.notes || undefined,
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity ? Number(item.quantity) : undefined,
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (isEdit && invoice) {
        await authFetch((token) => updateInvoice(token, invoice.id, payload));
      } else {
        await authFetch((token) => createInvoice(token, payload));
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setError(err instanceof Error ? err.message : 'Erro ao guardar fatura.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex max-w-xl flex-col" side="right">
        <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isEdit ? 'Editar fatura' : 'Nova fatura'}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? 'Atualize os dados da fatura e as respetivas linhas.'
                : 'Preencha os dados da fatura e adicione pelo menos uma linha.'}
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-2 gap-4">
            <FormField>
              <FieldLabel htmlFor="invoice-supplier" required>
                Fornecedor
              </FieldLabel>
              <select
                id="invoice-supplier"
                required
                className={fullWidthSelectClassName}
                value={form.supplierId}
                onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField>
              <FieldLabel htmlFor="invoice-category">Categoria</FieldLabel>
              <select
                id="invoice-category"
                className={fullWidthSelectClassName}
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
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
              <FieldLabel htmlFor="invoice-number">Número</FieldLabel>
              <Input
                id="invoice-number"
                value={form.number}
                onChange={(event) => setForm({ ...form, number: event.target.value })}
              />
            </FormField>

            <FormField>
              <FieldLabel htmlFor="invoice-status">Estado</FieldLabel>
              <select
                id="invoice-status"
                className={fullWidthSelectClassName}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as InvoiceStatus })
                }
              >
                {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField>
              <FieldLabel htmlFor="invoice-issueDate" required>
                Data de emissão
              </FieldLabel>
              <Input
                id="invoice-issueDate"
                type="date"
                required
                value={form.issueDate}
                onChange={(event) => setForm({ ...form, issueDate: event.target.value })}
              />
            </FormField>

            <FormField>
              <FieldLabel htmlFor="invoice-dueDate">Data de vencimento</FieldLabel>
              <Input
                id="invoice-dueDate"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </FormField>
          </div>

          <FormField>
            <FieldLabel htmlFor="invoice-notes">Notas</FieldLabel>
            <Textarea
              id="invoice-notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </FormField>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <FieldLabel required>Linhas</FieldLabel>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                Adicionar linha
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2 rounded-md border border-border p-3"
                >
                  <FormField>
                    <FieldLabel htmlFor={`item-description-${index}`}>Descrição</FieldLabel>
                    <Input
                      id={`item-description-${index}`}
                      required
                      value={item.description}
                      onChange={(event) => updateItem(index, 'description', event.target.value)}
                    />
                  </FormField>
                  <FormField>
                    <FieldLabel htmlFor={`item-quantity-${index}`}>Qtd.</FieldLabel>
                    <Input
                      id={`item-quantity-${index}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                    />
                  </FormField>
                  <FormField>
                    <FieldLabel htmlFor={`item-unitPrice-${index}`}>Preço un.</FieldLabel>
                    <Input
                      id={`item-unitPrice-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={item.unitPrice}
                      onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={items.length <= 1}
                    onClick={() => removeItem(index)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>

            <p className={cn('text-end text-sm text-muted-foreground')}>
              Total estimado:{' '}
              {previewTotal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>

          {error ? <FieldError>{error}</FieldError> : null}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
