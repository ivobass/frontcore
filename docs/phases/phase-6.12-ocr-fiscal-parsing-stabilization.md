# Fase 6.12 — OCR & Fiscal Parsing Stabilization

## Objetivo

Estabilizar o pipeline determinístico completo — OCR (rasterização,
pré-processamento de imagem, Tesseract) → normalização de texto →
extractors fiscais → `FiscalExtractionResult` → Invoice Draft Review UI
— sem introduzir nenhum consumidor de IA. Este trabalho consolida um
conjunto de correções e endurecimentos já presentes no `main` desde o
commit que fechou a Fase 6.11 (ver "Estado anterior", abaixo), que
nunca tinham sido formalmente auditados nem documentados como fase
própria.

## Âmbito

Auditoria e correção do delta entre `v0.6.10-document-extraction-foundation`
e o estado atual, fora de `packages/ai`: `packages/ocr` (pré-processamento
de imagem), `apps/frontrest/api/src/fiscal-parsing` (normalização,
extractors, coerência entre campos), `apps/frontrest/api/src/invoices/drafts`,
`apps/frontrest/api/src/suppliers` (correspondência por NIF), a
ferramenta de diagnóstico `/invoice-drafts/debug`. Fora do âmbito,
explicitamente: qualquer extractor de IA, integração de `@frontcore/ai`,
novo package, novo motor genérico de validação, promoção automática de
rascunhos, persistência de imagens rasterizadas.

## Estado anterior

O commit `cdb43f2` ("feat(ai): implement AI Provider Foundation (Phase
6.11)") foi criado com `git add .` a partir de uma árvore de trabalho
que continha, simultaneamente: o trabalho real da Fase 6.11
(`packages/ai`) e uma quantidade substancial de trabalho de
estabilização de OCR/parsing fiscal acumulado numa sessão anterior —
sem identidade de fase própria, sem documento, sem auditoria formal.
Confirmado por leitura direta do próprio documento da Fase 6.11
(`docs/phases/phase-6.11-ai-provider-foundation.md`), cujo âmbito
declarado é "só `packages/ai`", excluindo explicitamente qualquer
alteração a OCR, parsing fiscal, extractors, `InvoiceDraft`, frontend
ou fornecedores. A Fase 6.12 nasce para dar a esse trabalho a auditoria,
correção e identidade de fase que nunca teve.

## Alterações estabilizadas

### Pré-processamento de imagem OCR

`packages/ocr/src/providers/tesseract/preprocess-image.ts` — auditado,
já correto: `grayscale()` + `normalize()` + `median(3)` + `sharpen()`,
redimensionamento só nos extremos (`MIN_DIMENSION_PX`=1500,
`MAX_DIMENSION_PX`=2500), sempre aplicado (sem flag on/off — decisão
deliberada, não uma lacuna: o pré-processamento é best-effort e nunca
falha a extração, um interruptor não tem consumidor real a pedi-lo),
`try/catch` devolve o buffer original em caso de erro. Testes já
cobrem: formato de saída válido, conversão a escala de cinzentos,
ampliação/redução nos limites corretos, comportamento inalterado dentro
da gama de trabalho, fallback seguro para buffer não decodificável.
`OCR_LANGUAGE` alterado de `eng` para `por` (evidenciado: `eng` perde o
"Ç" de "ESPERANÇA"), `OCR_LANGUAGE`/`OCR_TIMEOUT_MS` corrigidos em
`docker-compose.yml` (faltavam no passthrough de variáveis de ambiente
para o Worker).

### Normalização de texto OCR

`ocr-normalize.ts` (`normalizeOcrDigits`/`DIGIT_LIKE_CLASS`) — troca
letra→dígito (`O`→0, `I`/`l`→1, `B`→8, `S`→5, `Z`→2) só em contexto
numérico já confirmado pelo chamador (NIF, datas), nunca em texto
livre. `ocr-tolerant-pattern.ts` (`tolerantWord`) — tolerância de
confusão de letras (T↔I/l/1/r, C↔G) só em palavras-chave marcadas
explicitamente pelo próprio chamador (maiúscula = letra com evidência
de confusão), reutilizado por `TotalsExtractor`. Nenhuma substituição
global indiscriminada existe em nenhum dos dois módulos — auditado e
confirmado.

### TaxNumberExtractor — correção de falso positivo real

**Problema real, confirmado em 3 documentos** (Coca-Cola, Ilha Pan,
Leroy): o extractor apanhava o NIF do CLIENTE em vez do fornecedor,
por dois motivos combinados — (a) `.match()` só considerava a primeira
ocorrência de um rótulo reconhecido no documento inteiro, sem qualquer
noção de a quem pertence; (b) o rótulo "Contribuinte"/"Contribuinte
N.º" (usado pelo fornecedor real em pelo menos 2 documentos) não
estava na lista de rótulos reconhecidos, forçando o único candidato
válido a ser sempre o do cliente.

**Correção implementada:**
- Rótulo "contribuinte" reconhecido, com separador flexível (até 10
  carateres não-dígito, preguiçoso — não guloso, para nunca consumir um
  prefixo de país como "PT" antes da captura) entre o rótulo e o valor.
- Dígito de controlo do NIF português (módulo 11) — `isValidTaxId`
  passa a validar o checksum real para NIFs de 9 dígitos, confirmado
  empiricamente contra 9 NIFs reais já validados nesta base de código.
  O NIF do cliente indevidamente apanhado no documento "Ilha Pan"
  (`511004949`) falha este checksum de forma independente — não é
  preciso nenhuma deteção de "é do cliente" para o descartar.
- `matchAll` em vez de `match` — considera todos os candidatos
  rotulados, descarta os estruturalmente inválidos (checksum), fica
  com o primeiro válido.

**Tentativa avaliada e descartada**: distinguir NIF do fornecedor do
NIF do cliente por proximidade a marcadores de secção do cliente
(reutilizando `CUSTOMER_SECTION`, já validado no `SupplierExtractor`).
Descartada depois de confirmar empiricamente que a mesma palavra
aparece, nestes documentos reais, em pelo menos três contextos que não
são a secção de identidade do cliente — uma linha de assinatura
("Recebi as mercadorias... O Cliente:"), texto legal genérico ("à
disposição do cliente"), e uma linha do próprio fornecedor fundida
pelo OCR com o início de uma saudação ao cliente — cada tentativa de
patch introduziu uma nova classe de falso positivo em vez de a
resolver. Ver "Limitações conhecidas".

### Coerência entre campos (nova capacidade desta fase)

`FiscalParsingService.applyCoherenceChecks()` — uma única verificação,
não um motor de regras genérico: `dueDate` anterior a `issueDate` nunca
é válido numa fatura real, e nenhum extractor pode detetar isto
sozinho por desenho (`runDocumentExtractors()` corre-os em paralelo,
cada um só vê `ocrText`, nunca o resultado de outro — ADR-0007). Quando
incoerente, `dueDate` é descartado (nunca `issueDate`, que já tem
validação própria mais forte). A remoção propaga corretamente a
`metadata.fieldsFound` e à confiança agregada — nunca fica "encontrado"
na metadata enquanto ausente do resultado final.

### Outras verificações de falsos positivos (auditadas, já corretas)

Confirmado empiricamente, sem alteração necessária: IBAN nunca
confundido com NIF nem número de fatura (rótulo obrigatório em ambos);
referência de pagamento nunca confundida com número de fatura;
subtotal/troco/valor pago nunca confundidos com o total (rótulo
específico tem prioridade); taxa de IVA estruturalmente limitada a
1-2 dígitos pelo próprio padrão de captura (nunca um valor de 3+
dígitos); nome do cliente nunca confundido com fornecedor no
`SupplierExtractor` (`CUSTOMER_SECTION`, Fase 6.8+); cabeçalhos
genéricos nunca aceites como nome de fornecedor (`DISQUALIFY_LINE`).

### Fornecedores — impedir NIF duplicado na mesma organização

`SuppliersService.assertTaxIdAvailable()` — impede dois fornecedores
com o mesmo NIF na mesma organização (verificação de aplicação, não
constraint `@@unique` no schema — dados de desenvolvimento já existentes
tinham duplicados). Justificação direta: a correspondência automática
de fornecedor por NIF (`resolveSupplierMatch()`, `apps/frontrest/web`)
assume no máximo um fornecedor por NIF; duplicados tornam essa
correspondência ambígua.

### Ferramenta de diagnóstico `/invoice-drafts/debug`

Auditada: autenticação e isolamento por organização herdados
corretamente (`SessionProvider` no layout `(dashboard)`, `findOne()`
do backend filtra sempre por `{ id, organizationId }` — um rascunho de
outra organização simplesmente não é encontrado). Estados de OCR
pendente/falhado/sem texto, upload indisponível e parsing sem
resultados já tratados com mensagens explícitas, nunca com um erro
não tratado. Sem dados sensíveis em logs. Testes de frontend já
cobrem os fluxos principais.

## Validação de coerência — decisões

Implementadas apenas as verificações com evidência real de
necessidade: `dueDate >= issueDate`. Avaliadas e não implementadas por
já estarem estruturalmente garantidas, sem necessidade de código novo:
- **Confiança sempre 0-100**: `aggregateConfidence` é uma média de
  valores já limitados por cada extractor; `matches.length === 0`
  devolve `0` explicitamente — nunca `NaN`.
- **Taxa de IVA plausível**: o próprio padrão de captura do
  `VatExtractor` limita a taxa a 1-2 dígitos (`\d{1,2}`) — um valor de
  3+ dígitos nunca chega sequer a ser capturado.
- **NIF normalizado**: já estabelecido (`normalizeOcrDigits`), agora
  reforçado com o dígito de controlo real (ver acima).

## Testes adicionados/corrigidos

- `tax-number.extractor.spec.ts`: rótulo "Contribuinte" (2 variantes),
  dígito de controlo válido/inválido, VAT de 10-12 dígitos sem
  checksum aplicado, desempate entre candidatos por validade
  estrutural. NIFs sintéticos preexistentes corrigidos para
  checksum-válidos (não alterava o que testavam, só o valor de
  fixture).
- `fiscal-parsing.service.spec.ts`: 4 testes novos de coerência
  `dueDate`/`issueDate`.
- `fiscal-parsing.document-types.spec.ts`: teste do rótulo
  "Contribuinte" atualizado de "limitação conhecida" para
  comportamento correto; nova categoria "nota de crédito" (total com
  sinal negativo — devolve `null`, comportamento seguro documentado,
  não um valor inventado).

## Resultados dos testes

- `pnpm typecheck` — limpo, 23/23 tarefas.
- `pnpm build` — limpo, 14/14 tarefas.
- `pnpm lint` — sem gate ativo (confirmado em `docs/quality/quality-gates.md`), 0 tarefas executadas, como esperado.
- `pnpm test` — limpo, 17/17 tarefas, 371 testes em `apps/frontrest/api`.
- `pnpm --filter @frontrest/api test:e2e` — ver validação Docker, abaixo.
- Validação Docker — ver secção própria.

## Limitações conhecidas

- **TaxNumberExtractor pode devolver o NIF do cliente quando é o único
  candidato estruturalmente válido do documento** (achado real,
  "Coca-Cola") — o checksum não distingue "de quem é" o NIF, só se é
  válido. Distinguir por proximidade a marcadores de secção do cliente
  foi avaliado e descartado nesta fase (ver "TaxNumberExtractor",
  acima) — precisa de mais evidência real antes de uma nova tentativa.
- **Notas de crédito com total de sinal negativo devolvem `null`** — o
  padrão de montante não reconhece o sinal negativo; comportamento
  seguro (nunca inventa um valor positivo errado), não implementado
  por falta de evidência real de um documento que precise disto.
- **IVA multi-taxa**: quando a fatura discrimina mais do que uma taxa
  de IVA, o extractor fica com a primeira linha da tabela — limitação
  já conhecida de fases anteriores, não alterada nesta fase.
- **Milhares separados por espaço** ("1 250,00€") não são reconhecidos
  como montante — limitação já conhecida, não alterada nesta fase.

## Observações para fases futuras

- **Problema encontrado**: `CreateSupplierDto`/`UpdateSupplierDto`
  validam o formato do NIF (9 dígitos) mas não o dígito de controlo,
  ao contrário do `TaxNumberExtractor` agora nesta fase.
  **Impacto**: inconsistência entre o que a extração fiscal aceita e o
  que a criação manual de fornecedores aceita. **Sugestão**: reutilizar
  o mesmo algoritmo de checksum num validador partilhado.
  **Prioridade**: Baixa.
- **Problema encontrado**: fixtures de documentos reais (texto OCR
  verbatim) estão duplicadas como constantes de string em mais do que
  um ficheiro de teste (`supplier.extractor.spec.ts`,
  `fiscal-parsing.service.spec.ts`). **Impacto**: risco de divergência
  silenciosa entre cópias do mesmo documento ao longo do tempo.
  **Sugestão**: consolidar num módulo de fixtures partilhado dentro de
  `fiscal-parsing/`. **Prioridade**: Média.
- **Problema encontrado**: não existe uma suite de regressão formal
  (golden-file) que compare `FiscalParsingService.parse()` contra um
  `baseline.json` fixo por documento real, corrida automaticamente em
  cada alteração. **Impacto**: cada correção ao motor de parsing
  continua a depender de validação manual documento-a-documento para
  detetar regressões — já provou, nesta e nas rondas anteriores,
  produzir o padrão "corrige-se um, parte-se outro" sem deteção
  automática. **Sugestão**: formalizar o padrão já usado ad-hoc nesta
  fase (fixtures de texto OCR congelado + `expected` por campo) numa
  suite permanente. **Prioridade**: Alta.
- **Problema encontrado**: Token Refresh — o frontend nunca chama o
  endpoint `POST /auth/refresh`, já implementado e completo no backend;
  ao fim de 15 minutos de inatividade (TTL do access token), qualquer
  pedido seguinte falha com "Token de acesso inválido ou expirado."
  sem recuperação automática. **Impacto**: sessão de trabalho
  interrompida em qualquer uso real do produto após uma pausa curta.
  **Sugestão**: `authFetch()` no frontend (detetar 401, `refresh` uma
  vez, repetir o pedido original uma vez), `SessionProvider` a expor
  atualização de sessão, singleton de promise partilhada entre
  separadores. **Prioridade**: Alta.

## Continuidade recomendada

Pela ordem: (1) Regression Test Suite formal, antes de qualquer nova
alteração ao motor de parsing; (2) Token Refresh, sem dependência
técnica do resto, mas de alto impacto diário; (3) Validation Layer
mais ampla, se surgir evidência real de necessidade além do já
implementado; (4) Supplier Resolution como camada própria, formalizando
`resolveSupplierMatch()`; (5) limpeza cosmética do `SupplierExtractor`
(aparar ruído da linha vencedora).
