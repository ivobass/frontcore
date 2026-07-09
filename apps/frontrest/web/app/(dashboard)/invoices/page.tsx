'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, EmptyState, Spinner, Button, Badge } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { canManage } from '../../../lib/roles';
import { useFeedback } from '../../../lib/use-feedback';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import { PaginationControls } from '../../../components/pagination-controls';
import { listSuppliers } from '../../../lib/suppliers';
import type { Supplier } from '../../../lib/suppliers';
import { listExpenseCategories } from '../../../lib/expense-categories';
import type { ExpenseCategory } from '../../../lib/expense-categories';
import { listInvoices, deleteInvoice } from '../../../lib/invoices';
import type { Invoice, InvoiceStatus, Paginated } from '../../../lib/invoices';
import { InvoiceFormSheet } from './invoice-form-sheet';
import { InvoiceAttachmentsPanel } from './invoice-attachments-panel';
import { STATUS_LABELS, selectClassName } from './constants';

const PAGE_SIZE = 20;
/** Teto de `pageSize` aceite pela API (`MAX_PAGE_SIZE` em `packages/shared`) — usado para preencher os selects de filtro/formulário sem paginar. */
const PICKER_PAGE_SIZE = 100;

const STATUS_BADGE_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  PAID: 'success',
  OVERDUE: 'destructive',
  CANCELLED: 'outline',
};

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT');
}

export default function InvoicesPage() {
  const { session, me } = useSession();
  const manage = canManage(me.role);
  const { feedback, notifySuccess, notifyError } = useFeedback();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [result, setResult] = useState<Paginated<Invoice> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [supplierFilter, setSupplierFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [attachmentsFor, setAttachmentsFor] = useState<Invoice | null>(null);

  useEffect(() => {
    listSuppliers(session.accessToken, { pageSize: PICKER_PAGE_SIZE })
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
    listExpenseCategories(session.accessToken)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [session.accessToken]);

  const load = useCallback(() => {
    listInvoices(session.accessToken, {
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter || undefined,
      supplierId: supplierFilter || undefined,
    })
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar faturas.'),
      );
  }, [session.accessToken, page, statusFilter, supplierFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(invoice: Invoice) {
    setEditing(invoice);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteInvoice(session.accessToken, deleting.id);
      notifySuccess('Fatura eliminada.');
      setDeleting(null);
      load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Erro ao eliminar fatura.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const invoices = result?.items ?? null;
  const canCreate = manage && suppliers.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Faturas"
        description="Faturas de despesa registadas na organização."
        actions={
          manage ? (
            <Button onClick={openCreate} disabled={!canCreate}>
              Nova fatura
            </Button>
          ) : null
        }
      />

      <FeedbackBanner feedback={feedback} />

      {manage && suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Registe pelo menos um fornecedor antes de criar faturas.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <select
          className={selectClassName}
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value as InvoiceStatus | '');
          }}
        >
          <option value="">Todos os estados</option>
          {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <select
          className={selectClassName}
          value={supplierFilter}
          onChange={(event) => {
            setPage(1);
            setSupplierFilter(event.target.value);
          }}
        >
          <option value="">Todos os fornecedores</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!result && !error ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {invoices && invoices.length === 0 ? (
        <EmptyState
          title="Sem faturas"
          description="Ainda não existem faturas registadas com estes filtros."
          action={canCreate ? <Button onClick={openCreate}>Nova fatura</Button> : undefined}
        />
      ) : null}

      {invoices && invoices.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">Número</th>
                  <th className="px-4 py-3 text-start">Fornecedor</th>
                  <th className="px-4 py-3 text-start">Categoria</th>
                  <th className="px-4 py-3 text-start">Emissão</th>
                  <th className="px-4 py-3 text-start">Vencimento</th>
                  <th className="px-4 py-3 text-end">Total</th>
                  <th className="px-4 py-3 text-start">Estado</th>
                  <th className="px-4 py-3 text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border">
                    <td className="px-4 py-3">{invoice.number ?? '—'}</td>
                    <td className="px-4 py-3">{invoice.supplier.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {invoice.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(invoice.issueDate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-end">{formatCurrency(invoice.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>
                        {STATUS_LABELS[invoice.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setAttachmentsFor(invoice)}>
                          Anexos
                        </Button>
                        {manage ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(invoice)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(invoice)}
                            >
                              Eliminar
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
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
              itemLabel="faturas"
              onPrevious={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </>
      ) : null}

      <InvoiceFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        accessToken={session.accessToken}
        invoice={editing}
        suppliers={suppliers}
        categories={categories}
        onSuccess={() => {
          notifySuccess(editing ? 'Fatura atualizada.' : 'Fatura criada.');
          load();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Eliminar fatura"
        description={`Tem a certeza que quer eliminar a fatura "${deleting?.number ?? deleting?.id}"? Esta ação não pode ser revertida.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />

      <InvoiceAttachmentsPanel
        open={Boolean(attachmentsFor)}
        onOpenChange={(open) => {
          if (!open) setAttachmentsFor(null);
        }}
        accessToken={session.accessToken}
        invoiceId={attachmentsFor?.id ?? null}
        invoiceLabel={attachmentsFor?.number ?? attachmentsFor?.id}
        canManage={manage}
      />
    </div>
  );
}
