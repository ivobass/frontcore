import { Module } from '@nestjs/common';
import { loadStorageConfig, S3ObjectStorage } from '@frontcore/storage';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { OBJECT_STORAGE } from './object-storage.token';

/**
 * Único ponto de `apps/frontrest/api` que importa `S3ObjectStorage`
 * diretamente — `UploadsController`/`UploadsService` só conhecem o tipo
 * `ObjectStorage`, injetado via `OBJECT_STORAGE`.
 */
@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: OBJECT_STORAGE,
      useFactory: () => new S3ObjectStorage(loadStorageConfig()),
    },
  ],
  // Exportado para módulos consumidores de domínio (ex. Invoice
  // Attachments, Fase 5.3) reutilizarem UploadsService via DI — nenhum
  // outro módulo deve construir S3ObjectStorage diretamente.
  exports: [UploadsService],
})
export class UploadsModule {}
