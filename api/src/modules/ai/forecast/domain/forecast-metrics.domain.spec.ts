import { Prisma } from '@prisma/client';
import {
  assessForecastBalance,
  calculateDaysToSellOut,
  summarizeProductForecast,
} from './forecast-metrics.domain';

describe('forecast-metrics.domain (T-012 AC2)', () => {
  describe('calculateDaysToSellOut', () => {
    it('tính đúng floor(onHand / (forecast / horizon)) bằng Decimal', () => {
      // 937 / (1322 / 60) = 42.526... -> floor = 42
      expect(
        calculateDaysToSellOut(new Prisma.Decimal('937'), new Prisma.Decimal('1322'), 60),
      ).toBe(42);

      // Chia chẵn không bị sai số dấu phẩy động: 100 / (600 / 60) = 10
      expect(
        calculateDaysToSellOut(new Prisma.Decimal('100'), new Prisma.Decimal('600'), 60),
      ).toBe(10);
    });

    it('trả 0 khi tồn kho bằng 0 và dự báo dương', () => {
      expect(
        calculateDaysToSellOut(new Prisma.Decimal('0'), new Prisma.Decimal('1322'), 60),
      ).toBe(0);
    });

    it('trả null khi tổng dự báo bằng 0 hoặc horizon <= 0', () => {
      expect(
        calculateDaysToSellOut(new Prisma.Decimal('500'), new Prisma.Decimal('0'), 60),
      ).toBeNull();
      expect(
        calculateDaysToSellOut(new Prisma.Decimal('500'), new Prisma.Decimal('100'), 0),
      ).toBeNull();
    });
  });

  describe('assessForecastBalance', () => {
    it('trả OVERSTOCK khi tồn hiện tại lớn hơn tổng nhu cầu dự báo', () => {
      expect(
        assessForecastBalance(new Prisma.Decimal('2131'), new Prisma.Decimal('1061')),
      ).toBe('OVERSTOCK');
    });

    it('trả BALANCED khi tồn hiện tại nhỏ hơn hoặc bằng tổng nhu cầu dự báo', () => {
      expect(
        assessForecastBalance(new Prisma.Decimal('937'), new Prisma.Decimal('1322')),
      ).toBe('BALANCED');
      expect(
        assessForecastBalance(new Prisma.Decimal('1000'), new Prisma.Decimal('1000')),
      ).toBe('BALANCED');
      expect(
        assessForecastBalance(new Prisma.Decimal('0'), new Prisma.Decimal('1000')),
      ).toBe('BALANCED');
    });
  });

  describe('summarizeProductForecast', () => {
    it('định dạng đúng string Decimal, daysToSellOut và assessment', () => {
      const summary = summarizeProductForecast({
        productId: 'p-1',
        code: 'SP001',
        name: 'Sữa tươi tiệt trùng',
        forecastTotalQty: new Prisma.Decimal('1322'),
        baselineTotalQty: new Prisma.Decimal('1290.5'),
        onHandQty: new Prisma.Decimal('0'),
        horizonDays: 60,
      });

      expect(summary).toEqual({
        productId: 'p-1',
        code: 'SP001',
        name: 'Sữa tươi tiệt trùng',
        forecastQty: '1322.000',
        baselineQty: '1290.500',
        onHandQty: '0.000',
        daysToSellOut: 0,
        assessment: 'BALANCED',
      });
    });
  });
});
