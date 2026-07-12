# FrontCore AI Review Checklist

Version: 1.1

## Objetivo

Checklist arquitetural geral, para revisão crítica de qualquer código
do FrontCore antes de o considerar concluído — backend, infraestrutura,
produto. Generaliza, para todo o repositório, o que
`docs/ai/AI_QUALITY_REVIEW.md` já faz especificamente para
`packages/ui`; os dois documentos são irmãos, não concorrentes — usar
este para tudo fora do Design System, esse para `packages/ui`.

Nasceu da prática, não da teoria: consolida os critérios que já foram
aplicados, repetidamente e com sucesso, nas revisões arquiteturais das
Fases 6.5 e 6.6 (backoff/retry do OCR, pipeline de parsing fiscal) —
antes reconstruídos do zero em cada pedido de revisão, agora fixados
aqui para não terem de ser reexplicados.

## Como usar

Percorrer esta checklist **antes** de escrever a resposta em Modo
Revisão (`docs/ai/AI_RESPONSE_FORMAT.md`; esqueleto em
`docs/ai/templates/review.md`). Não é uma lista para citar
mecanicamente item a item na resposta — é o que gera as secções
"Problemas encontrados"/"Riscos"/"Recomendações" desse modo. Assumir o
papel de quem nunca viu o código: procurar problemas, não justificar
decisões já tomadas.

## Arquitetura

- A localização do código respeita a regra de ouro (`packages/*` sem
  domínio, `apps/*` com domínio) — e, quando não respeita
  literalmente, existe uma justificação escrita e proporcional (ver
  `docs/ai/AI_BASE_PROMPT.md`, secção 7)?
- As camadas (contratos/tipos/serviços/infraestrutura) estão separadas
  de forma que uma pudesse mudar sem obrigar a mudar as outras?
- Existe alguma dependência circular, direta ou por tipos?

## Acoplamento

- Um consumidor depende de um contrato/interface, ou de uma
  implementação concreta que devia estar escondida atrás de um token
  de injeção?
- Trocar uma peça (provider, extractor, estratégia) obriga a tocar em
  código que não devia saber da troca?
- Alguma classe tem mais parâmetros de construtor do que seria razoável
  a médio prazo (sinal de que falta um ponto de agregação — ver o
  padrão de token de coleção usado em
  `apps/frontrest/api/src/fiscal-parsing/fiscal-extractors.token.ts`)?

## Coesão

- Cada classe/módulo tem uma única razão para mudar (SRP)?
- Existe lógica que pertence claramente a outro sítio (ex. validação
  de negócio dentro de um controller, parsing dentro de um repositório)?

## Duplicação

- A mesma lógica, regra ou valor mágico aparece em mais do que um
  ficheiro? Se sim: vale a pena consolidar, ou consolidar pioraria
  outra coisa (ex. trocar regex literais por construção dinâmica só
  para eliminar 3 linhas repetidas)? Documentar a decisão nos dois
  sentidos — corrigir sempre que a duplicação for barata de eliminar
  sem perder clareza, aceitar e justificar quando não for.
- Existe um teste que já prova o mesmo que outro, sem cobrir nada
  adicional?

## YAGNI

- Alguma abstração, parâmetro ou camada existe sem nenhum consumidor
  real hoje? Se sim, é uma preparação explicitamente pedida (ex. um
  extractor de IA futuro) ou especulação não pedida?
- O código está a resolver um problema que só existiria com 20-30
  unidades da mesma coisa, quando hoje há 3? Vale a pena a
  complexidade agora, ou documentar a limitação e resolver quando o
  número real justificar?

## Packages

- Se este trabalho vive em `packages/*`: é genuinamente reutilizável
  por um produto FrontCore diferente de FrontRest, sem alterações?
- Se este trabalho vive em `apps/*` mas parece genérico: existe um
  segundo consumidor real a justificar mover para `packages/*`, ou é
  ainda YAGNI (ver acima)?

## Testes

- Os cenários realmente importantes estão cobertos: caminho feliz,
  entrada vazia/nula, o limite exato de uma condição (não só um valor
  bem dentro dela), dois casos a competir pelo mesmo resultado?
- Algum comportamento documentado (numa tabela, num comentário) nunca
  foi verificado por um teste?
- Os testes provam o comportamento real (contra o container de DI real,
  contra a regex real) ou só a intenção (construção manual que nunca
  passa pela wiring real)?
- Alguma regra "não deve acontecer X" (ex. duas escritas na mesma
  entidade, um extractor a mascarar outro) está só na cabeça de quem
  escreveu o código, sem teste a prová-la?

## Performance

- Existe algum caminho que faz I/O (BD, rede, ficheiro) dentro de um
  ciclo que não precisava?
- Alguma estrutura de dados escolhida (array vs. mapa, por exemplo)
  degrada com o crescimento realista do número de itens?

## Segurança

- Alguma mensagem de erro devolvida ao cliente expõe detalhe interno
  (stack trace, string de ligação, credencial, nome de host)?
- Multi-tenancy: todas as queries filtram por `organizationId`? Um
  identificador vindo de fora (job, payload, parâmetro de rota) é
  validado antes de ser confiado, ou usado diretamente numa query?
- Alguma validação de input está só no frontend, sem equivalente no
  backend?

## Documentação

- O documento da fase (`docs/phases/`) descreve o estado final, não o
  processo (ver `docs/ai/AI_DOCUMENTATION.md`)?
- Algum comentário no código afirma um comportamento que o código, tal
  como está agora, já não tem?
- Contagens de ficheiros/testes citadas na documentação foram
  confirmadas por execução real, não calculadas de cabeça?

## Consistência

- O código novo segue as convenções já estabelecidas no mesmo
  package/app (nomes, estrutura de pastas, padrão de DI, estilo de
  teste) — ou introduz uma variação sem razão técnica?
- Uma decisão tomada nesta revisão contradiz uma decisão já registada
  noutra fase? Se sim, isso é uma evolução consciente (nova ADR ou
  nota explícita) ou uma inconsistência não notada?

## Breaking changes

- Alguma mudança de assinatura, contrato ou tipo público quebra um
  consumidor existente?
- Se sim: é uma mudança aditiva (compatível) ou obriga a atualizar
  todos os consumidores no mesmo commit? Estão todos atualizados?

## Documentação atualizada

- [ ] Documento da fase (`docs/phases/phase-X.Y-*.md`) criado ou
      atualizado.
- [ ] `docs/PHASES.md` atualizado, se a fase mudou o roadmap.
- [ ] `docs/INDEX.md` atualizado, se foi criado ou movido algum
      documento.
- [ ] `docs/ARCHITECTURE.md` atualizado, se a arquitetura geral mudou.
- [ ] Nova ADR necessária? (decisão estrutural, irreversível ou difícil
      de mudar depois — ver `docs/adr/README.md`).
- [ ] Trabalho futuro/limitações conhecidas identificados e registados
      (ver `docs/ai/AI_BASE_PROMPT.md`, secção 15)?
- [ ] Melhorias encontradas durante esta revisão que não pertencem ao
      seu âmbito registadas em "Observações para fases futuras"
      (Problema encontrado / Impacto / Sugestão / Prioridade — ver
      `docs/ai/AI_BASE_PROMPT.md`, secção 16), não implementadas por
      conta própria?

## Relação com outros documentos

- `docs/ai/AI_QUALITY_REVIEW.md` — checklist irmã, específica de
  `packages/ui`.
- `docs/ai/templates/review.md` — esqueleto da resposta que esta
  checklist alimenta.
- `docs/ai/AI_RESPONSE_FORMAT.md` — Modo Revisão.
- `docs/ai/AI_RELEASE_CHECKLIST.md` — checklist de validação técnica
  (comandos), distinta desta (critérios arquiteturais).
