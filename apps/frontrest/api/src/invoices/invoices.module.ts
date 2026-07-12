import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { QueueModule } from '../queue/queue.module';
import { FiscalParsingModule } from '../fiscal-parsing/fiscal-parsing.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceAttachmentsController } from './attachments/invoice-attachments.controller';
import { InvoiceAttachmentsService } from './attachments/invoice-attachments.service';
import { InvoiceDraftsController } from './drafts/invoice-drafts.controller';
import { InvoiceDraftsService } from './drafts/invoice-drafts.service';

@Module({
  imports: [UploadsModule, QueueModule, FiscalParsingModule],
  // InvoiceDraftsController regista `invoices/drafts` antes de
  // InvoicesController registar `invoices/:id` — ordem obrigatória, ver
  // comentário em invoice-drafts.controller.ts.
  controllers: [InvoiceDraftsController, InvoicesController, InvoiceAttachmentsController],
  providers: [InvoicesService, InvoiceAttachmentsService, InvoiceDraftsService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
