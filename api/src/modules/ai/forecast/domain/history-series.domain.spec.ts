import { Prisma } from '@prisma/client';
import {
  aggregateDailyHistory,
  buildCompleteDailyHistory,
} from './history-series.domain';

describe('history-series.domain (T-012 AC2)', () => {
  describe('buildCompleteDailyHistory', () => {
    it('trả về mảng rỗng khi không có dữ liệu lịch sử', () => {
      expect(buildCompleteDailyHistory([])).toEqual([]);
    });

    it('sắp xếp tăng dần và điền 0 cho mọi ngày bị thiếu giữa ngày đầu và ngày cuối', () => {
      const result = buildCompleteDailyHistory([
        { date: '2026-11-04', qty: new Prisma.Decimal('12.500'), source: 'SIMULATED' },
        { date: '2026-11-01', qty: new Prisma.Decimal('10'), source: 'SIMULATED' },
      ]);

      expect(result).toEqual([
        { date: '2026-11-01', qty: 10 },
        { date: '2026-11-02', qty: 0 },
        { date: '2026-11-03', qty: 0 },
        { date: '2026-11-04', qty: 12.5 },
      ]);
    });

    it('ưu tiên nguồn ACTUAL thay cho SIMULATED khi trùng ngày bất kể thứ tự bản ghi', () => {
      const result = buildCompleteDailyHistory([
        { date: '2026-11-01', qty: new Prisma.Decimal('40'), source: 'ACTUAL' },
        { date: '2026-11-01', qty: new Prisma.Decimal('15'), source: 'SIMULATED' },
        { date: '2026-11-02', qty: new Prisma.Decimal('20'), source: 'SIMULATED' },
        { date: '2026-11-02', qty: new Prisma.Decimal('35'), source: 'ACTUAL' },
        { date: '2026-11-03', qty: new Prisma.Decimal('18'), source: 'SIMULATED' },
      ]);

      expect(result).toEqual([
        { date: '2026-11-01', qty: 40 },
        { date: '2026-11-02', qty: 35 },
        { date: '2026-11-03', qty: 18 },
      ]);
    });

    it('hỗ trợ đầu vào kiểu Date từ Prisma @db.Date', () => {
      const result = buildCompleteDailyHistory([
        { date: new Date('2026-11-10T00:00:00.000Z'), qty: '7', source: 'SIMULATED' },
        { date: new Date('2026-11-12T00:00:00.000Z'), qty: '9', source: 'SIMULATED' },
      ]);

      expect(result).toEqual([
        { date: '2026-11-10', qty: 7 },
        { date: '2026-11-11', qty: 0 },
        { date: '2026-11-12', qty: 9 },
      ]);
    });
  });

  describe('aggregateDailyHistory', () => {
    it('gộp tổng nhu cầu theo ngày của mọi sản phẩm, ưu tiên ACTUAL và lấy đúng N ngày gần nhất', () => {
      const result = aggregateDailyHistory(
        [
          { productId: 'p1', date: '2026-11-01', qty: '10', source: 'SIMULATED' },
          { productId: 'p2', date: '2026-11-01', qty: '20', source: 'SIMULATED' },
          { productId: 'p1', date: '2026-11-02', qty: '15', source: 'SIMULATED' },
          { productId: 'p1', date: '2026-11-02', qty: '25', source: 'ACTUAL' },
          { productId: 'p2', date: '2026-11-02', qty: '5', source: 'SIMULATED' },
          { productId: 'p1', date: '2026-11-03', qty: '12.5', source: 'SIMULATED' },
        ],
        2,
      );

      expect(result).toEqual([
        { date: '2026-11-02', totalQty: '30.000' },
        { date: '2026-11-03', totalQty: '12.500' },
      ]);
    });
  });
});
