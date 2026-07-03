# FrontCore AI Response Format

Version: 1.0

## Objetivo

Normalizar o formato das respostas de qualquer IA que trabalhe no
FrontCore, para que sejam previsíveis independentemente do modelo
utilizado. Este documento não define o que fazer (`docs/AI_WORKFLOW.md`)
nem porque fazer (`docs/AI_GOVERNANCE.md`) — define só a forma como o
resultado é apresentado.

## Modo Trabalho

Usar para qualquer tarefa de análise ou implementação do dia a dia.

- Estado do Git
- Documentação utilizada — formato definido em `docs/AI_WORKFLOW.md`
- Análise
- Decisão
- Ficheiros
- Próximo passo

## Modo Arquitetura

Usar quando a tarefa envolve uma decisão estrutural (nova ADR, mudança de
fronteira entre packages/apps, nova dependência externa).

- Contexto
- Análise
- Alternativas
- Decisão
- Impacto
- Próximo passo

## Modo Revisão

Usar para revisão de código, documentação ou arquitetura já existente.

- Resultado
- Problemas encontrados
- Riscos
- Recomendações

## Modo Implementação

Usar depois de uma proposta ser aprovada, para apresentar o resultado do
trabalho feito.

- Objetivo
- Ficheiros alterados
- Resumo
- Validação
- Próximo passo

## Escolha de modo

Se não for óbvio qual o modo aplicável, usar Modo Trabalho por omissão —
é o mais genérico.

## Independência de modelo

Este formato aplica-se a qualquer IA (ChatGPT, Claude, Codex, Gemini ou
outra) que trabalhe no FrontCore, conforme `docs/AI_GOVERNANCE.md`.
