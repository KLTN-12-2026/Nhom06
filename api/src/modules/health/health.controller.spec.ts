import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaMock: { $queryRaw: jest.Mock };
  let configMock: { get: jest.Mock };
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn(),
    };
    configMock = {
      get: jest.fn().mockReturnValue('http://ml:8000'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('trả về status ok khi cả DB và ML đều hoạt động', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    fetchSpy.mockResolvedValue({ ok: true } as Response);

    const result = await controller.check();

    expect(result).toEqual({ status: 'ok', db: 'up', ml: 'up' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://ml:8000/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('không ném lỗi và báo ml down khi dịch vụ ML không phản hồi', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await controller.check();

    expect(result).toEqual({ status: 'degraded', db: 'up', ml: 'down' });
  });

  it('báo ml down khi dịch vụ ML trả về mã lỗi HTTP', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);

    const result = await controller.check();

    expect(result).toEqual({ status: 'degraded', db: 'up', ml: 'down' });
  });

  it('báo db down khi truy vấn PostgreSQL thất bại', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));
    fetchSpy.mockResolvedValue({ ok: true } as Response);

    const result = await controller.check();

    expect(result).toEqual({ status: 'degraded', db: 'down', ml: 'up' });
  });
});
