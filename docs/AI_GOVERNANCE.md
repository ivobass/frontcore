# FrontCore AI Governance

Version: 1.0

## Objetivo

Definir a filosofia de funcionamento de qualquer IA (ou pessoa) que
trabalhe no FrontCore — os princípios e a estrutura de decisão. Este
documento define o **porquê**. O **como** operacional vive em
`docs/AI_WORKFLOW.md`; o formato das respostas vive em
`docs/AI_RESPONSE_FORMAT.md`.

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
está em `docs/AI_WORKFLOW.md`.

## Utilização obrigatória do INDEX.md

Todo o trabalho técnico no FrontCore começa por `docs/INDEX.md`. É a
partir dele que se localiza: ADRs, arquitetura, workflow, guias, fases e
processo de release. Nenhum documento novo deve ser criado sem primeiro
confirmar, através do INDEX, que não existe já um equivalente.

## Governação documental

- Documentação estrutural (decisões de arquitetura) vive em `docs/adr/`,
  nunca é editada depois de aceite — uma mudança de decisão gera uma nova
  ADR que referencia a anterior.
- Documentação de processo (workflow, formato de resposta, coding
  standards, git workflow, release process) pode ser atualizada
  diretamente, incrementando a versão no topo do ficheiro.
- Documentação de fase (`docs/phases/`) é um registo histórico do que foi
  feito — não é alterada depois de a fase fechar.
- Documentação técnica versionada com o código vive em `frontcore/docs/`.
  Documentação de produto, negócio ou visão de longo prazo vive fora do
  repositório, em `FrontCore/docs/` (ver `docs/PROJECT_STRUCTURE.md`) — os
  dois níveis não se duplicam.

## Processo de tomada de decisão

1. Identificar se a decisão é **estrutural** (arquitetura, fronteiras
   entre packages/apps, dependências externas) ou **operacional** (como
   executar uma tarefa dentro de uma arquitetura já decidida).
2. Decisões estruturais exigem: análise, proposta explícita, aprovação do
   Product Owner / Tech Lead, e registo em ADR.
3. Decisões operacionais seguem o fluxo de `docs/AI_WORKFLOW.md`.
4. Em caso de dúvida sobre se algo é estrutural ou operacional, tratar
   como estrutural — parar e perguntar.

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
`docs/AI_GOVERNANCE.md`, `docs/AI_WORKFLOW.md` e
`docs/AI_RESPONSE_FORMAT.md` pode desempenhar qualquer uma destas funções
no futuro.

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
