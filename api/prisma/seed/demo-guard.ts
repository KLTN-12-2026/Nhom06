export interface DemoSeedCliOptions {
  reset: boolean;
}

/**
 * Chặn chạy dữ liệu demo trên môi trường production hoặc khi chưa bật tường minh ALLOW_DEMO_SEED=true (T-017 AC4).
 */
export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Từ chối chạy seed demo trên môi trường production (NODE_ENV=production)');
  }

  if (env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Từ chối chạy seed demo: cần đặt ALLOW_DEMO_SEED=true để xác nhận chạy trên DB phát triển',
    );
  }
}

export function parseDemoSeedCliArgs(argv: readonly string[]): DemoSeedCliOptions {
  return {
    reset: argv.includes('--reset'),
  };
}
