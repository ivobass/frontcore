import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Worker } from 'bullmq';
import type { QueueConfig } from '../../contracts';
import { BullMQQueueConsumer } from './bullmq-queue-consumer';

const closeWorkerMock = vi.fn();
const disconnectMock = vi.fn();
type FakeJob = { data: unknown; id?: string; attemptsStarted: number; opts: { attempts?: number } };
let capturedProcessor: ((job: FakeJob) => Promise<void>) | undefined;

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ disconnect: disconnectMock })),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((name: string, processor: typeof capturedProcessor) => {
    capturedProcessor = processor;
    return { name, close: closeWorkerMock };
  }),
}));

const config: QueueConfig = { redisUrl: 'redis://localhost:6379' };

describe('BullMQQueueConsumer', () => {
  beforeEach(() => {
    closeWorkerMock.mockReset();
    disconnectMock.mockReset();
    capturedProcessor = undefined;
    vi.mocked(Worker).mockClear();
  });

  describe('consume', () => {
    it('regista um Worker para a fila indicada', async () => {
      const consumer = new BullMQQueueConsumer(config);
      const handler = vi.fn().mockResolvedValue(undefined);

      consumer.consume('ocr-processing', handler);

      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(
        'ocr-processing',
        expect.any(Function),
        expect.objectContaining({ connection: expect.anything() }),
      );
    });

    it('invoca o handler com o payload e o id do job recebido pelo Worker', async () => {
      const consumer = new BullMQQueueConsumer(config);
      const handler = vi.fn().mockResolvedValue(undefined);
      consumer.consume<{ storageObjectId: string }>('ocr-processing', handler);

      await capturedProcessor!({
        data: { storageObjectId: 'obj-1' },
        id: 'job-1',
        attemptsStarted: 1,
        opts: { attempts: 3 },
      });

      expect(handler).toHaveBeenCalledWith(
        { storageObjectId: 'obj-1' },
        'job-1',
        { attemptNumber: 1, maxAttempts: 3 },
      );
    });

    it('deriva attemptNumber/maxAttempts diretamente de attemptsStarted/opts.attempts do Job — nunca uma contagem própria', async () => {
      const consumer = new BullMQQueueConsumer(config);
      const handler = vi.fn().mockResolvedValue(undefined);
      consumer.consume('ocr-processing', handler);

      await capturedProcessor!({ data: {}, id: 'job-2', attemptsStarted: 2, opts: { attempts: 5 } });

      expect(handler).toHaveBeenCalledWith({}, 'job-2', { attemptNumber: 2, maxAttempts: 5 });
    });

    it('assume maxAttempts 1 quando o job não tem `attempts` configurado', async () => {
      const consumer = new BullMQQueueConsumer(config);
      const handler = vi.fn().mockResolvedValue(undefined);
      consumer.consume('ocr-processing', handler);

      await capturedProcessor!({ data: {}, id: 'job-3', attemptsStarted: 1, opts: {} });

      expect(handler).toHaveBeenCalledWith({}, 'job-3', { attemptNumber: 1, maxAttempts: 1 });
    });

    it('propaga o erro do handler para o BullMQ gerir retries, sem o capturar', async () => {
      const consumer = new BullMQQueueConsumer(config);
      const handler = vi.fn().mockRejectedValue(new Error('processing failed'));
      consumer.consume('ocr-processing', handler);

      await expect(
        capturedProcessor!({ data: {}, id: 'job-1', attemptsStarted: 1, opts: { attempts: 3 } }),
      ).rejects.toThrow('processing failed');
    });
  });

  describe('close', () => {
    it('fecha todos os workers registados e desliga a ligação Redis', async () => {
      closeWorkerMock.mockResolvedValue(undefined);
      const consumer = new BullMQQueueConsumer(config);
      consumer.consume('ocr-processing', vi.fn());

      await consumer.close();

      expect(closeWorkerMock).toHaveBeenCalledTimes(1);
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});
