import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/** Gera o hash de uma password em texto simples. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verifica uma password em texto simples contra um hash guardado. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
