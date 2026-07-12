import { API_URL, authHeaders, parseJsonOrThrow } from './api';

/**
 * Cliente mínimo dos endpoints genéricos de upload — só o necessário para
 * o fluxo "enviar ficheiro → obter StorageObject → criar InvoiceDraft"
 * (Fase 6.8). Sem SDK/repository genérico: espelha exatamente
 * `lib/invoice-attachments.ts` (upload via `FormData`, sem `Content-Type`
 * manual). Sem `GET /uploads/:id` — este fluxo nunca precisa de reler um
 * `StorageObject`, só de o criar e, em caso de falha comprovadamente
 * segura, o eliminar.
 */
export interface StorageObject {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export async function createUpload(
  accessToken: string,
  file: File,
): Promise<StorageObject> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body,
  });
  return parseJsonOrThrow(response);
}

export async function deleteUpload(
  accessToken: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/uploads/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await parseJsonOrThrow(response);
}
