# FrontCore AI Phase Template

Version: 1.0

## Objetivo

Template reutilizável para **pedir** uma fase nova — o formulário que o
utilizador preenche em vez de reescrever, de cada vez, o workflow, as
regras de aprovação, o formato de resposta e as regras de Git que já
vivem em `docs/ai/AI_BASE_PROMPT.md`. Este documento é a instância
concreta, para fases de desenvolvimento, da estrutura geral definida em
`docs/ai/AI_PROMPT_STANDARD.md`.

Não confundir com `docs/ai/templates/phase-closure.md` — esse é o
esqueleto do **resultado** (`docs/phases/phase-X.Y-*.md`, escrito pela
IA no fim da fase, descrevendo a arquitetura implementada). Este
documento é preenchido **antes**, para pedir a fase; o outro é
preenchido **depois**, para a registar. Os dois documentos existem em
tensão deliberada: o que se pede aqui deve ser reconhecível no que se
entrega ali.

## Como usar

1. Copiar as secções abaixo.
2. Preencher só o que muda nesta fase — não repetir nada que já esteja
   em `docs/ai/AI_BASE_PROMPT.md` (workflow, aprovações, Git, formato de
   resposta). Se o prompt referenciar esse documento explicitamente
   (ex. "segue `docs/ai/AI_BASE_PROMPT.md`"), essas regras aplicam-se
   sem precisar de serem reescritas.
3. Enviar. O destinatário lê `docs/INDEX.md` → `docs/ai/README.md` →
   este pedido preenchido, na ordem normal de leitura obrigatória.

---

## Nome

`Fase X.Y — Título curto`

## Objetivo

Uma ou duas frases: o que esta fase constrói, e porquê agora (que
capacidade fica desbloqueada).

## Contexto

- Fases já concluídas relevantes para esta (com tags, se existirem).
- Estado atual do que esta fase vai alterar ou construir sobre.
- Decisões anteriores que esta fase deve respeitar sem as reabrir (ex.
  "`InvoiceDraft` continua separado de `Invoice`, ver Fase 6.3").

## Requisitos

Lista concreta do que deve existir no final — modelos, serviços,
endpoints, componentes, comportamento observável. Específico o
suficiente para não deixar ambiguidade sobre o que "pronto" significa,
mas sem prescrever a implementação linha a linha (isso é trabalho da
fase de Análise/Planeamento, não do pedido).

## Fora do âmbito

Lista explícita do que esta fase **não** deve fazer — mesmo que pareça
relacionado ou tentador. Tipicamente inclui: a próxima fase óbvia,
alterações a áreas não relacionadas, otimizações prematuras, IA/ML
quando ainda não é a vez, alterações a contratos/modelos já estáveis.
Esta secção existe para o Execution Mode (`docs/ai/AI_BASE_PROMPT.md`,
secção 5) ter um limite claro contra o qual medir.

## Critérios de conclusão

Checklist verificável — cada item deve poder ser respondido com sim/não,
não com "parece bem". Exemplos: "testes unitários para X", "sem
alteração ao contrato de Y", "documentação da fase criada",
"typecheck/build/test limpos".

## Validações

Comandos concretos a correr antes de considerar a fase concluída —
tipicamente uma referência direta a `docs/ai/AI_RELEASE_CHECKLIST.md`,
mais validações específicas desta fase (ex. "validação real contra
Docker", "teste manual no browser de X").

## Documentação

Que documentos precisam de ser criados ou atualizados — tipicamente
`docs/phases/phase-X.Y-*.md` novo, mais `docs/PHASES.md`/`docs/INDEX.md`/
`docs/ARCHITECTURE.md` quando a fase os afeta. Ver
`docs/ai/AI_DOCUMENTATION.md` para as regras de escrita.

## Resultado esperado

O que a resposta final deve conter — tipicamente Modo Implementação
(`docs/ai/AI_RESPONSE_FORMAT.md`): objetivo, ficheiros alterados,
resumo, validação, próximo passo. Indicar aqui só o que for adicional
ou diferente do formato por omissão (ex. "incluir também uma tabela
comparativa de X").

---

## Exemplo preenchido (condensado)

Para comparação, um pedido de fase real antes e depois deste template
— o texto integral de "Workflow obrigatório", "Documentação utilizada"
e regras de Git deixa de ser necessário porque já está em
`docs/ai/AI_BASE_PROMPT.md`:

```text
# Fase 6.7 — Fiscal Parsing Draft Integration

Segue docs/ai/AI_BASE_PROMPT.md.

## Objetivo
Ligar o FiscalParsingService (Fase 6.6) ao InvoiceDraft: depois do
Worker OCR persistir ocrText, correr o parsing e propor os campos
extraídos ao utilizador antes de os gravar.

## Contexto
Fase 6.6 construiu o pipeline de extração, sem consumidor. Fase 6.5
já trata retry/estados do OCR. InvoiceDraft continua a única entidade
de staging (Fase 6.3) — sem alterar Invoice.

## Requisitos
- Endpoint que corre o parsing sobre o ocrText de um InvoiceDraft.
- Resultado devolvido ao cliente, não persistido automaticamente.
- ...

## Fora do âmbito
- Persistência automática dos campos extraídos.
- IA/LLM como fallback.
- Regras por país.

## Critérios de conclusão
- [ ] Endpoint testado (unitário + e2e).
- [ ] FiscalParsingService inalterado na sua API pública.
- [ ] ...

## Validações
Ver docs/ai/AI_RELEASE_CHECKLIST.md.

## Documentação
docs/phases/phase-6.7-*.md novo; PHASES.md/INDEX.md atualizados.
```

Note-se o que **não** está neste exemplo: nenhuma instrução sobre
"não fazer commit", nenhuma explicação de como apresentar resultados,
nenhuma lista de documentos a ler antes de começar — tudo isso já é
comportamento assumido por seguir `docs/ai/AI_BASE_PROMPT.md`.
