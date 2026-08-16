'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  Spinner,
  EmptyState,
  UploadDropzone,
  UploadFileList,
  UploadError,
} from '@frontcore/ui';
import type { UploadFileListItem } from '@frontcore/ui';
import { useFeedback } from '../../../lib/use-feedback';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import {
  listInvoiceAttachments,
  uploadInvoiceAttachment,
  getInvoiceAttachment,
  deleteInvoiceAttachment,
} from '../../../lib/invoice-attachments';
import type { InvoiceAttachment } from '../../../lib/invoice-attachments';
import { isSessionLifecycleError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';

export interface InvoiceAttachmentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamada autenticada centralizada (`useSession().authFetch`) — ver `invoice-draft-review-sheet.tsx` para o desenho completo. */
  authFetch: AuthFetch;
  invoiceId: string | null;
  invoiceLabel?: string;
  canManage: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Painel de anexos de uma fatura, em `Sheet` (`@frontcore/ui`) — mesmo
 * padrão de `invoice-form-sheet.tsx`. Toda a chamada de rede vive em
 * `lib/invoice-attachments.ts`; os componentes de `@frontcore/ui`
 * (`UploadDropzone`/`UploadFileList`/`UploadError`) não sabem o que é
 * uma fatura ou um anexo.
 */
export function InvoiceAttachmentsPanel({
  open,
  onOpenChange,
  authFetch,
  invoiceId,
  invoiceLabel,
  canManage,
}: InvoiceAttachmentsPanelProps) {
  const { feedback, notifySuccess, notifyError } = useFeedback();
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InvoiceAttachment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(() => {
    if (!invoiceId) return;
    setLoading(true);
    authFetch((token) => listInvoiceAttachments(token, invoiceId))
      .then((items) => {
        setAttachments(items);
        setError(null);
      })
      .catch((err) => {
        if (isSessionLifecycleError(err)) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar anexos.');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  useEffect(() => {
    if (open && invoiceId) load();
    if (!open) {
      setUploadError(null);
      setDeleting(null);
    }
  }, [open, invoiceId, load]);

  async function handleFileSelected(file: File) {
    if (!invoiceId) return;
    setUploadError(null);
    setUploading(true);
    try {
      await authFetch((token) => uploadInvoiceAttachment(token, invoiceId, file));
      notifySuccess('Anexo carregado.');
      load();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      setUploadError(err instanceof Error ? err.message : 'Erro ao carregar anexo.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: InvoiceAttachment) {
    if (!invoiceId) return;
    setDownloadingId(attachment.id);
    try {
      const detail = await authFetch((token) => getInvoiceAttachment(token, invoiceId, attachment.id));
      window.open(detail.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      notifyError(err instanceof Error ? err.message : 'Erro ao obter o anexo.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting || !invoiceId) return;
    setDeleteLoading(true);
    try {
      await authFetch((token) => deleteInvoiceAttachment(token, invoiceId, deleting.id));
      notifySuccess('Anexo eliminado.');
      setDeleting(null);
      load();
    } catch (err) {
      if (isSessionLifecycleError(err)) return;
      notifyError(err instanceof Error ? err.message : 'Erro ao eliminar anexo.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const items: UploadFileListItem[] = attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.storageObject.filename,
    meta: `${formatFileSize(attachment.storageObject.size)} · ${new Date(
      attachment.createdAt,
    ).toLocaleDateString('pt-PT')}`,
    actions: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloadingId === attachment.id}
          onClick={() => handleDownload(attachment)}
        >
          {downloadingId === attachment.id ? 'A abrir…' : 'Descarregar'}
        </Button>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(attachment)}
          >
            Eliminar
          </Button>
        ) : null}
      </>
    ),
  }));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex max-w-lg flex-col gap-4" side="right">
          <SheetHeader>
            <SheetTitle>Anexos</SheetTitle>
            <SheetDescription>
              {invoiceLabel
                ? `Documentos anexados à fatura "${invoiceLabel}".`
                : 'Documentos anexados à fatura.'}
            </SheetDescription>
          </SheetHeader>

          <FeedbackBanner feedback={feedback} />

          {canManage ? (
            <div className="flex flex-col gap-2">
              <UploadDropzone
                accept="application/pdf,image/jpeg,image/png"
                disabled={uploading}
                label={uploading ? 'A enviar…' : 'Clique ou arraste um ficheiro'}
                hint="PDF, JPEG ou PNG, até 25 MB"
                onFileSelected={handleFileSelected}
              />
              {uploadError ? <UploadError>{uploadError}</UploadError> : null}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!loading && !error && attachments.length === 0 ? (
            <EmptyState
              title="Sem anexos"
              description="Esta fatura ainda não tem documentos anexados."
            />
          ) : null}

          {!loading && !error && attachments.length > 0 ? <UploadFileList items={items} /> : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleting(null);
        }}
        title="Eliminar anexo"
        description={`Tem a certeza que quer eliminar o anexo "${deleting?.storageObject.filename}"? Esta ação não pode ser revertida.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
