/**
 * Camada genérica de tolerância a confusões de OCR entre LETRAS — Fase
 * 6.8+ ("SupplierExtractor scoring"). Complementa `ocr-normalize.ts`
 * (que troca letras por dígitos em valores já capturados, contexto
 * numérico) com o problema inverso: tornar o RECONHECIMENTO de
 * palavras-chave conhecidas (rótulos, sufixos legais) tolerante a
 * letras trocadas, sem nunca alterar nem "corrigir" o texto capturado.
 *
 * Evidência real desta sessão (nunca especulação): "Total" → "lotal"/
 * "rotal" (T lido como l/r), "FARMACIA" → "FARMAGTA"/"FARMACTA" (C
 * lido como G, I lido como T). Cada grupo abaixo só existe porque foi
 * observado num documento real — alargar a lista exige o mesmo padrão
 * de evidência, nunca uma suposição de "pode acontecer".
 */
const CONFUSABLE_LETTER_GROUPS: Record<string, string> = {
  T: 'TIl1r',
  C: 'CG',
  I: 'ITl1',
};

/** Devolve a classe de carateres regex para `letter` — a própria letra sozinha se não houver confusão conhecida. */
function tolerantLetterClass(letter: string): string {
  const group = CONFUSABLE_LETTER_GROUPS[letter];
  return group ? `[${group}]` : letter;
}

/**
 * Constrói o fragmento de regex (string, para compor com `new RegExp()`)
 * que reconhece `word` tolerando confusões de OCR — só nas letras
 * escritas em MAIÚSCULA em `word`, que ficam substituídas pela classe
 * tolerante; as restantes (minúsculas) mantêm-se literais. Isto marca
 * explicitamente, no próprio texto do chamador, QUAL letra tem
 * evidência de confusão — ex. `tolerantWord('Total')` → `'[TIl1r]otal'`
 * (só o T inicial, que é o que foi observado em documentos reais;
 * o segundo "t" de "Total" fica literal por não haver essa evidência
 * nessa posição). Sempre usado para RECONHECER uma palavra-chave
 * (rótulo, sufixo legal), nunca para alterar um valor já capturado —
 * essa é sempre uma decisão arriscada de "inventar" texto, fora do
 * âmbito desta função.
 */
export function tolerantWord(word: string): string {
  return word
    .split('')
    .map((char) => (/[A-Z]/.test(char) ? tolerantLetterClass(char) : char))
    .join('');
}
