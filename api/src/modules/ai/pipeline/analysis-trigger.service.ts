import { ConflictException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisPipelineService } from './analysis-pipeline.service';

export interface StockChangeSource {
  sourceType: 'INBOUND_RECEIPT' | 'OUTBOUND_RECEIPT';
  sourceId: string;
  receiptNo?: string;
}

const DEFAULT_DEBOUNCE_MS = 30_000;

@Injectable()
export class AnalysisTriggerService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalysisTriggerService.name);
  private inFlight = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingSource: StockChangeSource | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly pipelineService: AnalysisPipelineService,
  ) {}

  onModuleDestroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingSource = null;
  }

  private isEnabled(): boolean {
    const enabled = this.configService.get<string>('ANALYSIS_AUTO_ENABLED', 'true') === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (!enabled || nodeEnv === 'test') {
      return false;
    }
    return true;
  }

  private getDebounceMs(): number {
    const raw = this.configService.get<number | string>(
      'ANALYSIS_AUTO_DEBOUNCE_MS',
      DEFAULT_DEBOUNCE_MS,
    );
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return DEFAULT_DEBOUNCE_MS;
    }
    return Math.trunc(parsed);
  }

  /**
   * Kích hoạt lượt phân tích nền sau khi giao dịch nhập/xuất kho đã commit thành công.
   * - Không bao giờ chặn response và không bao giờ ném lỗi ra ngoài.
   * - Gom nhiều biến động tồn liên tiếp bằng debounce (`ANALYSIS_AUTO_DEBOUNCE_MS`).
   * - Nếu đang có lượt phân tích chạy (trong tiến trình hoặc từ DB 409) → bỏ qua, chỉ ghi log.
   */
  notifyStockChanged(source: StockChangeSource): void {
    try {
      if (!this.isEnabled()) {
        return;
      }

      const sourceLabel = `${source.sourceType}:${source.receiptNo ?? source.sourceId}`;
      if (this.inFlight) {
        this.logger.log(
          `Bỏ qua kích hoạt phân tích STOCK_CHANGE (${sourceLabel}) vì đang có lượt phân tích chạy`,
        );
        return;
      }

      const debounceMs = this.getDebounceMs();
      if (debounceMs <= 0) {
        this.inFlight = true;
        setImmediate(() => {
          void this.executeBackgroundRun(source);
        });
        return;
      }

      this.pendingSource = source;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        const latestSource = this.pendingSource ?? source;
        this.pendingSource = null;

        if (this.inFlight) {
          const latestLabel = `${latestSource.sourceType}:${latestSource.receiptNo ?? latestSource.sourceId}`;
          this.logger.log(
            `Bỏ qua kích hoạt phân tích STOCK_CHANGE (${latestLabel}) vì đang có lượt phân tích chạy`,
          );
          return;
        }

        this.inFlight = true;
        setImmediate(() => {
          void this.executeBackgroundRun(latestSource);
        });
      }, debounceMs);

      this.debounceTimer.unref?.();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi không mong muốn khi xếp lịch hook STOCK_CHANGE: ${detail}`);
    }
  }

  private async executeBackgroundRun(source: StockChangeSource): Promise<void> {
    const sourceLabel = `${source.sourceType}:${source.receiptNo ?? source.sourceId}`;
    try {
      const result = await this.pipelineService.run({ trigger: 'STOCK_CHANGE' });
      this.logger.log(
        `Hoàn tất phân tích nền STOCK_CHANGE (${sourceLabel}, run=${result.id}): ${result.lotCount} lô`,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.log(
          `Bỏ qua phân tích nền STOCK_CHANGE (${sourceLabel}): đang có lượt phân tích chạy`,
        );
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi phân tích nền STOCK_CHANGE (${sourceLabel}): ${detail}`);
    } finally {
      this.inFlight = false;
    }
  }
}
