/**
 * Sinais estruturais partilhados por mais do que um extractor —
 * propriedades genéricas de QUALQUER fatura portuguesa (nunca nomes de
 * empresa), extraídos para aqui só quando ganharam um segundo
 * consumidor real (Fase 6.12): `CUSTOMER_SECTION` nasceu dentro de
 * `SupplierExtractor` (Fase 6.8+, "SupplierExtractor scoring") e passa
 * a ser reutilizado também por `TaxNumberExtractor`, que sofria do
 * mesmo problema de fundo — confundir um valor do fornecedor com o
 * mesmo valor pertencente ao cliente — sem nunca ler o resultado de
 * outro extractor (`document-extraction.engine.ts` corre-os em paralelo
 * e independentes por desenho, ver ADR-0007): cada extractor aplica
 * este sinal ao seu próprio texto, de forma independente.
 */

/**
 * Indica que a linha pertence à secção do CLIENTE, não do fornecedor.
 * Inclui "LOCAL DE ENTREGA" (achado real, "JMV": secção de morada de
 * entrega duplicada, com o nome do cliente repetido) e "MORADA DE
 * ENVIO" (achado real, "Coca-Cola").
 */
export const CUSTOMER_SECTION =
  /\b(?:CLIENTE|CUSTOMER|EXMO|BILL\s*TO|SOLD\s*TO|MORADA\s*DE\s*ENVIO|LOCAL\s*DE\s*ENTREGA)\b/i;
