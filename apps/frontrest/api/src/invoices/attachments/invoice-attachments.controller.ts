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
import { InvoiceAttachmentsService } from './invoice-attachments.service';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../../uploads/constants';

@Controller('invoices/:invoiceId/attachments')
export class InvoiceAttachmentsController {
  constructor(private readonly invoiceAttachmentsService: InvoiceAttachmentsService) {}

  @Roles('MANAGER')
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  create(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES }),
          new FileTypeValidator({
            fileType: new RegExp(ALLOWED_MIME_TYPES.join('|')),
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.invoiceAttachmentsService.create(identity.organizationId, invoiceId, {
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    });
  }

  @Get()
  findAll(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoiceAttachmentsService.findAll(identity.organizationId, invoiceId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
    @Param('id') id: string,
  ) {
    return this.invoiceAttachmentsService.findOne(identity.organizationId, invoiceId, id);
  }

  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
    @Param('id') id: string,
  ) {
    return this.invoiceAttachmentsService.remove(identity.organizationId, invoiceId, id);
  }
}
