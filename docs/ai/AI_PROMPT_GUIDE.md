# FrontCore AI Prompt Guide

Version: 1.0

## Objetivo

Explicar como usar, na prática, o conjunto de documentos criado para
reduzir o tamanho dos prompts de fase — `AI_BASE_PROMPT.md`,
`AI_PHASE_TEMPLATE.md`, `AI_REVIEW_CHECKLIST.md`,
`AI_RELEASE_CHECKLIST.md`. Este documento é o guia de utilização; os
outros são as ferramentas. Se `docs/ai/AI_PROMPT_STANDARD.md` define a
estrutura formal de qualquer pedido, este documento mostra, com
exemplos concretos, como aplicar essa estrutura já apoiada nas
ferramentas novas.

## Visão geral do framework

```text
docs/ai/AI_BASE_PROMPT.md       — regras permanentes (ler uma vez, citar sempre)
docs/ai/AI_PHASE_TEMPLATE.md    — formulário para pedir uma fase nova
docs/ai/AI_REVIEW_CHECKLIST.md  — checklist para pedir uma revisão
docs/ai/AI_RELEASE_CHECKLIST.md — checklist para fechar uma fase
docs/ai/AI_PROMPT_GUIDE.md      — este documento
```

Os quatro primeiros existem para uma única razão: até à Fase 6.6, cada
prompt de fase reafirmava o mesmo workflow, as mesmas regras de
aprovação, o mesmo formato de resposta, as mesmas regras de Git —
centenas de linhas repetidas de fase para fase. Esse conteúdo agora
vive uma única vez em `docs/ai/AI_BASE_PROMPT.md` (e nos documentos que
ele cita). Um prompt de fase deixa de precisar de o reescrever — só
precisa de o assumir.

## Como iniciar uma fase nova

1. Confirmar que a fase anterior está mesmo fechada (`git log`, tag
   mais recente) — nunca assumir estado a partir da memória da
   conversa.
2. Preencher `docs/ai/AI_PHASE_TEMPLATE.md`: Nome, Objetivo, Contexto,
   Requisitos, Fora do âmbito, Critérios de conclusão, Validações,
   Documentação, Resultado esperado.
3. No topo do prompt, uma frase basta: `Segue docs/ai/AI_BASE_PROMPT.md.`
4. Enviar. Não é preciso repetir workflow, regras de Git, ou formato de
   resposta — isso já está assumido.

### Antes (estilo usado até à Fase 6.6)

```text
# PROMPT FINAL PARA O CLAUDE

Antes de escrever qualquer linha de código, lê toda a documentação
do projeto para compreender a arquitetura, os padrões existentes e
as decisões já tomadas.

Lê especialmente: docs/, arquitetura, OCR, Invoice Draft, Workers,
AI, Governance, parsing, invoices.

[... dezenas de linhas de workflow, regras de aprovação, formato de
resposta, regras de Git, "não implementar IA", "não fazer commit",
"não criar tag", "não fazer push" ...]

# v0.6.6 — Fiscal Parsing & Structured Extraction Foundation

[objetivo, requisitos, âmbito, entrega esperada]
```

### Depois (com o framework)

```text
# PROMPT FINAL PARA O CLAUDE

Segue docs/ai/AI_BASE_PROMPT.md.

# Fase 6.7 — Fiscal Parsing Draft Integration

[Nome / Objetivo / Contexto / Requisitos / Fora do âmbito /
Critérios de conclusão / Validações / Documentação / Resultado
esperado — docs/ai/AI_PHASE_TEMPLATE.md]
```

O conteúdo técnico do pedido (o que muda nesta fase) mantém-se
igualmente detalhado — o que desaparece é só a repetição do que já é
permanente.

## Como escrever prompts pequenos

Um prompt pequeno não é um prompt vago — é um prompt que não repete o
que já está escrito. Regra prática: se uma frase do prompt poderia ser
copiada, sem alterar uma palavra, para o próximo pedido de fase, essa
frase pertence a `docs/ai/AI_BASE_PROMPT.md`, não ao prompt. Se já lá
estiver, não a repetir — só referenciar o documento.

O que continua a precisar de ser escrito de novo, sempre: o objetivo
específico, o contexto específico, os requisitos específicos, o que
está fora do âmbito **desta** fase. Isso nunca é genérico — é o
conteúdo real do pedido.

## Como reutilizar o AI_BASE_PROMPT

Duas formas, conforme o canal:

- **Prompt novo, mesma conversa/projeto**: uma linha —
  `Segue docs/ai/AI_BASE_PROMPT.md.` — é suficiente, porque a IA lê o
  ficheiro do repositório.
- **Início de uma conversa nova, ou troca de ferramenta de IA**: a
  mesma linha continua a ser suficiente — `docs/ai/AI_BASE_PROMPT.md`
  foi desenhado precisamente para não depender de memória de conversa
  (ver `docs/ai/AI_GOVERNANCE.md`, "independência de modelo"). Se a
  ordem de leitura obrigatória (`docs/INDEX.md`) for seguida, o
  documento é lido de qualquer forma, mesmo sem ser citado
  explicitamente.

## Como fazer revisões

1. Pedir explicitamente Modo Revisão — nomear o que deve ser revisto e
   pedir avaliação crítica, não confirmação.
2. Referenciar `docs/ai/AI_REVIEW_CHECKLIST.md` para o destinatário
   saber que critérios aplicar, em vez de listar SOLID/acoplamento/
   coesão/etc. de novo no prompt.
3. Pedir explicitamente para não justificar decisões existentes, se
   for esse o objetivo — "assume o papel de alguém que nunca viu este
   código, procura problemas" produz uma revisão genuinamente mais
   crítica do que "confirma que está tudo bem".
4. Uma segunda revisão, mais tarde, sobre o mesmo código, é legítima e
   frequentemente encontra coisas que a primeira não encontrou — isso
   é o resultado esperado de uma segunda revisão mais crítica, não um
   sinal de que a primeira foi mal feita (ver o histórico das revisões
   da Fase 6.6 como precedente).

## Como encerrar fases

1. Referenciar `docs/ai/AI_RELEASE_CHECKLIST.md` em vez de listar
   comandos de validação no prompt.
2. Pedir explicitamente os três últimos passos como **sugestão**, nunca
   como execução — a checklist já marca commit/tag/push como manuais,
   mas repetir isso no prompt não faz mal nenhum quando a intenção é
   mesmo essa.
3. Confirmar, depois de o utilizador executar commit/tag/push, que a
   próxima conversa (mesmo que seja a mesma sessão) trata isso como
   sinal de fase fechada e sincroniza antes de continuar (ver
   `docs/ai/AI_WORKFLOW.md`, "Protocolo de Transição de Fase").

## Boas práticas

- Nunca duplicar, dentro de um prompt, uma regra que já vive em
  `docs/ai/AI_BASE_PROMPT.md` — referenciar, não copiar.
- Ser específico no que muda (objetivo, requisitos, âmbito) e breve no
  que não muda (workflow, formato, Git).
- Quando uma fase introduzir uma regra genuinamente nova e permanente
  (não só desta fase), propor explicitamente que ela seja adicionada a
  `docs/ai/AI_BASE_PROMPT.md` no fecho da fase — é assim que o
  documento continua a crescer sem se tornar, ele próprio, um
  repositório de exceções de uma fase só.
- Não forçar todas as tarefas a caber no molde de fase — um pedido de
  análise rápida, uma pergunta pontual, ou uma correção pequena não
  precisam de `AI_PHASE_TEMPLATE.md`; usar o formato geral de
  `docs/ai/AI_PROMPT_STANDARD.md`, com a secção que fizer sentido.

## Relação com outros documentos

| Documento | Papel |
|---|---|
| `docs/ai/AI_BASE_PROMPT.md` | As regras permanentes que este guia ensina a usar |
| `docs/ai/AI_PHASE_TEMPLATE.md` | O formulário de pedido de fase |
| `docs/ai/AI_REVIEW_CHECKLIST.md` | O que verificar numa revisão |
| `docs/ai/AI_RELEASE_CHECKLIST.md` | O que verificar ao fechar uma fase |
| `docs/ai/AI_PROMPT_STANDARD.md` | A estrutura formal de qualquer pedido, da qual `AI_PHASE_TEMPLATE.md` é uma instância |
| `docs/ai/AI_RESPONSE_FORMAT.md` | Os quatro modos de resposta que os pedidos acima produzem |
