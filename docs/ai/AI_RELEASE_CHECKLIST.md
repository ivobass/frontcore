# FrontCore AI Release Checklist

Version: 1.1

## Objetivo

Checklist canónica de validação e encerramento de fase — comandos a
correr e critérios a confirmar antes de considerar qualquer fase
concluída. Antes desta versão, o mesmo conteúdo vivia disperso entre a
secção "Validação" e a secção "Definition of Done (DoD)" de
`docs/ai/AI_WORKFLOW.md`, com `docs/GIT_WORKFLOW.md` e
`docs/RELEASE_PROCESS.md` a apontar para lá em vez de o repetir. Este
documento passa a ser o único dono desse conteúdo — os três continuam a
existir, agora todos a apontar para aqui, pela mesma razão de sempre:
uma responsabilidade, um sítio, para as versões nunca divergirem.

## Como usar

Percorrer esta checklist de cima para baixo antes de reportar uma fase
como concluída (Modo Implementação, `docs/ai/AI_RESPONSE_FORMAT.md`).
Os três últimos passos — commit, tag, push — estão marcados como
**exclusivamente manuais**: a IA prepara tudo até ao resumo final e
sugere os comandos exatos, mas nunca os executa (ver
`docs/ai/AI_BASE_PROMPT.md`, secção 10).

## 1. Estado do Git

```bash
git status
```

Confirmar working tree limpa antes de começar, e ver exatamente o que
mudou antes de reportar como concluído.

## 2. Build e testes

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

Notas:

- `pnpm test` só corre onde já existirem testes — não falhar a
  validação por ausência de testes onde nunca existiram.
- Testes e2e (`pnpm --filter <app> test:e2e`) não fazem parte do
  `pnpm test` por omissão — correr explicitamente quando a fase os
  envolver, e reportar o resultado à parte.

## 3. Lint

```bash
pnpm lint
```

**Não é um gate ativo hoje em nenhuma parte do monorepo** — não existe
nenhum ESLint configurado; o script/task existe mas não tem nenhum
linter real por trás (ver `docs/quality/quality-gates.md`, "Gates
planeados, ainda não ativos"). Correr na mesma e reportar o resultado
tal como é (hoje, "0 tasks executadas") — nunca omitir este passo nem
fingir que valida alguma coisa. Quando o lint for ativado, este
documento é o primeiro a atualizar.

## 4. Migrações (quando a fase alterou o schema)

Confirmar que qualquer migration Prisma foi gerada e aplicada contra a
base de dados real usada em desenvolvimento — nunca só `prisma generate`
sem `prisma migrate`. Ver o padrão já seguido nas Fases 5.2, 6.3 e 6.5
para o fluxo completo (schema → migration → validação real).

## 5. Validação Docker (fases full-stack)

Quando uma fase altera backend e frontend, ou existe dúvida se as
imagens em execução refletem o código atual:

```bash
docker compose build api web
docker compose up -d api web
docker ps
curl http://localhost:3001/api/health
```

- Fase só backend → reconstruir só `api` pode ser suficiente.
- Fase só frontend → reconstruir só `web` pode ser suficiente.
- Fase backend + frontend → reconstruir sempre os dois; nunca validar
  `web` novo contra `api` antigo, ou vice-versa.
- Erros como `Cannot GET /api/...` ou rotas novas em falta geralmente
  significam que a imagem relevante não foi reconstruída — confirmar
  isso antes de assumir um bug de código.

Para encerramento de fase ou release, preferir a reconstrução completa:

```bash
docker compose build
docker compose up -d
docker ps
```

## 6. Documentação

Confirmar, quando aplicável:

- `docs/phases/phase-X.Y-*.md` criado, descrevendo o estado final (não
  o processo — ver `docs/ai/AI_DOCUMENTATION.md`).
- `docs/PHASES.md` atualizado.
- `docs/INDEX.md` atualizado, se algum documento foi criado ou movido.
- `docs/ARCHITECTURE.md` atualizado, se a arquitetura geral mudou.
- `README.md` (raiz), se o arranque local ou os comandos mudaram.
- Nova ADR criada, se a fase envolveu uma decisão estrutural.

## 7. Definition of Done — critérios finais

Uma fase só está concluída quando **todos** estes critérios se
verificam:

- [ ] Implementação concluída.
- [ ] Arquitetura aprovada (sem decisões estruturais por confirmar).
- [ ] ADRs respeitadas (ou nova ADR criada, se necessário).
- [ ] Documentação da fase criada.
- [ ] Documentação geral atualizada (`PHASES.md`, `INDEX.md`, e
      restantes documentos relevantes).
- [ ] Roadmap atualizado, quando aplicável.
- [ ] Typecheck limpo.
- [ ] Build limpa.
- [ ] Testes executados (quando existirem) — sem alterar testes para
      esconder falhas, sem `--force`/`--no-verify`.
- [ ] Validação Docker executada, para os serviços afetados
      (especialmente `api`/`web` em fases full-stack).
- [ ] Revisão arquitetural concluída (ver
      `docs/ai/AI_REVIEW_CHECKLIST.md`, quando a fase o justificar).
- [ ] Git limpo (`git status` sem alterações não explicadas).

Nenhuma fase deve ser considerada concluída se algum destes pontos
estiver em falta — reportar honestamente o que não foi feito, nunca
alegar validação que não correu.

## 8. Resumo de encerramento

Preparar (Modo Implementação, `docs/ai/AI_RESPONSE_FORMAT.md`):

- o que foi feito;
- ficheiros criados/alterados;
- validações executadas (com resultado real de cada comando);
- riscos restantes;
- observações para fases futuras, se alguma foi registada durante a
  fase (`docs/ai/AI_BASE_PROMPT.md`, secção 16) — transportadas para o
  documento da fase, não só deixadas na conversa;
- próximo passo recomendado;
- sugestão de mensagem de commit e de tag (ver formato abaixo).

## 9. Commit — manual, nunca automático

```bash
git add <ficheiros específicos>
git commit -m "feat(x): mensagem clara em Conventional Commits"
```

Sugerir a mensagem exata; nunca executar. Ver `docs/GIT_WORKFLOW.md`
para o estilo de mensagens.

## 10. Tag — manual, nunca automático

```bash
git tag vX.Y.Z-nome-da-fase
```

Só para pontos recuperáveis, não para cada alteração pequena. Sugerir o
nome exato; nunca executar.

## 11. Push — manual, nunca automático

```bash
git push origin main
git push origin vX.Y.Z-nome-da-fase
```

Sugerir os comandos exatos; nunca executar. Depois de o utilizador
confirmar que executou, tratar isso como o sinal oficial de que a fase
terminou e o estado publicado em `origin/main` passa a ser a referência
a sincronizar antes de qualquer trabalho novo (ver
`docs/ai/AI_WORKFLOW.md`, "Protocolo de Transição de Fase").

## Relação com outros documentos

- `docs/ai/AI_WORKFLOW.md` — fluxo operacional completo; a secção
  "Validação"/"Definition of Done" aponta para aqui.
- `docs/GIT_WORKFLOW.md` — convenções de Git em detalhe.
- `docs/RELEASE_PROCESS.md` — processo de release em detalhe; a secção
  "Checklist de encerramento" aponta para aqui.
- `docs/ai/AI_REVIEW_CHECKLIST.md` — critérios arquiteturais, distintos
  desta checklist (comandos e critérios de conclusão).
