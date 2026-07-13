import type { DocumentExtractor } from '../../document-extraction';
import type { FiscalField } from '../types';

/**
 * Especialização de `DocumentExtractor` (motor genérico,
 * `apps/frontrest/api/src/document-extraction/`, Fase 6.10) para o campo
 * `FiscalField` — sem conhecimento de OCR, storage ou dos outros
 * extractors. Cada extractor é independente: recebe o texto OCR
 * completo, devolve `null` quando não encontra nada, nunca lança para
 * "não encontrado" (só para erros de programação reais). Novo extractor
 * = nova classe que implementa isto + um valor novo em `FiscalField`
 * (dois extractors podem partilhar o mesmo `field` — o motor genérico
 * fica com o de maior confiança, nunca "o último a correr"; é assim que
 * um extractor por país, ou um extractor de IA, conviveria com um
 * extractor regex para o mesmo campo).
 *
 * `extract()` é assíncrono — cobre tanto os 9 extractors regex/
 * heurísticos de hoje (síncronos na lógica, só embrulhados numa
 * `Promise` já resolvida, sem custo real) como um futuro extractor de IA
 * (via `@frontcore/ai`) ou modelo local com I/O real. Nenhum extractor
 * de IA é implementado nesta fase — só a assinatura está preparada, para
 * o dia em que existir um não exigir tocar nos 9 extractors existentes
 * nem no motor genérico outra vez.
 */
export type FiscalExtractor<T> = DocumentExtractor<FiscalField, T>;
