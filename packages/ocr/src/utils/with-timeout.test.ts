import { describe, it, expect, vi } from 'vitest';
import { OCRTimeoutError } from '../errors';
import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('resolve com o valor quando a promise termina antes do limite', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 100, 'excedeu');
    expect(result).toBe('ok');
  });

  it('rejeita com o erro original quando a promise falha antes do limite', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100, 'excedeu')).rejects.toThrow(
      'boom',
    );
  });

  it('rejeita com OCRTimeoutError quando o limite é excedido', async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise(() => {});

    const promise = withTimeout(neverResolves, 50, 'excedeu o limite');
    const assertion = expect(promise).rejects.toThrow(OCRTimeoutError);

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });
});
