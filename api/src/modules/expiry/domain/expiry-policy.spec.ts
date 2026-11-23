import {
  classifyExpirySeverity,
  formatOverridesSummary,
  isEffectiveOnDate,
  MissingGlobalThresholdError,
  selectApplicableThreshold,
  sortExpiryAlerts,
  ThresholdRecord,
} from './expiry-policy';

describe('expiry-policy — ưu tiên ngưỡng và phân loại mức cảnh báo (AC1)', () => {
  const globalThreshold: ThresholdRecord = {
    id: 'thr-global',
    scope: 'GLOBAL',
    productGroupId: null,
    productId: null,
    warningDays: 30,
    criticalDays: 7,
    minDeliveryDays: 7,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  };

  const groupThreshold: ThresholdRecord = {
    id: 'thr-group',
    scope: 'PRODUCT_GROUP',
    productGroupId: 'grp-sua',
    productId: null,
    warningDays: 45,
    criticalDays: 0,
    minDeliveryDays: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  };

  const productThreshold: ThresholdRecord = {
    id: 'thr-prod',
    scope: 'PRODUCT',
    productGroupId: null,
    productId: 'prod-sp002',
    warningDays: 10,
    criticalDays: 0,
    minDeliveryDays: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  };

  describe('selectApplicableThreshold', () => {
    it('ưu tiên PRODUCT > PRODUCT_GROUP > GLOBAL', () => {
      const thresholds = [globalThreshold, groupThreshold, productThreshold];

      const forSp002 = selectApplicableThreshold(thresholds, 'prod-sp002', 'grp-sua');
      expect(forSp002).toEqual({
        thresholdId: 'thr-prod',
        scope: 'PRODUCT',
        warningDays: 10,
        criticalDays: 7,
        minDeliveryDays: 7,
        globalThresholdId: 'thr-global',
      });

      const forOtherSua = selectApplicableThreshold(thresholds, 'prod-sp001', 'grp-sua');
      expect(forOtherSua).toEqual({
        thresholdId: 'thr-group',
        scope: 'PRODUCT_GROUP',
        warningDays: 45,
        criticalDays: 7,
        minDeliveryDays: 7,
        globalThresholdId: 'thr-global',
      });

      const forOtherGroup = selectApplicableThreshold(thresholds, 'prod-sp011', 'grp-ngk');
      expect(forOtherGroup).toEqual({
        thresholdId: 'thr-global',
        scope: 'GLOBAL',
        warningDays: 30,
        criticalDays: 7,
        minDeliveryDays: 7,
        globalThresholdId: 'thr-global',
      });
    });

    it('ném MissingGlobalThresholdError khi thiếu ngưỡng GLOBAL hiệu lực', () => {
      expect(() =>
        selectApplicableThreshold([groupThreshold, productThreshold], 'prod-sp002', 'grp-sua'),
      ).toThrow(MissingGlobalThresholdError);
    });
  });

  describe('classifyExpirySeverity', () => {
    it('phân loại chính xác tại tất cả các điểm biên (warning=30, critical=7)', () => {
      expect(classifyExpirySeverity(-1, 30, 7)).toBe('expired');
      expect(classifyExpirySeverity(0, 30, 7)).toBe('critical');
      expect(classifyExpirySeverity(7, 30, 7)).toBe('critical');
      expect(classifyExpirySeverity(8, 30, 7)).toBe('warning');
      expect(classifyExpirySeverity(30, 30, 7)).toBe('warning');
      expect(classifyExpirySeverity(31, 30, 7)).toBe('normal');
    });

    it('khi critical=0 thì days=0 vẫn là critical, days=1 là warning', () => {
      expect(classifyExpirySeverity(-1, 10, 0)).toBe('expired');
      expect(classifyExpirySeverity(0, 10, 0)).toBe('critical');
      expect(classifyExpirySeverity(1, 10, 0)).toBe('warning');
      expect(classifyExpirySeverity(10, 10, 0)).toBe('warning');
      expect(classifyExpirySeverity(11, 10, 0)).toBe('normal');
    });

    it('khi override warningDays < global.criticalDays thì chặn effectiveCritical = min(critical, warning)', () => {
      // global critical = 7 nhưng override warning = 5 -> ngày 6 phải là normal, ngày 5 là critical
      expect(classifyExpirySeverity(6, 5, 7)).toBe('normal');
      expect(classifyExpirySeverity(5, 5, 7)).toBe('critical');
      expect(classifyExpirySeverity(0, 5, 7)).toBe('critical');
      expect(classifyExpirySeverity(-1, 5, 7)).toBe('expired');
    });
  });

  describe('isEffectiveOnDate', () => {
    it('áp dụng khoảng nửa mở [effectiveFrom, effectiveTo)', () => {
      expect(isEffectiveOnDate('2026-01-01', null, '2026-11-23')).toBe(true);
      expect(isEffectiveOnDate('2026-01-01', '2026-11-23', '2026-11-22')).toBe(true);
      expect(isEffectiveOnDate('2026-01-01', '2026-11-23', '2026-11-23')).toBe(false);
      expect(isEffectiveOnDate('2026-11-23', null, '2026-11-23')).toBe(true);
      expect(isEffectiveOnDate('2026-11-23', '2026-11-23', '2026-11-23')).toBe(false);
    });
  });

  describe('sortExpiryAlerts & formatOverridesSummary', () => {
    it('sắp expired trước rồi daysRemaining tăng dần, hòa thì theo lotCode', () => {
      const sorted = sortExpiryAlerts([
        { daysRemaining: 20, lotCode: 'L02' },
        { daysRemaining: -7, lotCode: 'L03' },
        { daysRemaining: 20, lotCode: 'L01' },
        { daysRemaining: -53, lotCode: 'L04' },
        { daysRemaining: 0, lotCode: 'L05' },
      ]);
      expect(sorted.map((x) => x.lotCode)).toEqual(['L04', 'L03', 'L05', 'L01', 'L02']);
    });

    it('tạo chuỗi tóm tắt ngưỡng riêng ngắn gọn đúng định dạng mockup 17', () => {
      expect(formatOverridesSummary([])).toBe('Chưa có ngưỡng riêng');
      expect(
        formatOverridesSummary([
          { scope: 'PRODUCT', targetCode: 'SP002', targetName: 'Sữa chua', warningDays: 10 },
          { scope: 'PRODUCT_GROUP', targetName: 'Sữa', warningDays: 45 },
        ]),
      ).toBe('Nhóm Sữa 45 ngày · riêng SP002 10 ngày');
    });
  });
});
