import { StorageError } from '../errors';

/**
 * Valida a forma mínima de uma key de objeto — genérico, sem
 * conhecimento de nenhum provider concreto (reutilizável por qualquer
 * implementação futura de `ObjectStorage`, não só S3).
 */
export function assertValidKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new StorageError('A key do objeto não pode ser vazia.');
  }
  if (key.startsWith('/')) {
    throw new StorageError('A key do objeto não pode começar com "/".');
  }
}
