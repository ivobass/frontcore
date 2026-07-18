# FrontCore — Documentação de IA

Version: 1.3

Reúne toda a governação, workflow e formato de resposta para qualquer
assistente de IA (Claude, ChatGPT, Codex, Gemini ou outro) que trabalhe no
FrontCore. `docs/INDEX.md` continua a ser o ponto de entrada oficial de
toda a documentação técnica — esta pasta é a secção de IA desse índice.

## Índice

| Documento | Objetivo |
|---|---|
| [AI_BASE_PROMPT.md](./AI_BASE_PROMPT.md) | Síntese acionável das regras permanentes — leitura rápida, citável em qualquer prompt |
| [AI_GOVERNANCE.md](./AI_GOVERNANCE.md) | Porquê — filosofia, Source of Truth, estrutura da equipa |
| [AI_WORKFLOW.md](./AI_WORKFLOW.md) | Como — fluxo operacional obrigatório para código |
| [AI_RESPONSE_FORMAT.md](./AI_RESPONSE_FORMAT.md) | Formato normalizado de resposta (4 modos) |
| [AI_PROMPT_STANDARD.md](./AI_PROMPT_STANDARD.md) | Formato normalizado de pedido (lado do utilizador) |
| [AI_PHASE_TEMPLATE.md](./AI_PHASE_TEMPLATE.md) | Formulário reutilizável para pedir uma fase nova |
| [AI_REVIEW_CHECKLIST.md](./AI_REVIEW_CHECKLIST.md) | Checklist arquitetural geral, para qualquer revisão fora de `packages/ui` |
| [AI_RELEASE_CHECKLIST.md](./AI_RELEASE_CHECKLIST.md) | Checklist canónica de validação e encerramento de fase |
| [AI_PROMPT_GUIDE.md](./AI_PROMPT_GUIDE.md) | Como usar todo este framework, com exemplos |
| [AI_DOCUMENTATION.md](./AI_DOCUMENTATION.md) | Regras de como escrever e localizar documentação |
| [AI_QUALITY_REVIEW.md](./AI_QUALITY_REVIEW.md) | Checklist de revisão específico de `packages/ui` |
| [templates/](./templates/) | Esqueletos prontos a preencher, um por tipo de tarefa |

## Camadas

Organização conceptual desta pasta — porquê existe, ver `AI_GOVERNANCE.md`,
secção "Camadas da documentação de IA". Esta tabela é a única fonte da
classificação — não repetida em mais nenhum documento:

| Camada | Documentos |
|---|---|
| Filosofia | `AI_GOVERNANCE.md` |
| Processo | `AI_WORKFLOW.md` |
| Especificações | `AI_RESPONSE_FORMAT.md`, `AI_PROMPT_STANDARD.md`, `AI_DOCUMENTATION.md`, `AI_QUALITY_REVIEW.md` |
| Prompt Kit | `AI_BASE_PROMPT.md`, `AI_PHASE_TEMPLATE.md`, `AI_REVIEW_CHECKLIST.md`, `AI_RELEASE_CHECKLIST.md`, `AI_PROMPT_GUIDE.md` |

A camada "Prompt Kit" (Fase de engenharia do processo, 2026-07-12)
distingue-se das "Especificações" por ser feita para ser **citada ou
copiada diretamente para dentro de um prompt**, não só lida uma vez e
internalizada — ver `AI_PROMPT_GUIDE.md` para a diferença na prática.

## Ordem de leitura

1. `AI_BASE_PROMPT.md` — leitura rápida obrigatória, suficiente para a
   maioria das tarefas do dia a dia.
2. `AI_GOVERNANCE.md` e `AI_WORKFLOW.md` — leitura completa obrigatória
   na primeira vez que se trabalha no projeto, e sempre que uma regra
   de `AI_BASE_PROMPT.md` pareça insuficiente para o caso em mãos.
3. `AI_RESPONSE_FORMAT.md`
4. `AI_PROMPT_STANDARD.md` — mais `AI_PHASE_TEMPLATE.md` quando a
   tarefa é iniciar uma fase nova
5. `AI_DOCUMENTATION.md` — só quando a tarefa envolve atualizar documentação
6. `AI_QUALITY_REVIEW.md` — só quando a tarefa envolve `packages/ui`;
   `AI_REVIEW_CHECKLIST.md` — quando a tarefa é uma revisão fora de
   `packages/ui`
7. `AI_RELEASE_CHECKLIST.md` — quando a tarefa é fecho de fase
8. `templates/*.md` — consultado no momento de responder

## Regra de fundo

Esta pasta não depende de nenhum modelo de IA específico para continuar
válida — qualquer assistente que siga estes documentos pode substituir
qualquer outro sem perda de contexto (ver `AI_GOVERNANCE.md`).

## Estabilidade do AI Framework

Depois da consolidação de 2026-07-18 (Execution Mode, Continuidade
entre fases, prompts de fase mínimos), o AI Framework — esta pasta —
é considerado estável. Alterações futuras só se justificam perante:

- um problema real observado durante implementações;
- uma regressão;
- um bloqueio técnico;
- ou uma decisão explícita do Product Owner.

Melhorias hipotéticas deixam de justificar alterações ao framework —
mesma disciplina de YAGNI já aplicada ao resto do projeto (ver
`docs/ai/AI_BASE_PROMPT.md`, secção 5).

## Observações para fases futuras

Formato definido em `AI_BASE_PROMPT.md`, secção 16. Registada na
revisão final do AI Framework v1.1 (2026-07-12), não implementada por
YAGNI — só para reavaliação futura.

### Evolução futura do AI Framework

**Problema encontrado**

Ao longo do desenvolvimento poderão surgir decisões permanentes
relacionadas especificamente com a colaboração entre humanos e IA —
distintas de ADRs (decisões de arquitetura de produto) e de
`docs/phases/` (registo por fase de produto), que não têm um sítio
próprio para viver.

**Impacto**

Sem um local próprio, essas decisões poderão ficar dispersas pela
documentação, ou perder-se no histórico de conversas.

**Sugestão**

Quando o FrontCore atingir maior maturidade (aproximadamente dentro de
10 a 15 fases), reavaliar a criação de:

`docs/ai/AI_DECISION_RECORDS.md`

Este documento poderá servir para registar, por exemplo:

- decisões permanentes do workflow;
- evolução das regras do AI Framework;
- padrões recorrentes de revisão;
- decisões de colaboração entre ChatGPT, Claude e futuras IAs;
- lições aprendidas;
- decisões metodológicas que deixem de pertencer a uma fase específica.

**Prioridade**

Baixa. Não criar este documento agora — aplicar YAGNI rigorosamente;
reavaliar só quando existir experiência suficiente para justificar a
criação.
