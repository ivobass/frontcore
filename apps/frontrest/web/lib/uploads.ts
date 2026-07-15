import { API_URL, authHeaders, parseJsonOrThrow } from './api';

/**
 * Cliente mínimo dos endpoints genéricos de upload — só o necessário para
 * o fluxo "enviar ficheiro → obter StorageObject → criar InvoiceDraft"
 * (Fase 6.8), mais `getUpload()` (Fase 6.8+, ferramenta de diagnóstico
 * do pipeline OCR — precisa de reler o `StorageObject` original para
 * mostrar o documento fonte lado a lado com o texto OCR/campos
 * extraídos). Sem SDK/repository genérico: espelha exatamente
 * `lib/invoice-attachments.ts` (upload via `FormData`, sem `Content-Type`
 * manual).
 */
export interface StorageObject {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface StorageObjectWithDownloadUrl extends StorageObject {
  downloadUrl: string;
}

export async function getUpload(
  accessToken: string,
  id: string,
): Promise<StorageObjectWithDownloadUrl> {
  const response = await fetch(`${API_URL}/uploads/${id}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
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
