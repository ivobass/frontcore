import { describe, it, expect } from 'vitest';
import { assertValidKey } from './assert-valid-key';
import { StorageError } from '../errors';

describe('assertValidKey', () => {
  it('aceita uma key válida', () => {
    expect(() => assertValidKey('org-1/invoices/file.pdf')).not.toThrow();
  });

  it('rejeita key vazia', () => {
    expect(() => assertValidKey('')).toThrow(StorageError);
  });

  it('rejeita key só com espaços', () => {
    expect(() => assertValidKey('   ')).toThrow(StorageError);
  });

  it('rejeita key com barra inicial', () => {
    expect(() => assertValidKey('/org-1/file.pdf')).toThrow(StorageError);
  });
});
