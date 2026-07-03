# FrontCore AI Workflow

Version: 1.0

## Objetivo

Este documento define o fluxo obrigatório para qualquer agente de IA que trabalhe no FrontCore.

Aplica-se a ChatGPT, Claude, Codex, Gemini ou qualquer outro assistente usado para analisar, planear, implementar ou rever código.

O objetivo é garantir consistência, previsibilidade e segurança, independentemente da ferramenta utilizada.

## Fonte da verdade

A ordem de prioridade é sempre esta:

1. ADRs em `docs/adr/`
2. Documentação oficial em `docs/`
3. Código existente no repositório
4. Pedido atual do utilizador
5. Contexto da conversa

Se existir conflito entre estas fontes, a IA deve parar, explicar o conflito e esperar aprovação.

## Princípios

- Nunca assumir contexto apenas a partir do chat.
- A documentação do projeto prevalece sobre histórico de conversas.
- A arquitetura tem prioridade sobre velocidade.
- Cada alteração deve respeitar a fase atual do projeto.
- Nenhuma implementação deve começar sem análise prévia.
- Alterações pequenas são preferíveis a refactors grandes.
- O repositório é a fonte operacional do projeto.

## Ordem obrigatória de leitura

Antes de propor ou escrever código, a IA deve ler:

1. `README.md`
2. `docs/AI_WORKFLOW.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PHASES.md`
5. ADRs relevantes em `docs/adr/`
6. Documentação da fase atual, quando existir
7. Ficheiros diretamente relacionados com a tarefa

Nunca começar pela implementação.

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

Caso seja necessária uma alteração fora do âmbito, a IA deve parar e pedir aprovação.

## Git

A IA não deve executar automaticamente:

- `git add`
- `git commit`
- `git push`
- `git tag`
- merge de pull request

A IA pode sugerir comandos.
O utilizador decide quando executar.

Exceção: só pode alterar diretamente o GitHub quando o utilizador pedir explicitamente.

## ADRs

Toda decisão arquitetural relevante deve:

- consultar ADRs existentes
- evitar duplicação
- sugerir nova ADR quando a decisão for estrutural
- não contrariar ADRs aprovadas sem autorização

## Documentação

Sempre que uma alteração modificar arquitetura, workflow, estrutura do projeto ou processo de release, a IA deve indicar quais documentos precisam de ser atualizados.

Nunca assumir que a documentação continua correta depois de uma alteração estrutural.

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
