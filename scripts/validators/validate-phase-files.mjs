import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE_DOC_REFERENCE_PATTERN = /`(docs\/phases\/[^`]+\.md)`/g;

/**
 * Responsabilidade única: confirmar que todo o documento de fase
 * referenciado por `docs/PHASES.md` (ex. `` `docs/phases/phase-8.7-...md` ``)
 * existe de facto em `docs/phases/` — nunca valida o próprio
 * `docs/PHASES.md` (isso é `validate-phases.mjs`) nem referências fora
 * dele (isso é `validate-links.mjs`, genérico a toda a documentação).
 */
export function validatePhaseFiles(repoRoot) {
  const errors = [];
  const phasesPath = join(repoRoot, 'docs', 'PHASES.md');

  if (!existsSync(phasesPath)) {
    // Já reportado por validate-phases.mjs — este validador não repete o erro, só não tem nada para verificar.
    return { name: 'validate-phase-files', ok: true, errors };
  }

  const content = readFileSync(phasesPath, 'utf8');
  const referencedPaths = new Set(
    [...content.matchAll(PHASE_DOC_REFERENCE_PATTERN)].map((match) => match[1]),
  );

  for (const referencedPath of referencedPaths) {
    const absolutePath = join(repoRoot, referencedPath);
    if (!existsSync(absolutePath)) {
      errors.push(`docs/PHASES.md referencia "${referencedPath}", mas o ficheiro não existe.`);
    }
  }

  if (referencedPaths.size === 0) {
    errors.push('docs/PHASES.md não referencia nenhum documento em docs/phases/ — verificar o padrão esperado (`docs/phases/*.md`).');
  }

  return { name: 'validate-phase-files', ok: errors.length === 0, errors };
}
