import { OCRTimeoutError } from '../errors';

/**
 * Rejeita com `OCRTimeoutError` se `promise` não resolver/rejeitar
 * dentro de `timeoutMs`. Não cancela o trabalho subjacente (o provider
 * continua a correr em segundo plano) — só deixa de esperar por ele.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OCRTimeoutError(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
