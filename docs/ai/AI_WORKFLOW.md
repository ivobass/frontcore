# FrontCore AI Workflow

Version: 1.3

## Objetivo

Este documento define o fluxo **operacional** obrigatório para qualquer
agente de IA que trabalhe no FrontCore.

Aplica-se a ChatGPT, Claude, Codex, Gemini ou qualquer outro assistente
usado para analisar, planear, implementar ou rever código.

## Âmbito deste documento

Este documento é exclusivamente operacional — define o **como** do fluxo
de trabalho com código. Os princípios, a filosofia e a estrutura de
decisão vivem em `docs/ai/AI_GOVERNANCE.md`. O formato das respostas vive
em `docs/ai/AI_RESPONSE_FORMAT.md`. Como escrever prompts vive em
`docs/ai/AI_PROMPT_STANDARD.md`. Como escrever documentação vive em
`docs/ai/AI_DOCUMENTATION.md`. A revisão de qualidade específica de
`packages/ui` vive em `docs/ai/AI_QUALITY_REVIEW.md`.

## Ordem obrigatória de leitura

Antes de propor ou escrever código, a IA deve:

1. Consultar `docs/INDEX.md` — ponto de entrada obrigatório.
2. Identificar, a partir do índice, toda a documentação relevante para a
   tarefa.
3. Ler essa documentação na íntegra, não apenas por título.
4. Confirmar que não existe documentação duplicada ou conflituosa sobre o
   mesmo tema.
5. Só depois, ler os ficheiros de código diretamente relacionados com a
   tarefa.

Leitura mínima recomendada, sempre:

1. `README.md`
2. `docs/ai/AI_GOVERNANCE.md`
3. `docs/ai/AI_WORKFLOW.md` (este documento)
4. `docs/ai/AI_RESPONSE_FORMAT.md`
5. `docs/ARCHITECTURE.md`
6. `docs/PHASES.md`
7. ADRs relevantes em `docs/adr/`
8. Documentação da fase atual, quando existir

Nunca começar pela implementação.

## Início de fase ou de conversa

Sempre que se inicia uma nova fase, ou um novo chat depois de um commit,
tag e push, é obrigatório validar o estado do Git e rever toda a
documentação alterada na fase anterior, bem como os documentos de
arquitetura relevantes, antes de qualquer análise, planeamento ou
implementação. Não assumir que o estado descrito numa conversa anterior
continua válido sem essa validação.

## Documentação utilizada (formato obrigatório)

Toda a resposta de análise, plano ou implementação deve declarar
explicitamente quais documentos foram consultados, neste formato:

```
Documentação utilizada

- docs/INDEX.md
- docs/ai/AI_WORKFLOW.md
- docs/ARCHITECTURE.md
- docs/...
- docs/adr/...
- docs/phases/...
```

Este bloco é o conteúdo da secção "Documentação utilizada" do Modo
Trabalho definido em `docs/ai/AI_RESPONSE_FORMAT.md`.

## Fonte da verdade (aplicação operacional)

A filosofia de "documentação como Source of Truth" está definida em
`docs/ai/AI_GOVERNANCE.md`. Operacionalmente, a ordem de prioridade entre
fontes é:

1. ADRs em `docs/adr/`
2. Documentação oficial em `docs/`
3. Código existente no repositório
4. Pedido atual do utilizador
5. Contexto da conversa

Regras adicionais:

- Nunca assumir informação baseada em memória quando existir documentação
  oficial.
- Se existir documentação relevante, esta prevalece sempre sobre memória.

Caso exista conflito entre documentação e código:

1. identificar o conflito;
2. não assumir qual está correta;
3. pedir validação antes de alterar qualquer um dos dois.

Caso exista conflito entre fontes de documentação, a IA deve parar,
explicar o conflito e esperar aprovação.

## Fluxo obrigatório

### 1. Análise

Identificar:

- estado atual
- arquitetura existente
- ficheiros relevantes
- dependências
- riscos
- limites da fase atual

### 2. Planeamento

Apresentar:

- objetivo
- ficheiros a criar, mover ou alterar
- alterações propostas
- impacto esperado
- comandos de validação

Esperar aprovação explícita antes de implementar.

### 3. Implementação

Implementar apenas o que foi aprovado.

Não adicionar funcionalidades extra.
Não alterar código fora do âmbito.
Não fazer refactors oportunistas.

### 4. Validação

Executar apenas validações necessárias.

Confirmar, quando aplicável:

- instalação sem erros
- lint sem erros
- tipos corretos
- build funcional
- comportamento inalterado

### 5. Encerramento

Apresentar:

- resumo do que mudou
- ficheiros alterados
- validações executadas
- riscos restantes
- próximo passo recomendado

## Definition of Done (DoD)

Uma fase apenas pode ser considerada concluída quando cumprir todos os
critérios seguintes:

- implementação concluída
- arquitetura aprovada
- ADRs respeitadas
- documentação da fase criada
- documentação geral atualizada (`INDEX.md`, `PHASES.md` e restantes
  documentos relevantes)
- roadmap atualizado (quando aplicável)
- typecheck limpo
- build limpa
- testes executados (quando existirem)
- revisão arquitetural concluída
- Git limpo após commit
- commit realizado
- tag criada
- push efetuado

Nenhuma fase deverá ser considerada concluída se algum destes pontos
estiver em falta.

## Âmbito da tarefa

Cada tarefa deve estar limitada ao seu âmbito.

Exemplo para Fase 3.3:

Permitido:

- `packages/ui`
- documentação técnica diretamente relacionada

Não permitido:

- backend
- deploy
- `apps/frontrest`
- alterações de comportamento da aplicação

Caso seja necessária uma alteração fora do âmbito, a IA deve parar e pedir
aprovação.

## Git

A IA não deve executar automaticamente:

- `git add`
- `git commit`
- `git push`
- `git tag`
- merge de pull request

A IA pode sugerir comandos.
O utilizador decide quando executar.

Exceção: só pode alterar diretamente o GitHub quando o utilizador pedir
explicitamente.

## ADRs

Toda decisão arquitetural relevante deve:

- consultar ADRs existentes
- evitar duplicação
- sugerir nova ADR quando a decisão for estrutural
- não contrariar ADRs aprovadas sem autorização

## Documentação

As regras de como escrever e atualizar documentação (incluindo o que
fazer quando uma alteração modifica arquitetura, workflow ou estrutura do
projeto) estão em `docs/ai/AI_DOCUMENTATION.md`, para não se repetirem em
mais do que um sítio.

## Regras proibidas

Nunca:

- alterar arquitetura sem aprovação
- misturar fases
- alterar código não relacionado
- adicionar dependências sem justificar
- esconder riscos
- avançar quando o âmbito não está claro

## Regra principal

Em caso de dúvida:

1. Identificar a dúvida.
2. Explicar o impacto.
3. Apresentar alternativas.
4. Esperar aprovação.

Nunca assumir uma decisão arquitetural.
