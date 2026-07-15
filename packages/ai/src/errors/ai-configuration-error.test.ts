import { describe, it, expect } from 'vitest';
import { AiConfigurationError } from './ai-configuration-error';

describe('AiConfigurationError', () => {
  it('define name e preserva a mensagem', () => {
    const error = new AiConfigurationError('AI_MODEL em falta.');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AiConfigurationError');
    expect(error.message).toBe('AI_MODEL em falta.');
  });
});
