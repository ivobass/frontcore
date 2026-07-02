import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '@frontcore/auth';
import { buildLiveness, buildReadiness } from '@frontcore/monitoring';
import { PrismaService } from '../prisma/prisma.service';

const SERVICE_NAME = 'frontrest-api';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness: o processo está vivo.
  @Public()
  @Get()
  liveness() {
    return buildLiveness(SERVICE_NAME);
  }

  // Readiness: dependências críticas respondem (DB).
  @Public()
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return buildReadiness({ database: 'up' });
    } catch {
      throw new ServiceUnavailableException(
        buildReadiness({ database: 'down' }),
      );
    }
  }
}
