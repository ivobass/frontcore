/**
 * Normalização de confusões de OCR comuns entre letras e dígitos —
 * módulo genérico, deliberadamente pequeno: não interpreta nenhum
 * documento nem decide o que é "correto", só troca carateres
 * visualmente confundíveis quando quem chama já sabe, pelo contexto
 * (um NIF, uma data), que o resultado tem de ser puramente numérico.
 *
 * Nunca aplicado ao texto OCR livre nem a valores que legitimamente
 * misturam letras e dígitos (ex. o corpo de um número de fatura,
 * "FR U006/47438") — sem uma regra fixa de "esta posição é sempre um
 * dígito" nesses casos, a troca arriscaria inventar um valor em vez de
 * o corrigir. Só usado por `TaxNumberExtractor` (NIF: sempre 9 dígitos)
 * e `parseFlexibleDate` (ano/mês/dia: sempre numéricos) — ver cada um
 * para a justificação específica.
 */

/**
 * Classe de carateres que substitui um dígito dentro de um padrão de
 * captura "solto" — usada nas regex que precisam de aceitar um destes
 * no lugar de um dígito antes da normalização decidir se, de facto, o
 * é. Inclui as mesmas letras de `normalizeOcrDigits` (`O`/`I`/`l`/`B`/
 * `S`/`Z`) — seguro só porque, em ambos os consumidores (NIF, datas),
 * o valor final é sempre validado como puramente numérico antes de
 * ser aceite; nunca usada para alargar a captura de um valor
 * alfanumérico legítimo (ex. o corpo de um número de fatura).
 */
export const DIGIT_LIKE_CLASS = '[0-9OoIlBSZ]';

/**
 * Substitui, carateres a caráter, letras visualmente confundíveis com
 * dígitos pelo dígito correspondente — `O`→`0`, `I`/`l`→`1`, `B`→`8`,
 * `S`→`5`, `Z`→`2`. Determinístico e sem heurística de "provavelmente"
 * — quem chama decide se o resultado ainda é válido (ex. continua a
 * ter o comprimento certo, continua a ser totalmente numérico) e
 * descarta se não for. Nunca inventa um dígito a partir de nada — só
 * troca um caráter já presente.
 */
export function normalizeOcrDigits(value: string): string {
  return value
    .replace(/O/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/B/g, '8')
    .replace(/S/g, '5')
    .replace(/Z/g, '2');
}
