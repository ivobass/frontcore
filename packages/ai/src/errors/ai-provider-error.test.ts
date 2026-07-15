import { describe, it, expect } from 'vitest';
import { AiProviderError } from './ai-provider-error';

describe('AiProviderError', () => {
  it('define name, code e mensagem', () => {
    const error = new AiProviderError('Modelo de IA não encontrado no provider local.', 'model_not_found');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AiProviderError');
    expect(error.code).toBe('model_not_found');
    expect(error.message).toBe('Modelo de IA não encontrado no provider local.');
  });

  it('preserva a causa original sem a incluir na mensagem', () => {
    const cause = new Error('detalhe interno sensível');
    const error = new AiProviderError('Falha ao comunicar com o provider de IA.', 'unknown', { cause });
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('sensível');
  });
});
