/**
 * Correção pós-revisão Codex (Fase 6.14, 2ª ronda) — só usado por
 * `test:integration` (`jest-integration.json`), NUNCA por `test`/
 * `test:e2e` (esses continuam 100% mockados, disciplina inalterada de
 * `docs/phases/phase-4.4-backend-tests.md`). Esta suite é a exceção
 * explícita e limitada, pedida pela revisão, para provar propriedades
 * de concorrência real (`SELECT ... FOR UPDATE`) que um mock de Prisma
 * estrutural nunca consegue demonstrar — corre contra o Postgres de
 * desenvolvimento local (`docker compose`), nunca contra dados reais
 * permanentes. Mesmo valor de `.env.example`/`.env` — só como omissão,
 * nunca sobrepõe uma env var já definida no ambiente (`??=`).
 */
process.env.DATABASE_URL ??= 'postgresql://frontcore:frontcore_local_pw@localhost:5432/frontcore?schema=public';
