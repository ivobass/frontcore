import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { preprocessImageForOcr } from './preprocess-image';

async function makeSolidImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
}

describe('preprocessImageForOcr', () => {
  it('devolve uma imagem PNG válida e decodificável a partir de uma imagem colorida válida', async () => {
    const input = await makeSolidImage(1800, 1200);

    const output = await preprocessImageForOcr(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeGreaterThan(0);
  });

  it('converte a imagem a escala de cinzentos (canais R/G/B com a mesma intensidade)', async () => {
    const input = await makeSolidImage(1800, 1200);

    const output = await preprocessImageForOcr(input);
    const stats = await sharp(output).stats();
    const [r, g, b] = stats.channels;

    expect(Math.abs(r.mean - g.mean)).toBeLessThan(1);
    expect(Math.abs(g.mean - b.mean)).toBeLessThan(1);
  });

  it('amplia imagens abaixo da largura mínima de trabalho do Tesseract', async () => {
    const input = await makeSolidImage(600, 400);

    const output = await preprocessImageForOcr(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBeGreaterThanOrEqual(1500);
  });

  it('reduz imagens acima da largura máxima de trabalho do Tesseract', async () => {
    const input = await makeSolidImage(4000, 3000);

    const output = await preprocessImageForOcr(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBeLessThanOrEqual(2500);
  });

  it('não altera imagens já dentro da gama de largura de trabalho', async () => {
    const input = await makeSolidImage(2000, 1400);

    const output = await preprocessImageForOcr(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(2000);
  });

  it('devolve o buffer original inalterado quando a imagem não é decodificável (best-effort, nunca falha a extração)', async () => {
    const input = Buffer.from('isto não é uma imagem válida');

    const output = await preprocessImageForOcr(input);

    expect(output).toBe(input);
  });
});
