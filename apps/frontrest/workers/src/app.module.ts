import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@frontcore/database';
import { OcrProcessingModule } from './queues/ocr-processing.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, OcrProcessingModule],
})
export class AppModule {}
