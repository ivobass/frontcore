import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Responsabilidade única: confirmar que a documentação fundacional de
 * arquitetura/governação existe — `docs/ARCHITECTURE.md` (arquitetura
 * geral) e `docs/ai/` (governação de IA, indexada por
 * `docs/ai/README.md`). Agrupados no mesmo validador por serem ambos
 * verificações de existência da mesma camada fundacional, nunca de
 * conteúdo de fases (isso é `validate-phases.mjs`/`validate-phase-files.mjs`).
 */
export function validateArchitecture(repoRoot) {
  const errors = [];

  const architecturePath = join(repoRoot, 'docs', 'ARCHITECTURE.md');
  if (!existsSync(architecturePath)) {
    errors.push('docs/ARCHITECTURE.md não existe.');
  }

  const aiDocsPath = join(repoRoot, 'docs', 'ai');
  if (!existsSync(aiDocsPath)) {
    errors.push('docs/ai/ não existe.');
  }

  const aiReadmePath = join(repoRoot, 'docs', 'ai', 'README.md');
  if (existsSync(aiDocsPath) && !existsSync(aiReadmePath)) {
    errors.push('docs/ai/README.md não existe (índice da governação de IA).');
  }

  return { name: 'validate-architecture', ok: errors.length === 0, errors };
}
