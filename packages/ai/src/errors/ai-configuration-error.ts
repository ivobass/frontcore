/** Configuração de IA inválida ou em falta — detetado no arranque (`loadAiConfig()`), antes de qualquer chamada ao provider. */
export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigurationError';
  }
}
