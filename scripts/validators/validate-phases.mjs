import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Responsabilidade única: confirmar que o plano de fases do produto
 * (`docs/PHASES.md`) existe e não está vazio — nunca valida se os
 * documentos de fase que referencia existem (isso é
 * `validate-phase-files.mjs`, que consome este mesmo ficheiro com outro
 * objetivo).
 */
export function validatePhases(repoRoot) {
  const errors = [];
  const phasesPath = join(repoRoot, 'docs', 'PHASES.md');

  if (!existsSync(phasesPath)) {
    errors.push('docs/PHASES.md não existe.');
    return { name: 'validate-phases', ok: false, errors };
  }

  const content = readFileSync(phasesPath, 'utf8');
  if (content.trim().length === 0) {
    errors.push('docs/PHASES.md existe mas está vazio.');
  }

  return { name: 'validate-phases', ok: errors.length === 0, errors };
}
