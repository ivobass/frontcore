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
import {
  createExpenseCategory,
  updateExpenseCategory,
} from '../../../lib/expense-categories';
import type {
  ExpenseCategory,
  ExpenseCategoryInput,
} from '../../../lib/expense-categories';

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  category: ExpenseCategory | null;
  onSuccess: () => void;
}

/** Formulário de criação/edição de categoria de despesa, em `Dialog` (`@frontcore/ui`). */
export function CategoryFormDialog({
  open,
  onOpenChange,
  accessToken,
  category,
  onSuccess,
}: CategoryFormDialogProps) {
  const [form, setForm] = useState<ExpenseCategoryInput>({ name: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(category);

  useEffect(() => {
    if (!open) return;
    setForm({ name: category?.name ?? '' });
    setError(null);
  }, [open, category]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit && category) {
        await updateExpenseCategory(accessToken, category.id, form);
      } else {
        await createExpenseCategory(accessToken, form);
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao guardar categoria.',
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
              {isEdit ? 'Editar categoria' : 'Nova categoria de despesa'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Atualize o nome da categoria.'
                : 'Preencha o nome da nova categoria de despesa.'}
            </DialogDescription>
          </DialogHeader>

          <FormField>
            <FieldLabel htmlFor="category-name" required>
              Nome
            </FieldLabel>
            <Input
              id="category-name"
              required
              value={form.name}
              onChange={(event) => setForm({ name: event.target.value })}
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
