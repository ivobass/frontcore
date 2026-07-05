# FrontCore — Documentação de IA

Reúne toda a governação, workflow e formato de resposta para qualquer
assistente de IA (Claude, ChatGPT, Codex, Gemini ou outro) que trabalhe no
FrontCore. `docs/INDEX.md` continua a ser o ponto de entrada oficial de
toda a documentação técnica — esta pasta é a secção de IA desse índice.

## Índice

| Documento | Objetivo |
|---|---|
| [AI_GOVERNANCE.md](./AI_GOVERNANCE.md) | Porquê — filosofia, Source of Truth, estrutura da equipa |
| [AI_WORKFLOW.md](./AI_WORKFLOW.md) | Como — fluxo operacional obrigatório para código |
| [AI_RESPONSE_FORMAT.md](./AI_RESPONSE_FORMAT.md) | Formato normalizado de resposta (4 modos) |
| [AI_PROMPT_STANDARD.md](./AI_PROMPT_STANDARD.md) | Formato normalizado de pedido (lado do utilizador) |
| [AI_DOCUMENTATION.md](./AI_DOCUMENTATION.md) | Regras de como escrever e localizar documentação |
| [AI_QUALITY_REVIEW.md](./AI_QUALITY_REVIEW.md) | Checklist de revisão específico de `packages/ui` |
| [templates/](./templates/) | Esqueletos prontos a preencher, um por tipo de tarefa |

## Ordem de leitura

1. `AI_GOVERNANCE.md`
2. `AI_WORKFLOW.md`
3. `AI_RESPONSE_FORMAT.md`
4. `AI_PROMPT_STANDARD.md`
5. `AI_DOCUMENTATION.md` — só quando a tarefa envolve atualizar documentação
6. `AI_QUALITY_REVIEW.md` — só quando a tarefa envolve `packages/ui`
7. `templates/*.md` — consultado no momento de responder

## Regra de fundo

Esta pasta não depende de nenhum modelo de IA específico para continuar
válida — qualquer assistente que siga estes documentos pode substituir
qualquer outro sem perda de contexto (ver `AI_GOVERNANCE.md`).
