import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser, Roles, type AuthenticatedIdentity } from '@frontcore/auth';
import { UploadsService } from './uploads.service';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './constants';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Roles('MANAGER')
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES }),
          // skipMagicNumbersValidation: valida por `mimetype` reportado,
          // não por sniffing do conteúdo real (`file-type`) — decisão
          // desta fase, ver docs/phases/phase-5.2-upload-api-foundation.md.
          // Regex ancorada (^...$): sem isso, um mimetype como
          // "application/pdf-evil" também passava por conter a substring
          // permitida.
          new FileTypeValidator({
            fileType: new RegExp(`^(${ALLOWED_MIME_TYPES.join('|')})$`),
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.uploadsService.create(identity.organizationId, {
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    });
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.uploadsService.findOne(identity.organizationId, id);
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('id') id: string,
  ) {
    return this.uploadsService.remove(identity.organizationId, id);
  }
}
