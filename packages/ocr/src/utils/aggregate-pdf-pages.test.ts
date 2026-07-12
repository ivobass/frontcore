import { describe, it, expect } from 'vitest';
import { aggregatePdfConfidence, aggregatePdfText, formatPageSeparator } from './aggregate-pdf-pages';

describe('formatPageSeparator', () => {
  it('formata o separador com o número da página', () => {
    expect(formatPageSeparator(1)).toBe('--- Página 1 ---');
    expect(formatPageSeparator(12)).toBe('--- Página 12 ---');
  });
});

describe('aggregatePdfText', () => {
  // 1 + 2. Uma página não recebe marcador; o 1º carácter útil é do texto OCR real.
  it('página única: sem marcador "Página 1" — só o texto OCR normalizado', () => {
    const text = aggregatePdfText([{ pageNumber: 1, text: 'Olá mundo', confidence: 90 }]);
    expect(text).toBe('Olá mundo');
    expect(text).not.toContain('Página 1');
    expect(text.startsWith('O')).toBe(true);
  });

  // 3. Duas páginas recebem apenas "--- Página 2 ---".
  it('duas páginas: só "--- Página 2 ---", nunca um marcador para a página 1', () => {
    const text = aggregatePdfText([
      { pageNumber: 1, text: 'Conteúdo A', confidence: 90 },
      { pageNumber: 2, text: 'Conteúdo B', confidence: 80 },
    ]);
    expect(text).toBe('Conteúdo A\n\n--- Página 2 ---\n\nConteúdo B');
    expect(text).not.toContain('Página 1');
  });

  // 4 + 5. Três páginas: "Página 2" e "Página 3", nunca "Página 1"; ordem preservada.
  it('três páginas: marcadores só a partir da 2ª, pela ordem certa', () => {
    const text = aggregatePdfText([
      { pageNumber: 1, text: 'Conteúdo A', confidence: 90 },
      { pageNumber: 2, text: 'Conteúdo B', confidence: 80 },
      { pageNumber: 3, text: 'Conteúdo C', confidence: 70 },
    ]);
    expect(text).toBe(
      'Conteúdo A\n\n--- Página 2 ---\n\nConteúdo B\n\n--- Página 3 ---\n\nConteúdo C',
    );
    expect(text).not.toContain('Página 1');
    expect(text.indexOf('Conteúdo A')).toBeLessThan(text.indexOf('Página 2'));
    expect(text.indexOf('Página 2')).toBeLessThan(text.indexOf('Conteúdo B'));
    expect(text.indexOf('Conteúdo B')).toBeLessThan(text.indexOf('Página 3'));
    expect(text.indexOf('Página 3')).toBeLessThan(text.indexOf('Conteúdo C'));
  });

  // 6. Sem quebras extra dependentes de o texto original terminar (ou não) em \n.
  it('normaliza a fronteira entre páginas — resultado idêntico com 0, 1 ou vários \\n finais', () => {
    const semNewline = aggregatePdfText([
      { pageNumber: 1, text: 'A', confidence: 90 },
      { pageNumber: 2, text: 'B', confidence: 80 },
    ]);
    const umNewline = aggregatePdfText([
      { pageNumber: 1, text: 'A\n', confidence: 90 },
      { pageNumber: 2, text: 'B\n', confidence: 80 },
    ]);
    const variosNewlines = aggregatePdfText([
      { pageNumber: 1, text: 'A\n\n\n', confidence: 90 },
      { pageNumber: 2, text: 'B\n\n\n\n', confidence: 80 },
    ]);

    expect(semNewline).toBe('A\n\n--- Página 2 ---\n\nB');
    expect(umNewline).toBe(semNewline);
    expect(variosNewlines).toBe(semNewline);
  });

  it('nunca remove quebras de linha internas do texto OCR', () => {
    const text = aggregatePdfText([
      { pageNumber: 1, text: 'Fornecedor: ACME\nNIF: 123', confidence: 90 },
      { pageNumber: 2, text: 'Linha 1\nLinha 2\n', confidence: 80 },
    ]);
    expect(text).toBe('Fornecedor: ACME\nNIF: 123\n\n--- Página 2 ---\n\nLinha 1\nLinha 2');
  });

  // 7. Página vazia não produz undefined/null/NaN.
  it('página única vazia: string vazia, nunca undefined/null/NaN', () => {
    const text = aggregatePdfText([{ pageNumber: 1, text: '', confidence: 0 }]);
    expect(text).toBe('');
  });

  it('página 2 vazia: marcador presente, sem lançar nem produzir valores inválidos', () => {
    const text = aggregatePdfText([
      { pageNumber: 1, text: 'Conteúdo A', confidence: 90 },
      { pageNumber: 2, text: '', confidence: 0 },
    ]);
    expect(text).toBe('Conteúdo A\n\n--- Página 2 ---\n\n');
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('várias páginas vazias: determinístico, sem undefined/null/NaN', () => {
    const text = aggregatePdfText([
      { pageNumber: 1, text: '', confidence: 0 },
      { pageNumber: 2, text: '', confidence: 0 },
      { pageNumber: 3, text: '', confidence: 0 },
    ]);
    expect(text).toBe('\n\n--- Página 2 ---\n\n\n\n--- Página 3 ---\n\n');
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('lista vazia produz string vazia', () => {
    expect(aggregatePdfText([])).toBe('');
  });
});

describe('aggregatePdfConfidence', () => {
  it('página única: confiança da própria página', () => {
    expect(aggregatePdfConfidence([{ pageNumber: 1, text: 'abc', confidence: 85 }])).toBe(85);
  });

  it('pondera pelo número de caracteres não vazios — não é a média simples', () => {
    // peso 1 vs peso 3 → (100*1 + 0*3) / 4 = 25, não (100+0)/2 = 50
    const confidence = aggregatePdfConfidence([
      { pageNumber: 1, text: 'a', confidence: 100 },
      { pageNumber: 2, text: 'abc', confidence: 0 },
    ]);
    expect(confidence).toBe(25);
  });

  it('página vazia (texto em branco) tem peso zero — não arrasta a média para baixo', () => {
    const confidence = aggregatePdfConfidence([
      { pageNumber: 1, text: 'texto real', confidence: 90 },
      { pageNumber: 2, text: '   ', confidence: 0 },
    ]);
    expect(confidence).toBe(90);
  });

  it('todas as páginas vazias → 0, nunca NaN', () => {
    const confidence = aggregatePdfConfidence([
      { pageNumber: 1, text: '', confidence: 0 },
      { pageNumber: 2, text: '   ', confidence: 0 },
    ]);
    expect(confidence).toBe(0);
  });

  it('lista vazia → 0', () => {
    expect(aggregatePdfConfidence([])).toBe(0);
  });

  it('resultado sempre dentro de 0–100 para entradas dentro de 0–100', () => {
    const confidence = aggregatePdfConfidence([
      { pageNumber: 1, text: 'a'.repeat(50), confidence: 100 },
      { pageNumber: 2, text: 'b'.repeat(50), confidence: 0 },
    ]);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
    expect(confidence).toBe(50);
  });
});
