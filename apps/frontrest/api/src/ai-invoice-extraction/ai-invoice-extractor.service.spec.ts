import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse } from '@frontcore/ai';
import { AiProviderError } from '@frontcore/ai';
import { AiInvoiceExtractor } from './ai-invoice-extractor.service';
import type { AiInvoiceExtractionV1 } from './types/ai-invoice-extraction';

const VALID_EXTRACTION: AiInvoiceExtractionV1 = {
  schemaVersion: '1',
  supplier: { name: 'Acme Distribuição Lda', taxId: '123456789' },
  invoice: { number: 'FA2026/1042', issueDate: '2026-03-05', dueDate: '2026-04-04', currency: 'EUR' },
  totals: { subtotal: '100.00', vatAmount: '23.00', total: '123.00' },
  items: [
    {
      position: 1,
      description: 'Farinha 25kg',
      quantity: '2',
      unit: 'saco',
      unitPrice: '18.50',
      vatRate: '23',
      totalPrice: '37.00',
    },
  ],
};

function fakeProvider(handler: (request: AiCompletionRequest) => AiCompletionResponse | Promise<AiCompletionResponse>): AiCompletionProvider {
  return {
    name: 'fake',
    complete: async (request) => handler(request),
  };
}

function rejectingProvider(error: unknown): AiCompletionProvider {
  return {
    name: 'fake',
    complete: async () => {
      throw error;
    },
  };
}

describe('AiInvoiceExtractor', () => {
  it('pede structured output numa única chamada, com o ocrText como mensagem de utilizador', async () => {
    let capturedRequest: AiCompletionRequest | undefined;
    const provider = fakeProvider((request) => {
      capturedRequest = request;
      return { content: JSON.stringify(VALID_EXTRACTION), provider: 'fake', model: 'fake-model' };
    });
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr da fatura');

    expect(capturedRequest?.responseFormat).toBeDefined();
    expect(capturedRequest?.messages).toHaveLength(2);
    expect(capturedRequest?.messages[0].role).toBe('system');
    expect(capturedRequest?.messages[1]).toEqual({ role: 'user', content: 'texto ocr da fatura' });
    expect(outcome.extraction).toEqual(VALID_EXTRACTION);
  });

  it('devolve metadata com provider/model/tokens/duração quando a chamada tem sucesso', async () => {
    const provider = fakeProvider(() => ({
      content: JSON.stringify(VALID_EXTRACTION),
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      usage: { inputTokens: 500, outputTokens: 120 },
    }));
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome.metadata).toMatchObject({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      inputTokens: 500,
      outputTokens: 120,
    });
    expect(outcome.metadata?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('ocrText vazio ou só espaços nunca chama o provider — devolve extraction/metadata null de imediato', async () => {
    const provider = fakeProvider(() => ({ content: '{}', provider: 'fake', model: 'fake' }));
    const completeSpy = jest.spyOn(provider, 'complete');
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('   ');

    expect(outcome).toEqual({ extraction: null, metadata: null });
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('resposta que não é JSON válido: nunca lança, devolve extraction null (metadata continua presente — a chamada em si teve sucesso)', async () => {
    const provider = fakeProvider(() => ({ content: 'isto não é JSON', provider: 'fake', model: 'fake' }));
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome.extraction).toBeNull();
    expect(outcome.metadata).not.toBeNull();
  });

  it('resposta JSON que não respeita o schema (schemaVersion errado): extraction null', async () => {
    const provider = fakeProvider(() => ({
      content: JSON.stringify({ ...VALID_EXTRACTION, schemaVersion: '2' }),
      provider: 'fake',
      model: 'fake',
    }));
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome.extraction).toBeNull();
  });

  it('AiProviderError do provider (ex. indisponível): nunca lança, devolve extraction/metadata null', async () => {
    const provider = rejectingProvider(new AiProviderError('Provider de IA indisponível.', 'provider_unavailable'));
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome).toEqual({ extraction: null, metadata: null });
  });

  it('unsupported_capability (Ollama sem structured output): nunca lança, tratado como IA indisponível', async () => {
    const provider = rejectingProvider(
      new AiProviderError('Este provider de IA não suporta structured output.', 'unsupported_capability'),
    );
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome).toEqual({ extraction: null, metadata: null });
  });

  it('erro inesperado, não-AiProviderError: também nunca lança', async () => {
    const provider = rejectingProvider(new Error('falha genérica'));
    const extractor = new AiInvoiceExtractor(provider);

    const outcome = await extractor.extract('texto ocr');

    expect(outcome).toEqual({ extraction: null, metadata: null });
  });
});
