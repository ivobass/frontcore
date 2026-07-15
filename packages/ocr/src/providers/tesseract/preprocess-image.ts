import sharp from 'sharp';

/**
 * Faixa de trabalho do Tesseract: abaixo disto a imagem é ampliada antes
 * do OCR (texto pequeno/baixo DPI perde traços finos e o LSTM erra mais);
 * acima disto é reduzida (imagens enormes só custam tempo, sem ganho de
 * precisão — o Tesseract já teve informação suficiente bem antes disto).
 * Intervalo alinhado com `OCR_PDF_MAX_DIMENSION_PX`
 * (`packages/ocr/src/contracts/ocr-config.ts`), que já limita o lado
 * PDF→PNG; aqui cobre também imagens enviadas diretamente (`image/jpeg`,
 * `image/png`), que nunca passam por esse limite.
 */
const MIN_DIMENSION_PX = 1500;
const MAX_DIMENSION_PX = 2500;

/**
 * Normaliza uma imagem antes de a entregar ao Tesseract — achado real
 * (validação manual, Fase 6.8+): o pipeline não tinha nenhum
 * pré-processamento, a imagem rasterizada (ou enviada diretamente) ia
 * para o OCR tal como chegava, sem escala de cinzentos, correção de
 * contraste, redução de ruído nem controlo de resolução. Em scans/fotos
 * reais de baixa qualidade isso produz erros de reconhecimento
 * concretos (dígitos trocados, acentos perdidos, nomes cortados).
 *
 * Escolhas deliberadamente conservadoras — o próprio Tesseract já faz
 * binarização adaptativa (Otsu) internamente, por isso este pipeline
 * não binariza (um threshold global fixo, aplicado antes, arriscaria
 * piorar documentos com iluminação irregular, o oposto do objetivo):
 * - `grayscale()` + `normalize()` — remove ruído de canal de cor e
 *   estica o contraste, sem decisões binárias.
 * - `median(3)` — reduz ruído tipo "sal e pimenta" comum em scans.
 * - `sharpen()` — compensa o ligeiro amaciamento do filtro de mediana e
 *   de uma eventual redução de escala.
 * - redimensionamento só nos extremos (`MIN_DIMENSION_PX`/
 *   `MAX_DIMENSION_PX`) — nunca amplia/reduz imagens já numa gama
 *   razoável.
 *
 * Nunca falha a extração por causa disto: qualquer erro aqui (buffer
 * não decodificável, formato inesperado) devolve o buffer original
 * inalterado — o pré-processamento é um reforço best-effort, nunca um
 * requisito para o OCR correr.
 */
export async function preprocessImageForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(buffer, { failOn: 'none' });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;

    let pipeline = image.grayscale().normalize();
    if (width > 0 && width < MIN_DIMENSION_PX) {
      pipeline = pipeline.resize({ width: MIN_DIMENSION_PX });
    } else if (width > MAX_DIMENSION_PX) {
      pipeline = pipeline.resize({ width: MAX_DIMENSION_PX });
    }
    pipeline = pipeline.median(3).sharpen();

    return await pipeline.png().toBuffer();
  } catch {
    return buffer;
  }
}
