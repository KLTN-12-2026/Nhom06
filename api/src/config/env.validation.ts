import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string = 'development';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string = '8h';

  @IsString()
  @IsNotEmpty()
  ML_SERVICE_URL!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  ML_TIMEOUT_MS?: number = 10000;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string = 'http://localhost:5173';

  @IsOptional()
  @IsString()
  LLM_PROVIDER?: string = 'none';

  @IsOptional()
  @IsString()
  LLM_API_KEY?: string = '';

  @IsOptional()
  @IsString()
  LLM_MODEL?: string = '';

  @IsOptional()
  @IsInt()
  @Min(1000)
  LLM_TIMEOUT_MS?: number = 20000;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((err) => Object.values(err.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Cấu hình biến môi trường không hợp lệ: ${details}`);
  }

  return validatedConfig;
}
