# FrontCore AI Prompt Standard

Version: 1.0

## Objetivo

Normalizar a estrutura dos pedidos ("prompts") dirigidos a assistentes de
IA no FrontCore, para que sejam consistentes independentemente de quem os
escreve ou de qual assistente os recebe. Este documento define o formato
do **pedido** (lado do utilizador); `docs/ai/AI_RESPONSE_FORMAT.md` define
o formato da **resposta** (lado da IA).

## Estrutura obrigatória de um prompt

1. **Cabeçalho** — identifica o destinatário e que se trata de um pedido
   formal, não uma pergunta casual. Para pedidos dirigidos ao Claude, o
   cabeçalho oficial do projeto é:

   ```
   # PROMPT FINAL PARA O CLAUDE
   ```

2. **Contexto** — em que fase/estado está o projeto, o que já foi
   concluído.
3. **Workflow obrigatório** — lista explícita dos passos que a IA deve
   seguir antes de implementar (ex.: ler `AI_WORKFLOW.md`, validar Git,
   rever documentação relevante).
4. **Objetivo** — o que se pretende alcançar, numa frase clara.
5. **Âmbito / restrições** — o que é permitido e o que não é; ficheiros ou
   áreas fora de alcance.
6. **Entrega esperada** — o que a resposta deve conter, em lista numerada.
7. **Instrução de aprovação** — deixar explícito se a IA deve implementar
   já ou só apresentar análise/plano e esperar aprovação.

## Ordem recomendada

Contexto → Workflow obrigatório → Objetivo → Âmbito/Restrições → Entrega
esperada → Instrução de aprovação. Secções que não se aplicam a um pedido
simples podem ser omitidas — não é obrigatório usar todas as secções para
perguntas triviais.

## Tipos de prompt

- **Análise** — pede só investigação/diagnóstico, sem implementar.
- **Arquitetura** — pede uma decisão estrutural (nova ADR, nova
  categoria, nova dependência).
- **Implementação** — já foi aprovado um plano; pede para executar.
- **Revisão** — pede avaliação crítica de algo já existente.
- **Fecho de fase** — pede validações finais + preparação de commit/tag.

Cada tipo mapeia para o modo de resposta correspondente em
`docs/ai/AI_RESPONSE_FORMAT.md`.

## Templates

Esqueletos prontos a preencher, um por tipo de tarefa, em
`docs/ai/templates/`.

## Convenções

- Pedidos que autorizam ações Git explícitas (commit/tag/push) devem
  dizer isso por extenso — nunca assumir autorização implícita (ver
  `docs/ai/AI_WORKFLOW.md`, secção "Git").
- Pedidos de análise devem terminar com uma instrução explícita de
  "não implementar ainda" quando a intenção é só rever o plano.
- Alterações de âmbito (o que passa a ser permitido/proibido) devem ser
  ditas de forma explícita, não implícitas por omissão.
