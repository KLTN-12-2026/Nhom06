import { Prisma } from '@prisma/client';

export type ForecastBalanceAssessment = 'BALANCED' | 'OVERSTOCK';

export interface ProductForecastSummaryInput {
  productId: string;
  code: string;
  name: string;
  forecastTotalQty: Prisma.Decimal;
  baselineTotalQty: Prisma.Decimal;
  onHandQty: Prisma.Decimal;
  horizonDays: number;
}

export interface ProductForecastSummaryItem {
  productId: string;
  code: string;
  name: string;
  forecastQty: string;
  baselineQty: string;
  onHandQty: string;
  daysToSellOut: number | null;
  assessment: ForecastBalanceAssessment;
}

/**
 * Số ngày bán hết = floor(onHand ÷ (forecastQty / horizon)) = floor((onHand × horizon) ÷ forecastQty).
 * Trả null nếu nhu cầu dự báo <= 0 hoặc horizonDays <= 0.
 */
export function calculateDaysToSellOut(
  onHandQty: Prisma.Decimal,
  forecastTotalQty: Prisma.Decimal,
  horizonDays: number,
): number | null {
  if (horizonDays <= 0 || forecastTotalQty.lte(0)) {
    return null;
  }
  if (onHandQty.lte(0)) {
    return 0;
  }
  return onHandQty.mul(horizonDays).div(forecastTotalQty).floor().toNumber();
}

/**
 * Nhận xét cân đối hiển thị cho màn Dự báo nhu cầu (không phải đánh giá rủi ro theo lô của T-013):
 * OVERSTOCK khi tồn hiện tại lớn hơn tổng nhu cầu dự báo; ngược lại BALANCED.
 */
export function assessForecastBalance(
  onHandQty: Prisma.Decimal,
  forecastTotalQty: Prisma.Decimal,
): ForecastBalanceAssessment {
  return onHandQty.gt(forecastTotalQty) ? 'OVERSTOCK' : 'BALANCED';
}

export function summarizeProductForecast(
  input: ProductForecastSummaryInput,
): ProductForecastSummaryItem {
  return {
    productId: input.productId,
    code: input.code,
    name: input.name,
    forecastQty: input.forecastTotalQty.toFixed(3),
    baselineQty: input.baselineTotalQty.toFixed(3),
    onHandQty: input.onHandQty.toFixed(3),
    daysToSellOut: calculateDaysToSellOut(
      input.onHandQty,
      input.forecastTotalQty,
      input.horizonDays,
    ),
    assessment: assessForecastBalance(input.onHandQty, input.forecastTotalQty),
  };
}
