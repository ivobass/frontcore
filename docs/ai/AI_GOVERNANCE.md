# FrontCore AI Governance

Version: 1.3

## Objetivo

Definir a filosofia de funcionamento de qualquer IA (ou pessoa) que
trabalhe no FrontCore — os princípios e a estrutura de decisão. Este
documento define o **porquê**. O **como** operacional vive em
`docs/ai/AI_WORKFLOW.md`; o formato das respostas vive em
`docs/ai/AI_RESPONSE_FORMAT.md`; como escrever prompts e documentação
vivem em `docs/ai/AI_PROMPT_STANDARD.md` e `docs/ai/AI_DOCUMENTATION.md`
— ver `docs/ai/README.md` para o mapa completo desta pasta.

## Princípios

- A documentação é a Source of Truth do projeto — não a memória de
  nenhuma IA, não o histórico de conversas.
- Nenhuma IA é considerada fonte de verdade. Nenhum modelo específico tem
  autoridade sobre a documentação — a autoridade está no documento, não em
  quem o escreveu ou interpretou.
- A arquitetura tem prioridade sobre velocidade de entrega.
- Trocar de ferramenta de IA não deve exigir reaprender o projeto do
  zero — a documentação garante continuidade.
- Cada decisão estrutural fica registada, não só implementada.

## Source of Truth

A documentação oficial em `frontcore/docs/` prevalece sempre sobre:

- memória ou suposições de qualquer IA;
- histórico de conversas anteriores;
- convenções aprendidas noutros projetos.

`docs/INDEX.md` é o ponto de entrada único e obrigatório para navegar essa
documentação.

## Documentação prevalece sobre memória

Sempre que exista conflito entre o que uma IA "acha que sabe" (de
conversas anteriores, de outros projetos, ou de suposições) e o que a
documentação oficial diz, a documentação vence. Se a documentação parecer
estar errada ou desatualizada, a IA não a corrige silenciosamente —
assinala o conflito e pede validação. O procedimento concreto para isto
está em `docs/ai/AI_WORKFLOW.md`.

## Utilização obrigatória do INDEX.md

Todo o trabalho técnico no FrontCore começa por `docs/INDEX.md`. É a
partir dele que se localiza: ADRs, arquitetura, workflow, guias, fases e
processo de release. Nenhum documento novo deve ser criado sem primeiro
confirmar, através do INDEX, que não existe já um equivalente.

## Documentação

As regras de governação documental (o que é ADR, o que é fase, onde vive
cada tipo de documento, como evitar duplicação entre `frontcore/docs/` e
`FrontCore/docs/`) estão consolidadas em `docs/ai/AI_DOCUMENTATION.md`,
para não se repetirem em mais do que um sítio.

## Camadas da documentação de IA

A documentação em `docs/ai/` organiza-se em três camadas conceptuais:

- **Filosofia** — explica *porquê* as regras existem.
- **Processo** — explica *como* trabalhar dentro dessa filosofia.
- **Especificações** — definem regras técnicas concretas e formatos
  (de resposta, de pedido, de documentação, de qualidade).

Esta separação existe para que cada camada evolua de forma independente
— alterar como um pedido é formulado não deve exigir alterar a filosofia
nem o formato de resposta, e vice-versa — e para preparar o FrontCore
para um ecossistema com múltiplos agentes especializados (Backend,
Frontend, DevOps, QA, Documentation, Security, ...), onde é esperado que
todos partilhem a mesma Filosofia e o mesmo Processo, mas cada um possa
vir a ter Especificações próprias.

A classificação de qual documento pertence a qual camada vive em
`docs/ai/README.md` — não repetida aqui, para não haver duas fontes da
mesma taxonomia.

## Processo de tomada de decisão

1. Identificar se a decisão é **estrutural** (arquitetura, fronteiras
   entre packages/apps, dependências externas) ou **operacional** (como
   executar uma tarefa dentro de uma arquitetura já decidida).
2. Decisões estruturais exigem: análise, proposta explícita, aprovação do
   Product Owner / Tech Lead, e registo em ADR.
3. Decisões operacionais seguem o fluxo de `docs/ai/AI_WORKFLOW.md`.
4. Em caso de dúvida sobre se algo é estrutural ou operacional, tratar
   como estrutural — parar e perguntar.

## Execution Mode

A fase de arquitetura, governação, documentação, workflows, ADRs e
foundation do FrontCore atingiu maturidade suficiente. O objetivo do
projeto deixou de ser desenhar a plataforma — passou a ser construí-la.
A partir de agora, qualquer IA, programador ou equipa que trabalhe no
FrontCore opera em **Execution Mode**: entrega contínua de
funcionalidades tem prioridade sobre exploração arquitetural adicional.

Distribuição de esforço esperada:

- **90%** — implementação, funcionalidades, integração, testes,
  correção de bloqueios, fecho de fases.
- **10%** — documentação, refactoring, arquitetura, melhorias futuras.

Princípio de fundo: não continuar a planear funcionalidades enquanto a
base ainda não estiver concluída — primeiro terminar o produto, depois
melhorá-lo.

Execution Mode não suspende nenhum princípio já definido neste
documento — a documentação continua Source of Truth, e decisões
genuinamente estruturais continuam a exigir análise, proposta explícita
e aprovação (secção anterior). O que muda é o **filtro anterior a essa
classificação**: uma ideia arquitetural só chega a ser avaliada como
estrutural/operacional se passar primeiro pelo teste de necessidade
imediata. Aplicação operacional concreta — incluindo a pergunta
obrigatória a fazer antes de propor qualquer alteração fora do âmbito
já aprovado, e os únicos motivos válidos para interromper uma
implementação em curso — vive em `docs/ai/AI_WORKFLOW.md`, secção
"Execution Mode — quando interromper".

## Estrutura da equipa

| Função | Responsabilidade |
|---|---|
| Product Owner / Tech Lead | Decide âmbito, aprova decisões estruturais, árbitro final em caso de conflito |
| AI Architecture & Governance Assistant | Analisa arquitetura, propõe ADRs, mantém a documentação coerente |
| AI Repository Engineering & Implementation Assistant | Implementa o que foi aprovado, executa validações, mantém o repositório funcional |

**Nota:** atualmente estas funções são desempenhadas por ChatGPT
(Architecture & Governance) e Claude (Repository Engineering &
Implementation). Esta documentação não deve depender de nenhum modelo de
IA específico para continuar válida — qualquer assistente que siga
`docs/ai/AI_GOVERNANCE.md`, `docs/ai/AI_WORKFLOW.md` e
`docs/ai/AI_RESPONSE_FORMAT.md` pode desempenhar qualquer uma destas
funções no futuro.

## Boas práticas

- Preferir alterações pequenas, explicáveis numa frase.
- Nunca misturar fases ou áreas não relacionadas na mesma alteração.
- Documentar o "porquê", não só o "o quê".
- Validar sempre antes de considerar uma tarefa concluída.

## Escalabilidade futura

Esta governação foi desenhada para escalar para múltiplos produtos
(FrontRest, FrontClinic, FrontHotel, FrontGym, FrontERP, ...) e para
qualquer número de colaboradores humanos ou assistentes de IA, presentes
ou futuros. À medida que a equipa crescer, novas funções podem ser
adicionadas à tabela acima sem alterar os princípios definidos neste
documento.
