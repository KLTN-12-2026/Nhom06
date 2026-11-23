export type ThresholdScope = 'GLOBAL' | 'PRODUCT_GROUP' | 'PRODUCT';
export type ExpirySeverity = 'expired' | 'critical' | 'warning' | 'normal';

export interface ThresholdRecord {
  id: string;
  scope: ThresholdScope;
  productGroupId: string | null;
  productId: string | null;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ResolvedThreshold {
  thresholdId: string;
  scope: ThresholdScope;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number;
  globalThresholdId: string;
}

export interface OverrideSummaryInput {
  scope: 'PRODUCT' | 'PRODUCT_GROUP';
  targetCode?: string;
  targetName: string;
  warningDays: number;
}

export class MissingGlobalThresholdError extends Error {
  constructor(dateStr?: string) {
    super(
      dateStr
        ? `Chưa có ngưỡng cảnh báo HSD chung (GLOBAL) có hiệu lực tại ngày ${dateStr}`
        : 'Chưa có ngưỡng cảnh báo HSD chung (GLOBAL) đang hiệu lực',
    );
    this.name = 'MissingGlobalThresholdError';
  }
}

/**
 * Khoảng hiệu lực nửa mở [effectiveFrom, effectiveTo):
 * Bản ghi có hiệu lực tại `dateStr` khi effectiveFrom <= dateStr và (effectiveTo == null hoặc dateStr < effectiveTo).
 */
export function isEffectiveOnDate(
  effectiveFrom: string,
  effectiveTo: string | null,
  dateStr: string,
): boolean {
  if (effectiveFrom > dateStr) {
    return false;
  }
  return effectiveTo === null || dateStr < effectiveTo;
}

/**
 * Chọn ngưỡng áp dụng cho một sản phẩm theo thứ tự ưu tiên:
 * PRODUCT > PRODUCT_GROUP > GLOBAL.
 * `criticalDays` và `minDeliveryDays` luôn lấy từ bản GLOBAL hiệu lực (D-019).
 */
export function selectApplicableThreshold(
  effectiveThresholds: readonly ThresholdRecord[],
  productId: string,
  productGroupId: string,
  dateStr?: string,
): ResolvedThreshold {
  const globalThreshold = effectiveThresholds.find((t) => t.scope === 'GLOBAL');
  if (!globalThreshold) {
    throw new MissingGlobalThresholdError(dateStr);
  }

  const criticalDays = globalThreshold.criticalDays;
  const minDeliveryDays = globalThreshold.minDeliveryDays ?? 0;

  const productOverride = effectiveThresholds.find(
    (t) => t.scope === 'PRODUCT' && t.productId === productId,
  );
  if (productOverride) {
    return {
      thresholdId: productOverride.id,
      scope: 'PRODUCT',
      warningDays: productOverride.warningDays,
      criticalDays,
      minDeliveryDays,
      globalThresholdId: globalThreshold.id,
    };
  }

  const groupOverride = effectiveThresholds.find(
    (t) => t.scope === 'PRODUCT_GROUP' && t.productGroupId === productGroupId,
  );
  if (groupOverride) {
    return {
      thresholdId: groupOverride.id,
      scope: 'PRODUCT_GROUP',
      warningDays: groupOverride.warningDays,
      criticalDays,
      minDeliveryDays,
      globalThresholdId: globalThreshold.id,
    };
  }

  return {
    thresholdId: globalThreshold.id,
    scope: 'GLOBAL',
    warningDays: globalThreshold.warningDays,
    criticalDays,
    minDeliveryDays,
    globalThresholdId: globalThreshold.id,
  };
}

/**
 * Phân loại tình trạng HSD theo ngày còn lại và ngưỡng áp dụng (D-019):
 * - daysRemaining < 0 -> expired
 * - daysRemaining <= min(criticalDays, warningDays) -> critical
 * - daysRemaining <= warningDays -> warning
 * - còn lại -> normal
 */
export function classifyExpirySeverity(
  daysRemaining: number,
  warningDays: number,
  criticalDays: number,
): ExpirySeverity {
  if (daysRemaining < 0) {
    return 'expired';
  }
  const effectiveCritical = Math.min(criticalDays, warningDays);
  if (daysRemaining <= effectiveCritical) {
    return 'critical';
  }
  if (daysRemaining <= warningDays) {
    return 'warning';
  }
  return 'normal';
}

/**
 * Sắp danh sách cảnh báo: expired trước (daysRemaining < 0), rồi daysRemaining tăng dần, hòa thì theo lotCode.
 */
export function sortExpiryAlerts<T extends { daysRemaining: number; lotCode: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    return a.lotCode.localeCompare(b.lotCode);
  });
}

/**
 * Định dạng chuỗi tóm tắt các ngưỡng riêng cho KPI card "Ngưỡng chung" (mockup 17).
 */
export function formatOverridesSummary(overrides: readonly OverrideSummaryInput[]): string {
  if (overrides.length === 0) {
    return 'Chưa có ngưỡng riêng';
  }

  const groupParts = overrides
    .filter((o) => o.scope === 'PRODUCT_GROUP')
    .sort((a, b) => a.targetName.localeCompare(b.targetName, 'vi'))
    .map((o) => `Nhóm ${o.targetName} ${o.warningDays} ngày`);

  const productParts = overrides
    .filter((o) => o.scope === 'PRODUCT')
    .sort((a, b) => (a.targetCode ?? a.targetName).localeCompare(b.targetCode ?? b.targetName))
    .map((o) => `riêng ${o.targetCode ?? o.targetName} ${o.warningDays} ngày`);

  const allParts = [...groupParts, ...productParts];
  if (allParts.length <= 3) {
    return allParts.join(' · ');
  }
  return `${allParts.slice(0, 3).join(' · ')} và ${allParts.length - 3} ngưỡng khác`;
}
