/**
 * @frontcore/config
 * Configuração genérica partilhada entre produtos FrontCore.
 * NÃO contém lógica de domínio.
 */

/** Ambientes de execução suportados. */
export type AppEnv = 'development' | 'test' | 'production';

/** Lê NODE_ENV de forma segura, com fallback para development. */
export function getAppEnv(): AppEnv {
  const env = process.env.NODE_ENV;
  if (env === 'production' || env === 'test') return env;
  return 'development';
}

export const isProduction = (): boolean => getAppEnv() === 'production';

/** Lê uma variável de ambiente obrigatória; lança se ausente. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Variável de ambiente obrigatória em falta: ${name}`);
  }
  return value;
}

/** Lê uma variável de ambiente opcional com valor por defeito. */
export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** Converte uma lista separada por vírgulas num array limpo. */
export function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
