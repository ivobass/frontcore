# FrontCore Git Workflow

Version: 1.3

## Objetivo

Este documento define o uso de Git no FrontCore.

O objetivo é manter o histórico limpo, fases rastreáveis e releases fáceis de recuperar.

## Branch principal

```text
main
```

A branch `main` deve representar o estado estável do projeto.

## Antes de começar trabalho

Confirmar:

```bash
git status
git pull origin main
```

O ideal é começar sempre com working tree limpa.

## Durante uma fase

Trabalhar em alterações pequenas e relacionadas.

Evitar misturar:

- UI com backend
- documentação com refactor grande
- deploy com features
- várias fases no mesmo commit

## Commits

Usar mensagens claras no estilo Conventional Commits.

Exemplos:

```text
docs(ai): add AI workflow
feat(ui): add package foundation
refactor(ui): move cn helper to lib
fix(auth): correct refresh token validation
chore(repo): update workspace config
```

## Quando fazer commit

Fazer commit quando:

- a alteração tem objetivo claro
- o projeto valida
- o escopo está fechado
- a alteração pode ser explicada em uma frase

## Tags

Usar tags para marcar estados importantes.

Exemplos:

```text
v0.3.0-architecture-freeze
v0.3.3-ui-foundation
```

Tags devem ser usadas para pontos recuperáveis, não para cada pequena alteração.

## Regras para agentes de IA

Definidas em `docs/ai/AI_WORKFLOW.md`, secção "Git" — não repetidas aqui,
para as duas versões não divergirem.

## Checklist antes de commit

Checklist canónico definido em `docs/ai/AI_RELEASE_CHECKLIST.md` — não
repetido aqui, para as duas versões não divergirem.

## Checklist depois de push

```bash
git status
git log --oneline -5
git tag --list
```

## Regra anti-confusão

Se não consegues explicar o commit numa frase, o commit está grande ou misturado demais.
