import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExplainsRejection, RejectionExplanation } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';

// `\b` a seguir à palavra-chave — achado real (validação manual,
// "Coca-Cola"): sem fronteira de palavra, "fatura" casava dentro de
// "faturados" (frase legal genérica, "...os bens ora faturados foram
// entregues no seu adquirente..."), longe de qualquer rótulo de número
// real.
const KEYWORD = String.raw`(?:fatura|factura|invoice)\b`;

// Termos reservados — achado real (validação manual, "Dismade" e
// "Coca-Cola"): nunca fazem parte de um número de fatura genuíno,
// mesmo quando o resto do padrão (rótulo + separador) já foi
// satisfeito. Lista pedida explicitamente para generalizar este tipo
// de falso positivo — nunca uma correção por fornecedor.
const RESERVED_WORDS = [
  'data',
  'cliente',
  'adquirente',
  'contribuinte',
  'total',
  'valor',
  'morada',
  'telefone',
  'atcud',
  'entidade',
];
const RESERVED_PATTERN = RESERVED_WORDS.join('|');
const NOT_RESERVED = `(?!(?:${RESERVED_PATTERN})\\b)`;

// Sub-rótulo — "number"/"no." vêm antes da forma abreviada "n.º" para
// serem tentados primeiro; "(?![a-zA-Z])" a seguir a essa forma
// abreviada impede-a de casar só com o "N" inicial de "Number" (resto
// do grupo todo opcional). "no" exige pontuação imediatamente a seguir
// (nunca um espaço solto) — achado real (validação manual,
// "Coca-Cola"): sem essa exigência, "no" casava com a preposição
// portuguesa comum ("...entregues no seu adquirente..."), não com a
// abreviatura de "número".
const SUBLABEL = String.raw`(?:number|no\.?[:.\-#]|n\.?\s?[º°o]?\.?(?![a-zA-Z])|#)`;
const SEPARATOR = String.raw`[\s:.\-;#]*`;

// Candidato — nunca começa por um termo reservado (guarda dupla: no
// prefixo curto com espaço E no início do corpo sem espaço); prefixo
// de série com espaço exige 2-4 carateres (nunca 1 — ver achado real
// "N.t" → "t FR" nos comentários de versões anteriores deste
// ficheiro/git history) para nunca capturar ruído de OCR solto como
// prefixo de série válido.
const CANDIDATE = String.raw`${NOT_RESERVED}(?:[A-Z0-9]{2,4} ${NOT_RESERVED}[A-Z0-9][A-Z0-9/.\-]{1,20}|[A-Z0-9][A-Z0-9/.\-]{2,24})`;

// `(?!atcud\b)` — achado real (validação manual, "Farmácia Esperança"):
// faturas simplificadas portuguesas usam frequentemente o cabeçalho
// composto "Fatura Simplificada Nº ATCUD: XXXXXXXX-NNNNNNNN", onde
// "Nº" rotula o código ATCUD (autenticação do documento), não o número
// da própria fatura.
const WITH_SUBLABEL_PATTERN = new RegExp(
  `${KEYWORD}[^\\n]{0,20}?${SUBLABEL}${SEPARATOR}(?!atcud\\b)(${CANDIDATE})`,
  'i',
);

// Fallback sem sub-rótulo — achado real (validação manual, "JMV"):
// "Factura 1712156028" nunca tem "N.º"/"No"/"#" — o próprio número
// segue a palavra-chave diretamente. Só aceite quando o candidato
// começa por um DÍGITO (nunca uma letra) — nenhuma palavra portuguesa
// real começa por um dígito, por isso este padrão nunca arrisca
// capturar a próxima palavra comum da frase (ex. "Simplificada",
// "Recibo") como se fosse o número. Deliberadamente NÃO alargado para
// aceitar um prefixo de letras sem sub-rótulo (ex. "Factura FR
// U006/..." sem "N.º") — sem essa proteção do primeiro caráter, o
// risco de capturar uma palavra comum a seguir à palavra-chave é real
// e não há sub-rótulo a ancorar o candidato.
const BARE_DIGIT_FIRST_PATTERN = new RegExp(`${KEYWORD}\\s+(?!atcud\\b)(\\d[A-Z0-9/.\\-]{2,24})`, 'i');

// Padrão "solto" (sem as guardas de termos reservados) — usado só por
// `explainRejection()` para mostrar ao utilizador o que teria casado
// sem a proteção, nunca para decidir o resultado de `extract()`.
const LOOSE_CANDIDATE_PATTERN = new RegExp(
  `${KEYWORD}[^\\n]{0,20}?${SUBLABEL}${SEPARATOR}([A-Z0-9]{1,4} [A-Z0-9][A-Z0-9/.\\-]{1,20}|[A-Z0-9][A-Z0-9/.\\-]{2,24})`,
  'i',
);

/** Extrai o número/identificador da fatura (ex. "Fatura N.º FA2026/123", "Factura 1712156028"). */
@Injectable()
export class InvoiceNumberExtractor implements FiscalExtractor<string>, ExplainsRejection {
  readonly field = FiscalField.INVOICE_NUMBER;

  async extract(ocrText: string): Promise<ExtractionMatch<string> | null> {
    const withSublabel = ocrText.match(WITH_SUBLABEL_PATTERN);
    if (withSublabel) {
      return { value: withSublabel[1].trim(), confidence: 85, source: withSublabel[0].trim() };
    }

    // Confiança média — achado real ("JMV"): sem "N.º" a ancorar
    // explicitamente o candidato, o sinal é mais fraco (só a posição
    // "logo a seguir à palavra-chave" + "começa por dígito"), mesmo
    // sendo seguro o suficiente para aceitar.
    const bareDigitFirst = ocrText.match(BARE_DIGIT_FIRST_PATTERN);
    if (bareDigitFirst) {
      return { value: bareDigitFirst[1].trim(), confidence: 65, source: bareDigitFirst[0].trim() };
    }

    return null;
  }

  /** Só explica quando existiu de facto um candidato rejeitado — nunca para "não encontrei nada". */
  explainRejection(ocrText: string): RejectionExplanation | null {
    const loose = ocrText.match(LOOSE_CANDIDATE_PATTERN);
    if (!loose) {
      return null;
    }
    const candidate = loose[1].trim();
    if (/\batcud\b/i.test(candidate)) {
      return { candidate, reason: 'o candidato corresponde ao código ATCUD, não ao número da fatura' };
    }
    const reservedHit = RESERVED_WORDS.find((word) => new RegExp(`\\b${word}\\b`, 'i').test(candidate));
    if (reservedHit) {
      return { candidate, reason: `o candidato contém o termo reservado "${reservedHit}"` };
    }
    return { candidate, reason: 'o candidato não corresponde a uma estrutura de número de fatura válida' };
  }
}
