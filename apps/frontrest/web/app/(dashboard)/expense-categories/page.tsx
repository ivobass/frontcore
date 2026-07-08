'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, EmptyState, Spinner, Button } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { canManage } from '../../../lib/roles';
import { useFeedback } from '../../../lib/use-feedback';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import {
  listExpenseCategories,
  deleteExpenseCategory,
} from '../../../lib/expense-categories';
import type { ExpenseCategory } from '../../../lib/expense-categories';
import { CategoryFormDialog } from './category-form-dialog';

export default function ExpenseCategoriesPage() {
  const { session, me } = useSession();
  const manage = canManage(me.role);
  const { feedback, notifySuccess, notifyError } = useFeedback();

  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(() => {
    listExpenseCategories(session.accessToken)
      .then((result) => {
        setCategories(result);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar categorias.',
        ),
      );
  }, [session.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: ExpenseCategory) {
    setEditing(category);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteExpenseCategory(session.accessToken, deleting.id);
      notifySuccess('Categoria eliminada.');
      setDeleting(null);
      load();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : 'Erro ao eliminar categoria.',
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias de despesa"
        description="Categorias usadas para classificar faturas."
        actions={
          manage ? <Button onClick={openCreate}>Nova categoria</Button> : null
        }
      />

      <FeedbackBanner feedback={feedback} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!categories && !error ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {categories && categories.length === 0 ? (
        <EmptyState
          title="Sem categorias"
          description="Ainda não existem categorias de despesa registadas nesta organização."
          action={
            manage ? <Button onClick={openCreate}>Nova categoria</Button> : undefined
          }
        />
      ) : null}

      {categories && categories.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">Nome</th>
                {manage ? <th className="px-4 py-3 text-end">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-border">
                  <td className="px-4 py-3">{category.name}</td>
                  {manage ? (
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(category)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(category)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        accessToken={session.accessToken}
        category={editing}
        onSuccess={() => {
          notifySuccess(editing ? 'Categoria atualizada.' : 'Categoria criada.');
          load();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Eliminar categoria"
        description={`Tem a certeza que quer eliminar "${deleting?.name}"? Esta ação não pode ser revertida.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
