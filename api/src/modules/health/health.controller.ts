import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  ml: DependencyStatus;
}

const ML_HEALTH_TIMEOUT_MS = 2000;

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái API, PostgreSQL và dịch vụ ML' })
  @ApiOkResponse({
    description: 'Trạng thái các thành phần hệ thống',
    schema: {
      example: { status: 'ok', db: 'up', ml: 'up' },
    },
  })
  async check(): Promise<HealthResponse> {
    const [db, ml] = await Promise.all([this.checkDatabase(), this.checkMlService()]);
    return {
      status: db === 'up' && ml === 'up' ? 'ok' : 'degraded',
      db,
      ml,
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkMlService(): Promise<DependencyStatus> {
    const mlUrl = this.configService.get<string>('ML_SERVICE_URL');
    if (!mlUrl) {
      return 'down';
    }

    try {
      const response = await fetch(`${mlUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(ML_HEALTH_TIMEOUT_MS),
      });
      return response.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
