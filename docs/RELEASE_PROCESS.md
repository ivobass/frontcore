# FrontCore Release Process

Version: 1.0

## Objetivo

Este documento define como fechar fases, criar pontos estáveis e preparar continuidade no FrontCore.

## O que é uma fase fechada

Uma fase só está fechada quando:

- objetivo cumprido
- alterações dentro do escopo
- arquitetura respeitada
- documentação atualizada
- validações executadas
- working tree limpa
- commit feito
- tag criada quando for marco importante

## Checklist de encerramento

Antes de fechar uma fase:

```bash
git status
pnpm lint
pnpm typecheck
pnpm build
```

Executar apenas comandos existentes e adequados ao estado do projeto.

## Documentação obrigatória

Confirmar se foram atualizados, quando aplicável:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/PHASES.md`
- `docs/adr/`
- `docs/phases/`
- documentação específica da área alterada

## Commit de fecho

Usar mensagem clara.

Exemplos:

```text
docs(architecture): freeze Phase 3 UI architecture
feat(ui): complete Phase 3.3 UI foundation
docs(release): close Phase 3.3
```

## Tags

Usar tag quando a fase representa um marco recuperável.

Exemplo:

```bash
git tag v0.3.3-ui-foundation
git push origin v0.3.3-ui-foundation
```

## Resumo de fecho

Ao fechar uma fase, registar:

- o que foi feito
- ficheiros alterados
- validações feitas
- commit
- tag
- próximos passos

## Regra para avançar fase

Não avançar para a próxima fase se:

- houver erros conhecidos sem decisão
- houver documentação desatualizada
- o escopo anterior ficou incompleto
- a arquitetura ficou ambígua

## Regra anti-caos

Fechar bem uma fase é mais importante do que começar depressa a próxima.
