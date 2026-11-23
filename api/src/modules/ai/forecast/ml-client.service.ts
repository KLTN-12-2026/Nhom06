import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MlHistoryItem {
  date: string;
  qty: number;
}

export interface MlForecastRequest {
  product_code: string;
  history: MlHistoryItem[];
  horizon_days: number;
  method: 'baseline' | 'model';
}

export interface MlForecastPoint {
  date: string;
  qty: number;
}

export interface MlForecastResponse {
  product_code: string;
  method: string;
  model_version: string;
  generated_at: string;
  forecast: MlForecastPoint[];
}

export interface MlMethodOverallMetrics {
  mean_mae: number;
  mean_rmse: number;
  pooled_rmse?: number;
}

export interface MlModelInfoResponse {
  model_version: string;
  trained_at: string;
  train_start: string;
  train_end: string;
  n_rows: number;
  features: string[];
  params: Record<string, unknown>;
  data_source: string;
  metrics?: {
    test_days?: number;
    test_start?: string;
    test_end?: string;
    methods?: Record<string, MlMethodOverallMetrics>;
  } | null;
}

export class MlServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MlServiceError';
  }
}

const DEFAULT_ML_TIMEOUT_MS = 10_000;

@Injectable()
export class MlClient {
  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl(): string {
    const url = this.configService.get<string>('ML_SERVICE_URL');
    if (!url) {
      throw new MlServiceError('Chưa cấu hình ML_SERVICE_URL');
    }
    return url.replace(/\/$/, '');
  }

  private getTimeoutMs(): number {
    const raw = this.configService.get<number>('ML_TIMEOUT_MS', DEFAULT_ML_TIMEOUT_MS);
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? raw
      : DEFAULT_ML_TIMEOUT_MS;
  }

  async forecast(payload: MlForecastRequest): Promise<MlForecastResponse> {
    const url = `${this.getBaseUrl()}/forecast`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Lỗi kết nối';
      throw new MlServiceError(
        `Không gọi được dịch vụ dự báo cho sản phẩm ${payload.product_code} (${payload.method}): ${reason}`,
      );
    }

    if (!response.ok) {
      throw new MlServiceError(
        `Dịch vụ dự báo trả lỗi HTTP ${response.status} cho sản phẩm ${payload.product_code} (${payload.method})`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MlServiceError(
        `Phản hồi JSON từ dịch vụ dự báo không hợp lệ cho sản phẩm ${payload.product_code}`,
      );
    }

    if (!this.isValidForecastResponse(body, payload.horizon_days)) {
      throw new MlServiceError(
        `Dữ liệu dự báo trả về không đúng định dạng cho sản phẩm ${payload.product_code}`,
      );
    }

    return body;
  }

  async getModelInfo(): Promise<MlModelInfoResponse> {
    const url = `${this.getBaseUrl()}/model/info`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Lỗi kết nối';
      throw new MlServiceError(`Không lấy được thông tin mô hình dự báo: ${reason}`);
    }

    if (!response.ok) {
      throw new MlServiceError(`Dịch vụ dự báo trả lỗi HTTP ${response.status} khi đọc /model/info`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MlServiceError('Phản hồi /model/info không phải JSON hợp lệ');
    }

    if (!body || typeof body !== 'object' || typeof (body as { model_version?: unknown }).model_version !== 'string') {
      throw new MlServiceError('Phản hồi /model/info thiếu trường model_version');
    }

    return body as MlModelInfoResponse;
  }

  private isValidForecastResponse(
    body: unknown,
    expectedHorizonDays: number,
  ): body is MlForecastResponse {
    if (!body || typeof body !== 'object') {
      return false;
    }
    const candidate = body as Partial<MlForecastResponse>;
    if (typeof candidate.model_version !== 'string' || !Array.isArray(candidate.forecast)) {
      return false;
    }
    if (candidate.forecast.length !== expectedHorizonDays) {
      return false;
    }
    return candidate.forecast.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.date === 'string' &&
        typeof item.qty === 'number' &&
        Number.isFinite(item.qty) &&
        item.qty >= 0,
    );
  }
}
