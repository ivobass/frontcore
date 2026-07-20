import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
// Caminhos entre backticks, sempre relativos à raiz do repositório (ex.
// `docs/phases/x.md`) — convenção real desta documentação, que raramente
// usa a sintaxe [texto](link) do Markdown. Nunca `frontcore/docs/...`
// nem `FrontCore/docs/...` — esses referem-se sempre à árvore fora deste
// repositório (ver docs/INDEX.md, "Notas de fronteira"), fora do âmbito
// desta verificação.
const BACKTICK_DOC_PATH_PATTERN = /`(docs\/[^`\s]+\.(?:md|mdx))`/g;

/**
 * Caminhos entre backticks conhecidos, referenciados de propósito como
 * **não existentes** — nunca um link para conteúdo real. Cada um
 * confirmado por leitura direta do contexto antes de ser excluído aqui,
 * nunca adicionado só para "fazer passar" o validador:
 * - `docs/README.md` — `docs/adr/0006-documentation-architecture.md`
 *   documenta explicitamente a decisão de NUNCA criar este ficheiro
 *   ("Rejeitada por decisão explícita do Product Owner").
 * - `docs/ai/AI_DECISION_RECORDS.md` — `docs/ai/README.md` menciona-o
 *   só como sugestão para uma fase futura ("Observações para fases
 *   futuras", ainda não aprovada nem criada).
 */
const KNOWN_INTENTIONALLY_ABSENT_PATHS = new Set(['docs/README.md', 'docs/ai/AI_DECISION_RECORDS.md']);

function listMarkdownFilesRecursively(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listMarkdownFilesRecursively(fullPath));
    } else if (['.md', '.mdx'].includes(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isExternalOrAnchorOnly(target) {
  return (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('#')
  );
}

function stripAnchor(target) {
  const hashIndex = target.indexOf('#');
  return hashIndex === -1 ? target : target.slice(0, hashIndex);
}

/**
 * Responsabilidade única: detetar, em toda a documentação técnica sob
 * `docs/` (recursivamente), uma referência a outro documento local que não
 * existe — nunca valida a existência dos ficheiros fundacionais em si
 * (isso é `validate-index.mjs`/`validate-phases.mjs`/`validate-architecture.mjs`).
 * Cobre as duas formas usadas nesta documentação: links Markdown
 * `[texto](caminho)` e caminhos entre backticks (`` `docs/x.md` ``, a
 * forma predominante aqui). Best-effort — "quando possível", nunca uma
 * verificação exaustiva de todas as formas possíveis de referência.
 */
export function validateLinks(repoRoot) {
  const errors = [];
  const docsRoot = join(repoRoot, 'docs');

  if (!existsSync(docsRoot)) {
    errors.push('docs/ não existe — impossível verificar links internos.');
    return { name: 'validate-links', ok: false, errors };
  }

  const markdownFiles = listMarkdownFilesRecursively(docsRoot);

  for (const filePath of markdownFiles) {
    const content = readFileSync(filePath, 'utf8');
    const relativeFilePath = filePath.slice(repoRoot.length + 1);
    const referencedTargets = new Set();

    for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
      const target = stripAnchor(match[1].trim());
      if (target.length > 0 && !isExternalOrAnchorOnly(match[1].trim()) && target.startsWith('docs/')) {
        referencedTargets.add(target);
      }
    }
    for (const match of content.matchAll(BACKTICK_DOC_PATH_PATTERN)) {
      const target = match[1];
      // Padrão de exemplo/gabarito (ex. `docs/phases/phase-X.Y-*.md`) —
      // nunca um caminho real, sempre ilustrativo. Nunca verificado.
      if (!target.includes('*')) {
        referencedTargets.add(target);
      }
    }

    for (const target of referencedTargets) {
      if (KNOWN_INTENTIONALLY_ABSENT_PATHS.has(target)) {
        continue;
      }
      const absoluteTarget = join(repoRoot, target);
      if (!existsSync(absoluteTarget)) {
        errors.push(`${relativeFilePath} referencia "${target}", que não existe.`);
      }
    }
  }

  return { name: 'validate-links', ok: errors.length === 0, errors };
}
