import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateIndex } from './validators/validate-index.mjs';
import { validatePhases } from './validators/validate-phases.mjs';
import { validatePhaseFiles } from './validators/validate-phase-files.mjs';
import { validateArchitecture } from './validators/validate-architecture.mjs';
import { validateLinks } from './validators/validate-links.mjs';

/**
 * Agregador de validação de documentação (Fase 10.1) — chama cada
 * validador (responsabilidade única cada um, `scripts/validators/`) e
 * reporta os resultados. Falha imediatamente (`process.exitCode = 1`)
 * se qualquer validador encontrar um erro — nunca ignora nem
 * silencia falhas. Usado por `pnpm docs:validate` e pelo passo
 * "Documentation Validation" do CI (`.github/workflows/ci.yml`).
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const validators = [validateIndex, validatePhases, validatePhaseFiles, validateArchitecture, validateLinks];

let hasFailure = false;

for (const validator of validators) {
  const result = validator(repoRoot);
  if (result.ok) {
    console.log(`✔ ${result.name}`);
  } else {
    hasFailure = true;
    console.error(`✘ ${result.name}`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }
}

if (hasFailure) {
  console.error('\nValidação da documentação falhou.');
  process.exitCode = 1;
} else {
  console.log('\nDocumentação validada com sucesso.');
}
