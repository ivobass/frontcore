'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  UploadDropzone,
  UploadError,
} from '@frontcore/ui';
import { ApiError } from '../../../lib/api';
import { isSessionLifecycleError } from '../../../lib/auth';
import type { AuthFetch } from '../../../lib/auth';
import { createUpload, deleteUpload } from '../../../lib/uploads';
import { createInvoiceDraft } from '../../../lib/invoice-drafts';
import type { InvoiceDraft } from '../../../lib/invoice-drafts';

export interface CreateInvoiceDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamada autenticada centralizada (`useSession().authFetch`) — ver `invoice-draft-review-sheet.tsx` para o desenho completo. */
  authFetch: AuthFetch;
  onCreated: (draft: InvoiceDraft) => void;
  /** Chamado sempre que o estado real dos rascunhos pode ter mudado — mesmo em falha, para o utilizador ver o estado verdadeiro. */
  onChanged: () => void;
  notifyError: (message: string) => void;
}

/**
 * Estados HTTP em que `POST /invoices/drafts` garantidamente **não**
 * chegou a criar o rascunho — validação de `StorageObject`
 * (`assertStorageObjectAvailable`) falha e lança antes de qualquer
 * `prisma.invoiceDraft.create()` (`NotFoundException`/`ConflictException`,
 * Fase 6.3). Só nestes casos é seguro eliminar o `StorageObject` acabado
 * de criar.
 *
 * Fora desta lista — em particular `503` (Fase 6.4: o rascunho foi
 * criado, só a publicação do job OCR falhou) — o `StorageObject` já
 * pode estar associado a um `InvoiceDraft` real; eliminá-lo seria
 * incorreto (destruiria um rascunho válido) ou falharia por FK
 * (`onDelete: Restrict`). Nesses casos, e em qualquer erro de rede/
 * status desconhecido, o estado é tratado como ambíguo: não eliminar,
 * não repetir automaticamente, só informar e deixar a lista recarregar.
 */
const DRAFT_NOT_CREATED_STATUSES = new Set([400, 404, 409]);

export function CreateInvoiceDraftDialog({
  open,
  onOpenChange,
  authFetch,
  onCreated,
  onChanged,
  notifyError,
}: CreateInvoiceDraftDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const storageObject = await authFetch((token) => createUpload(token, file));
      try {
        const draft = await authFetch((token) => createInvoiceDraft(token, { storageObjectId: storageObject.id }));
        onOpenChange(false);
        onCreated(draft);
      } catch (err) {
        if (isSessionLifecycleError(err)) return;
        const message = err instanceof Error ? err.message : 'Erro ao criar rascunho.';
        const status = err instanceof ApiError ? err.status : undefined;

        if (status !== undefined && DRAFT_NOT_CREATED_STATUSES.has(status)) {
          // Inequivocamente seguro: o rascunho nunca chegou a existir.
          try {
            await authFetch((token) => deleteUpload(token, storageObject.id));
            notifyError(message);
          } catch (cleanupErr) {
            const cleanupMessage =
              cleanupErr instanceof Error ? cleanupErr.message : 'Erro ao limpar o upload.';
            notifyError(
              `${message} Além disso, falhou a limpeza do ficheiro carregado (${cleanupMessage}) — pode ter ficado um upload órfão.`,
            );
          }
        } else {
          // Estado ambíguo (503 — draft pode já existir sem job OCR — ou
          // erro de rede/desconhecido): nunca eliminar, nunca repetir
          // automaticamente. O utilizador vê o erro e a lista recarregada
          // mostra o estado real.
          notifyError(
            `${message} O ficheiro já foi carregado — verifique a lista antes de tentar novamente.`,
          );
        }
        onChanged();
      } finally {
        setUploading(false);
      }
    } catch (err) {
      if (isSessionLifecycleError(err)) {
        setUploading(false);
        return;
      }
      setUploadError(err instanceof Error ? err.message : 'Erro ao carregar o ficheiro.');
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo rascunho de fatura</DialogTitle>
          <DialogDescription>
            Carregue um documento (PDF ou imagem). O OCR e o parsing fiscal correm depois, na
            revisão do rascunho.
          </DialogDescription>
        </DialogHeader>

        <UploadDropzone
          accept="application/pdf,image/jpeg,image/png"
          disabled={uploading}
          label={uploading ? 'A processar…' : 'Clique ou arraste um ficheiro'}
          hint="PDF, JPEG ou PNG"
          onFileSelected={handleFileSelected}
        />
        {uploadError ? <UploadError>{uploadError}</UploadError> : null}
      </DialogContent>
    </Dialog>
  );
}
