/** Ficheiro a processar — bytes já em memória, nunca um caminho de ficheiro. */
export interface OCRInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

/** Opções por chamada — sobrepõem a configuração por omissão do serviço/provider. */
export interface ExtractOptions {
  language?: string;
  timeoutMs?: number;
}
