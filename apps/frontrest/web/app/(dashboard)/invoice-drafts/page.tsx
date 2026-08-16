'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState, Spinner, Button, Badge } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { canManage } from '../../../lib/roles';
import { useFeedback } from '../../../lib/use-feedback';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { PaginationControls } from '../../../components/pagination-controls';
import { listInvoiceDrafts } from '../../../lib/invoice-drafts';
import type { InvoiceDraft, Paginated } from '../../../lib/invoice-drafts';
import { isSessionLifecycleError } from '../../../lib/auth';
import { formatCurrency, formatDate } from '../../../lib/format';
import { CreateInvoiceDraftDialog } from './create-invoice-draft-dialog';
import { InvoiceDraftReviewSheet } from './invoice-draft-review-sheet';
import { OCR_STATUS_BADGE_VARIANT, OCR_STATUS_LABELS } from './constants';

const PAGE_SIZE = 20;

export default function InvoiceDraftsPage() {
  const { me, authFetch } = useSession();
  const manage = canManage(me.role);
  const { feedback, notifySuccess, notifyError } = useFeedback();

  const [result, setResult] = useState<Paginated<InvoiceDraft> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(() => {
    authFetch((token) => listInvoiceDrafts(token, { page, pageSize: PAGE_SIZE }))
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => {
        if (isSessionLifecycleError(err)) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar rascunhos.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const drafts = result?.items ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rascunhos de Fatura"
        description="Documentos carregados por upload, a aguardar OCR, revisão ou promoção a fatura."
        actions={
          manage ? <Button onClick={() => setCreateOpen(true)}>Novo rascunho</Button> : null
        }
      />

      <FeedbackBanner feedback={feedback} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!result && !error ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {drafts && drafts.length === 0 ? (
        <EmptyState
          title="Sem rascunhos"
          description="Ainda não existem rascunhos de fatura carregados."
          action={manage ? <Button onClick={() => setCreateOpen(true)}>Novo rascunho</Button> : undefined}
        />
      ) : null}

      {drafts && drafts.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">Ficheiro</th>
                  <th className="px-4 py-3 text-start">Fornecedor</th>
                  <th className="px-4 py-3 text-start">Número</th>
                  <th className="px-4 py-3 text-start">Emissão</th>
                  <th className="px-4 py-3 text-end">Total</th>
                  <th className="px-4 py-3 text-start">OCR</th>
                  <th className="px-4 py-3 text-end">Confiança</th>
                  <th className="px-4 py-3 text-start">Criado em</th>
                  <th className="px-4 py-3 text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id} className="border-t border-border">
                    <td className="px-4 py-3">{draft.storageObject.filename}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {draft.supplier?.name ?? 'Por atribuir'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{draft.number ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(draft.issueDate)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {draft.totalAmount ? formatCurrency(draft.totalAmount) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={OCR_STATUS_BADGE_VARIANT[draft.ocrStatus]}>
                        {OCR_STATUS_LABELS[draft.ocrStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end text-muted-foreground">
                      {draft.ocrConfidence !== null ? `${Math.round(draft.ocrConfidence)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(draft.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setReviewingId(draft.id)}>
                          Rever
                        </Button>
                        <Link href={`/invoice-drafts/debug?id=${draft.id}`}>
                          <Button variant="ghost" size="sm">
                            Diagnóstico
                          </Button>
                        </Link>
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
              itemLabel="rascunhos"
              onPrevious={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          ) : null}
        </>
      ) : null}

      <CreateInvoiceDraftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        authFetch={authFetch}
        onCreated={(draft) => {
          setReviewingId(draft.id);
          load();
        }}
        onChanged={load}
        notifyError={notifyError}
      />

      <InvoiceDraftReviewSheet
        open={Boolean(reviewingId)}
        onOpenChange={(open) => {
          if (!open) setReviewingId(null);
        }}
        draftId={reviewingId}
        authFetch={authFetch}
        canManage={manage}
        onSaved={() => {
          notifySuccess('Rascunho atualizado.');
          load();
        }}
        onDeleted={() => {
          notifySuccess('Rascunho eliminado.');
          setReviewingId(null);
          load();
        }}
        onPromoted={() => {
          notifySuccess('Rascunho promovido a fatura.');
          setReviewingId(null);
          load();
        }}
      />
    </div>
  );
}
