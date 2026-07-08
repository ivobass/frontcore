'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  FormField,
  FieldLabel,
  FieldError,
} from '@frontcore/ui';
import { createSupplier, updateSupplier } from '../../../lib/suppliers';
import type { Supplier, SupplierInput } from '../../../lib/suppliers';

export interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  supplier: Supplier | null;
  onSuccess: () => void;
}

const EMPTY_FORM: SupplierInput = { name: '', taxId: '', email: '', phone: '' };

/** Formulário de criação/edição de fornecedor, em `Dialog` (`@frontcore/ui`). */
export function SupplierFormDialog({
  open,
  onOpenChange,
  accessToken,
  supplier,
  onSuccess,
}: SupplierFormDialogProps) {
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(supplier);

  useEffect(() => {
    if (!open) return;
    setForm(
      supplier
        ? {
            name: supplier.name,
            taxId: supplier.taxId ?? '',
            email: supplier.email ?? '',
            phone: supplier.phone ?? '',
          }
        : EMPTY_FORM,
    );
    setError(null);
  }, [open, supplier]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: SupplierInput = {
        name: form.name,
        taxId: form.taxId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      };
      if (isEdit && supplier) {
        await updateSupplier(accessToken, supplier.id, payload);
      } else {
        await createSupplier(accessToken, payload);
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao guardar fornecedor.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Editar fornecedor' : 'Novo fornecedor'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Atualize os dados do fornecedor.'
                : 'Preencha os dados do novo fornecedor.'}
            </DialogDescription>
          </DialogHeader>

          <FormField>
            <FieldLabel htmlFor="supplier-name" required>
              Nome
            </FieldLabel>
            <Input
              id="supplier-name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>

          <FormField>
            <FieldLabel htmlFor="supplier-taxId">NIF</FieldLabel>
            <Input
              id="supplier-taxId"
              value={form.taxId ?? ''}
              onChange={(event) => setForm({ ...form, taxId: event.target.value })}
            />
          </FormField>

          <FormField>
            <FieldLabel htmlFor="supplier-email">Email</FieldLabel>
            <Input
              id="supplier-email"
              type="email"
              value={form.email ?? ''}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>

          <FormField>
            <FieldLabel htmlFor="supplier-phone">Telefone</FieldLabel>
            <Input
              id="supplier-phone"
              value={form.phone ?? ''}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </FormField>

          {error ? <FieldError>{error}</FieldError> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
