import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createValidationPipe } from './common/utils/validation.util';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());
}
