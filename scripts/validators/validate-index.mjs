import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Responsabilidade única: confirmar que o ponto de entrada da
 * documentação técnica (`docs/INDEX.md`) existe e não está vazio —
 * nunca valida o conteúdo interno do índice (isso é
 * `validate-phases.mjs`/`validate-phase-files.mjs`/`validate-links.mjs`).
 */
export function validateIndex(repoRoot) {
  const errors = [];
  const indexPath = join(repoRoot, 'docs', 'INDEX.md');

  if (!existsSync(indexPath)) {
    errors.push('docs/INDEX.md não existe.');
    return { name: 'validate-index', ok: false, errors };
  }

  const content = readFileSync(indexPath, 'utf8');
  if (content.trim().length === 0) {
    errors.push('docs/INDEX.md existe mas está vazio.');
  }

  return { name: 'validate-index', ok: errors.length === 0, errors };
}
