'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, EmptyState, Spinner, Button, Input } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { canManage } from '../../../lib/roles';
import { useFeedback } from '../../../lib/use-feedback';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import { PaginationControls } from '../../../components/pagination-controls';
import { listSuppliers, deleteSupplier } from '../../../lib/suppliers';
import type { Supplier, Paginated } from '../../../lib/suppliers';
import { SupplierFormDialog } from './supplier-form-dialog';

const PAGE_SIZE = 20;

export default function SuppliersPage() {
  const { session, me } = useSession();
  const manage = canManage(me.role);
  const { feedback, notifySuccess, notifyError } = useFeedback();

  const [result, setResult] = useState<Paginated<Supplier> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(() => {
    listSuppliers(session.accessToken, {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
    })
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar fornecedores.',
        ),
      );
  }, [session.accessToken, page, search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteSupplier(session.accessToken, deleting.id);
      notifySuccess('Fornecedor eliminado.');
      setDeleting(null);
      load();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : 'Erro ao eliminar fornecedor.',
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  const suppliers = result?.items ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fornecedores"
        description="Fornecedores registados na organização."
        actions={
          manage ? <Button onClick={openCreate}>Novo fornecedor</Button> : null
        }
      />

      <FeedbackBanner feedback={feedback} />

      <Input
        placeholder="Pesquisar por nome…"
        value={search}
        onChange={(event) => {
          setPage(1);
          setSearch(event.target.value);
        }}
        className="max-w-sm"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!result && !error ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {suppliers && suppliers.length === 0 ? (
        <EmptyState
          title="Sem fornecedores"
          description="Ainda não existem fornecedores registados nesta organização."
          action={
            manage ? <Button onClick={openCreate}>Novo fornecedor</Button> : undefined
          }
        />
      ) : null}

      {suppliers && suppliers.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">Nome</th>
                  <th className="px-4 py-3 text-start">NIF</th>
                  <th className="px-4 py-3 text-start">Email</th>
                  <th className="px-4 py-3 text-start">Telefone</th>
                  {manage ? <th className="px-4 py-3 text-end">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-border">
                    <td className="px-4 py-3">{supplier.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.taxId ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.phone ?? '—'}
                    </td>
                    {manage ? (
                      <td className="px-4 py-3 text-end">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(supplier)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(supplier)}
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

          {result ? (
            <PaginationControls
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              itemLabel="fornecedores"
              onPrevious={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </>
      ) : null}

      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        accessToken={session.accessToken}
        supplier={editing}
        onSuccess={() => {
          notifySuccess(editing ? 'Fornecedor atualizado.' : 'Fornecedor criado.');
          load();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Eliminar fornecedor"
        description={`Tem a certeza que quer eliminar "${deleting?.name}"? Esta ação não pode ser revertida.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
