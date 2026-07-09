import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Queue } from 'bullmq';
import { QueueError } from '../../errors';
import type { QueueConfig } from '../../contracts';
import { BullMQQueueProducer } from './bullmq-queue-producer';

const addMock = vi.fn();
const closeQueueMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ disconnect: disconnectMock })),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => ({
    name,
    add: addMock,
    close: closeQueueMock,
  })),
}));

const config: QueueConfig = { redisUrl: 'redis://localhost:6379' };

describe('BullMQQueueProducer', () => {
  beforeEach(() => {
    addMock.mockReset();
    closeQueueMock.mockReset();
    disconnectMock.mockReset();
    vi.mocked(Queue).mockClear();
  });

  describe('add', () => {
    it('enfileira o job e devolve o id', async () => {
      addMock.mockResolvedValue({ id: 'job-1' });
      const producer = new BullMQQueueProducer(config);

      const result = await producer.add('ocr-processing', { storageObjectId: 'obj-1' });

      expect(result).toEqual({ id: 'job-1' });
      expect(addMock).toHaveBeenCalledWith(
        'ocr-processing',
        { storageObjectId: 'obj-1' },
        expect.objectContaining({ jobId: undefined, delay: undefined, attempts: undefined }),
      );
    });

    it('reutiliza a mesma fila BullMQ entre chamadas com o mesmo queueName', async () => {
      addMock.mockResolvedValue({ id: 'job-1' });
      const producer = new BullMQQueueProducer(config);

      await producer.add('ocr-processing', { a: 1 });
      await producer.add('ocr-processing', { a: 2 });

      expect(Queue).toHaveBeenCalledTimes(1);
    });

    it('mapeia falhas do BullMQ para QueueError', async () => {
      addMock.mockRejectedValue(new Error('redis down'));
      const producer = new BullMQQueueProducer(config);

      await expect(producer.add('ocr-processing', {})).rejects.toThrow(QueueError);
    });
  });

  describe('close', () => {
    it('fecha todas as filas criadas e desliga a ligação Redis', async () => {
      addMock.mockResolvedValue({ id: 'job-1' });
      closeQueueMock.mockResolvedValue(undefined);
      const producer = new BullMQQueueProducer(config);
      await producer.add('ocr-processing', {});

      await producer.close();

      expect(closeQueueMock).toHaveBeenCalledTimes(1);
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});
