import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceAttachmentsController } from './attachments/invoice-attachments.controller';
import { InvoiceAttachmentsService } from './attachments/invoice-attachments.service';

@Module({
  imports: [UploadsModule],
  controllers: [InvoicesController, InvoiceAttachmentsController],
  providers: [InvoicesService, InvoiceAttachmentsService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
