import { runDocumentExtractors } from './document-extraction.engine';
import type { DocumentExtractor } from './contracts';
import type { ExtractionMatch } from './types';

type Field = 'a' | 'b';

function stubExtractor<T>(
  field: Field,
  match: ExtractionMatch<T> | null,
): DocumentExtractor<Field, T> {
  return { field, extract: async () => match };
}

describe('runDocumentExtractors', () => {
  it('devolve mapa vazio e metadata zerada quando não há extractors', async () => {
    const { matches, metadata } = await runDocumentExtractors<Field>([], 'texto qualquer');

    expect(matches.size).toBe(0);
    expect(metadata.extractorsRun).toEqual([]);
    expect(metadata.fieldsFound).toEqual([]);
    expect(metadata.textLength).toBe('texto qualquer'.length);
    expect(metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('ignora extractors que devolvem null, sem afetar os restantes', async () => {
    const { matches, metadata } = await runDocumentExtractors<Field>(
      [stubExtractor('a', null), stubExtractor('b', { value: 'x', confidence: 50 })],
      'texto',
    );

    expect(matches.has('a')).toBe(false);
    expect(matches.get('b')).toEqual({ value: 'x', confidence: 50 });
    expect(metadata.extractorsRun).toEqual(['a', 'b']);
    expect(metadata.fieldsFound).toEqual(['b']);
  });

  it('dois extractors no mesmo campo — vence o de maior confiança, independentemente da ordem de registo', async () => {
    const weak = stubExtractor('a', { value: 'FRACO', confidence: 30 });
    const strong = stubExtractor('a', { value: 'FORTE', confidence: 95 });

    const weakFirst = await runDocumentExtractors<Field>([weak, strong], 'texto');
    const strongFirst = await runDocumentExtractors<Field>([strong, weak], 'texto');

    expect(weakFirst.matches.get('a')).toEqual({ value: 'FORTE', confidence: 95 });
    expect(strongFirst.matches.get('a')).toEqual({ value: 'FORTE', confidence: 95 });
  });

  it('em empate exato de confiança, vence o primeiro extractor do array (regra determinística)', async () => {
    const first = stubExtractor('a', { value: 'PRIMEIRO', confidence: 80 });
    const second = stubExtractor('a', { value: 'SEGUNDO', confidence: 80 });

    const { matches } = await runDocumentExtractors<Field>([first, second], 'texto');

    expect(matches.get('a')?.value).toBe('PRIMEIRO');
  });

  it('fieldsFound não duplica o campo mesmo com dois extractors a alimentá-lo', async () => {
    const a = stubExtractor('a', { value: 'x', confidence: 50 });
    const b = stubExtractor('a', { value: 'y', confidence: 85 });

    const { metadata } = await runDocumentExtractors<Field>([a, b], 'texto');

    expect(metadata.fieldsFound).toEqual(['a']);
  });

  it('não lança para texto vazio', async () => {
    await expect(runDocumentExtractors<Field>([stubExtractor('a', null)], '')).resolves.toBeDefined();
  });
});
