import { API_URL, authHeaders, parseJsonOrThrow } from './api';

/** Metadados do `StorageObject` associado a um anexo — espelha a seleção devolvida pela API. */
export interface StorageObjectRef {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface InvoiceAttachment {
  id: string;
  invoiceId: string;
  storageObjectId: string;
  createdAt: string;
  storageObject: StorageObjectRef;
}

/** Resposta de `GET .../attachments/:id` — inclui `downloadUrl`, gerado on-demand pela API. */
export interface InvoiceAttachmentDetail {
  id: string;
  storageObjectId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
}

export async function listInvoiceAttachments(
  accessToken: string,
  invoiceId: string,
): Promise<InvoiceAttachment[]> {
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/attachments`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function getInvoiceAttachment(
  accessToken: string,
  invoiceId: string,
  attachmentId: string,
): Promise<InvoiceAttachmentDetail> {
  const response = await fetch(
    `${API_URL}/invoices/${invoiceId}/attachments/${attachmentId}`,
    { headers: authHeaders(accessToken) },
  );
  return parseJsonOrThrow(response);
}

/** Upload via `multipart/form-data` — não definir `Content-Type` manualmente, o browser gera o boundary. */
export async function uploadInvoiceAttachment(
  accessToken: string,
  invoiceId: string,
  file: File,
): Promise<InvoiceAttachment> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${API_URL}/invoices/${invoiceId}/attachments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body,
  });
  return parseJsonOrThrow(response);
}

export async function deleteInvoiceAttachment(
  accessToken: string,
  invoiceId: string,
  attachmentId: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/invoices/${invoiceId}/attachments/${attachmentId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) },
  );
  await parseJsonOrThrow(response);
}
