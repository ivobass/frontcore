import { optionalEnv } from '@frontcore/config';

/** MIME types permitidos — restrito de propósito, para expandir só com necessidade real. */
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Tamanho máximo por ficheiro, em bytes — 10 MB por omissão, configurável via ambiente. */
export const MAX_FILE_SIZE_BYTES = Number(
  optionalEnv('UPLOAD_MAX_SIZE_BYTES', String(10 * 1024 * 1024)),
);

/** Tempo de vida do URL de download assinado, em segundos. */
export const DOWNLOAD_URL_TTL_SECONDS = 300;
