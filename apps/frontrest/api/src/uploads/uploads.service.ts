import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ObjectStorage } from '@frontcore/storage';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from './object-storage.token';
import { DOWNLOAD_URL_TTL_SECONDS } from './constants';

export interface UploadFileInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * `key` é nula até o objeto ser guardado em storage (decisão arquitetural
 * da Fase 5.2 — evita placeholder/UUID intermédio). A nulidade fica
 * confinada a este serviço: nenhum outro módulo lê `key` diretamente.
 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async create(organizationId: string, input: UploadFileInput) {
    const pending = await this.prisma.storageObject.create({
      data: {
        organizationId,
        filename: input.filename,
        contentType: input.contentType,
        size: input.size,
      },
    });

    const key = `organizations/${organizationId}/uploads/${pending.id}`;
    await this.storage.put({ key, body: input.buffer, contentType: input.contentType });

    return this.prisma.storageObject.update({
      where: { id: pending.id },
      data: { key },
    });
  }

  async findOne(organizationId: string, id: string) {
    const object = await this.prisma.storageObject.findFirst({
      where: { id, organizationId, key: { not: null } },
    });
    if (!object || !object.key) {
      throw new NotFoundException('Objeto não encontrado.');
    }

    const downloadUrl = await this.storage.getDownloadUrl(
      object.key,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return { ...object, downloadUrl };
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const object = await this.prisma.storageObject.findFirst({
      where: { id, organizationId, key: { not: null } },
    });
    if (!object || !object.key) {
      throw new NotFoundException('Objeto não encontrado.');
    }

    await this.storage.delete(object.key);
    await this.prisma.storageObject.delete({ where: { id } });
  }
}
