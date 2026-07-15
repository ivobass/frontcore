import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch, SupplierExtraction } from '../types';
import { FiscalField } from '../types';

const SUPPLIER_LABEL = /(?:fornecedor|emitente|supplier|vendor|issued\s*by)\s*[:.\-]\s*([^\n]{2,80})/i;

/**
 * Comprimento mínimo para um nome de fornecedor ser considerado válido —
 * achado real (validação manual, "Farmácia Esperança", execução com
 * ruído de OCR): tanto o rótulo explícito como o fallback sem rótulo
 * aceitavam qualquer texto não vazio, incluindo fragmentos de 1-2
 * caracteres claramente inválidos como nome de empresa (ex. "To",
 * resultado de OCR a cortar "Total" ou similar). Nenhum fornecedor real
 * português tem um nome de 1-2 caracteres — o limite é deliberadamente
 * genérico (aplica-se a qualquer fornecedor, não a um caso específico).
 */
const MIN_SUPPLIER_NAME_LENGTH = 3;

/**
 * Sinais estruturais usados pelo sistema de scoring do fallback (sem
 * rótulo explícito) — Fase 6.8+ ("SupplierExtractor scoring"). Nenhum
 * destes sinais nomeia uma empresa concreta: são propriedades genéricas
 * de QUALQUER cabeçalho de fatura português (sufixo de entidade legal,
 * proximidade a NIF/telefone/morada, repetição no documento). Ver
 * `extractSupplierCandidate()` para a lógica de combinação.
 */
const LEGAL_SUFFIX = /\b(?:LDA|L\.DA|S\.?A\.?|UNIPESSOAL|SOCIEDADE)\b/i;
const NIF_LABEL = /\b(?:NIF|NIPC|CONTRIBUINTE|N[.º°o]?\s?CONTRIB)\b/i;
const PHONE_LABEL = /\b(?:TEL\.?|TELEFONE|TLM)\b/i;
const ADDRESS_LABEL = /\b(?:MORADA|RUA|SEDE|AV\.|AVENIDA|ESTRADA|QTA\.?|QUINTA)\b/i;
/** Código postal português (####-###) — sinal de morada mais fiável do que só palavras-chave, nem sempre presentes (achado real: "Pingo Doce"). */
const POSTAL_CODE = /\b\d{4}-\d{3}\b/;
/**
 * Indica que a linha pertence à secção do CLIENTE, não do fornecedor —
 * penaliza candidatos vizinhos. Inclui "LOCAL DE ENTREGA" (achado real,
 * "JMV": secção de morada de entrega duplicada, com o nome do cliente
 * repetido, que sem isto competiria com o fornecedor real via o sinal
 * de repetição abaixo).
 */
const CUSTOMER_SECTION = /\b(?:CLIENTE|CUSTOMER|EXMO|BILL\s*TO|SOLD\s*TO|MORADA\s*DE\s*ENVIO|LOCAL\s*DE\s*ENTREGA)\b/i;
/** Nunca um nome de fornecedor válido, mesmo que sobreviva aos outros filtros — código ATCUD ou uma data solta no início da linha. */
const DISQUALIFY_LINE = /^atcud\b|^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/i;

function isMostlyDigits(line: string): boolean {
  const letters = (line.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  const digits = (line.match(/\d/g) ?? []).length;
  return digits > 0 && digits >= letters;
}

/** Prefixo normalizado (maiúsculas, sem pontuação) usado só para detetar repetição da mesma linha noutro ponto do documento — nunca para alterar o valor devolvido. */
function normalizedPrefix(line: string): string {
  return line
    .toUpperCase()
    .replace(/[^A-Z0-9À-Ú& ]/g, '')
    .trim()
    .slice(0, 14);
}

interface SupplierCandidate {
  line: string;
  score: number;
  index: number;
}

/**
 * Pontua UMA linha candidata a nome de fornecedor, combinando sinais
 * estruturais em vez de assumir "a primeira linha é sempre o
 * fornecedor". Pesos calibrados empiricamente contra 6 documentos reais
 * (Pingo Doce, JMV, Ovos Girão, Dismade, Coca-Cola, Farmácia Esperança)
 * — cada peso existe para resolver um caso real, documentado inline:
 *
 * - `LEGAL_SUFFIX` (+25): o sinal mais forte — "LDA"/"S.A."/etc. é
 *   quase exclusivo do nome da entidade emissora.
 * - `near-nif`/`near-phone`/`near-address` (+15/+10/+10): o cabeçalho
 *   do fornecedor tende a agrupar nome + NIF + morada + telefone num
 *   bloco compacto (janela de 2 linhas antes/depois).
 * - `near-customer-section` (-30): penaliza linhas perto de marcadores
 *   da secção do CLIENTE — mas só nos VIZINHOS, nunca na própria linha
 *   candidata (achado real, "Ovos Girão": OCR de layout em duas colunas
 *   funde "NUNES & FREITAS, LDA" (fornecedor) e "Exmo.(s) Sr.(s)"
 *   (início da secção do cliente) numa única linha de texto — penalizar
 *   a própria linha rejeitaria o fornecedor real).
 * - `early` (+5): o nome do fornecedor costuma estar perto do topo.
 * - `repeated` (+8): nomes de fornecedor tendem a repetir-se no
 *   documento (ex. cópias duplicadas de talão) — peso deliberadamente
 *   baixo (tie-breaker, não sinal dominante), porque nomes de CLIENTE
 *   também podem repetir-se (achado real, "JMV": nome do cliente
 *   repete-se no cabeçalho e numa secção de morada de entrega
 *   duplicada; um peso demasiado alto fá-lo-ia vencer indevidamente o
 *   sinal, mais forte e único, de proximidade a NIF do fornecedor real).
 */
function scoreLine(lines: string[], index: number): SupplierCandidate | null {
  const line = lines[index];
  if (line.length < MIN_SUPPLIER_NAME_LENGTH) return null;
  if (DISQUALIFY_LINE.test(line)) return null;
  if (isMostlyDigits(line)) return null;

  let score = 40;

  if (LEGAL_SUFFIX.test(line)) score += 25;

  const windowStart = Math.max(0, index - 2);
  const windowEnd = Math.min(lines.length, index + 3);
  const window = lines.slice(windowStart, windowEnd).join(' ');
  const neighborWindow = [...lines.slice(windowStart, index), ...lines.slice(index + 1, windowEnd)].join(' ');

  if (NIF_LABEL.test(window)) score += 15;
  if (PHONE_LABEL.test(window)) score += 10;
  if (ADDRESS_LABEL.test(window) || POSTAL_CODE.test(window)) score += 10;
  if (CUSTOMER_SECTION.test(neighborWindow)) score -= 30;
  if (index < 5) score += 5;

  const prefix = normalizedPrefix(line);
  if (prefix.length >= 6 && lines.some((other, i) => i !== index && normalizedPrefix(other) === prefix)) {
    score += 8;
  }

  return { line, score, index };
}

/** Melhor candidato do documento inteiro — maior pontuação; empate resolvido pela linha que surge primeiro. */
function bestSupplierCandidate(ocrText: string): SupplierCandidate | null {
  const lines = ocrText.split('\n').map((line) => line.trim());
  const candidates: SupplierCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const candidate = scoreLine(lines, i);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0] ?? null;
}

/**
 * Mapeia a pontuação bruta do scoring (tipicamente 10-100) para uma
 * confiança 0-100 — reflete quantos sinais concordam (nome + NIF + LDA
 * + telefone + morada → confiança alta), nunca um valor fixo (Fase
 * 6.8+, objetivo explícito: "não quero um valor fixo de 40%"). Limitada
 * a 80 no topo para nunca igualar/exceder a confiança de um rótulo
 * explícito ("Fornecedor:", 85) — inferir sem rótulo é sempre menos
 * seguro do que ler um rótulo.
 */
function scoreToConfidence(score: number): number {
  return Math.max(25, Math.min(80, score));
}

/**
 * Extrai o nome do fornecedor. Com rótulo explícito ("Fornecedor:"),
 * confiança fixa alta (o rótulo já é, por si só, forte evidência). Sem
 * rótulo, usa um sistema de scoring multi-sinal (`bestSupplierCandidate`)
 * — nunca uma lista de empresas conhecidas, nunca hardcode por
 * fornecedor: os mesmos sinais estruturais (sufixo legal, proximidade a
 * NIF/telefone/morada, posição, repetição) aplicam-se a qualquer
 * fornecedor, de uma farmácia a um posto de combustível.
 */
@Injectable()
export class SupplierExtractor implements FiscalExtractor<SupplierExtraction> {
  readonly field = FiscalField.SUPPLIER;

  async extract(ocrText: string): Promise<ExtractionMatch<SupplierExtraction> | null> {
    const labelMatch = ocrText.match(SUPPLIER_LABEL);
    if (labelMatch) {
      // Rótulo explícito encontrado mas o valor é demasiado curto para
      // ser um nome real — sinal mais forte do que "sem rótulo", por
      // isso devolve null diretamente em vez de tentar o fallback
      // abaixo (que, sem esta guarda, apanharia a própria linha do
      // rótulo rejeitado, ex. "Fornecedor: To", como se fosse válida).
      const name = labelMatch[1].trim();
      return name.length >= MIN_SUPPLIER_NAME_LENGTH
        ? { value: { name }, confidence: 85, source: labelMatch[0].trim() }
        : null;
    }

    const candidate = bestSupplierCandidate(ocrText);
    return candidate
      ? { value: { name: candidate.line }, confidence: scoreToConfidence(candidate.score), source: candidate.line }
      : null;
  }
}
