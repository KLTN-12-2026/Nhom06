import { Link } from 'react-router-dom';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { PageHeader } from '@/components/common/PageHeader';
import { ExpirySeverityBadge, RiskLevelBadge } from '@/components/common/RiskStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/hooks';
import { formatDateVi, formatQuantity, formatVndCompact } from '@/lib/format';
import { MonthlyInOutChartCard } from '../components/MonthlyInOutChartCard';
import { SystemHealthCompactCard } from '../components/SystemHealthCompactCard';
import { useDashboardQuery } from '../hooks';

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const dashboardQuery = useDashboardQuery();
  const data = dashboardQuery.data;

  const canReadReports = hasPermission('reports.read');
  const canReadAnalysis = hasPermission('analysis.read');
  const canReadProposals = hasPermission('proposals.read');
  const showValueAtRisk = canReadReports && canReadAnalysis;
  const isAdmin = user?.role?.code === 'ADMIN';

  const description = data
    ? `Số liệu tính đến ngày ${formatDateVi(data.asOf)}`
    : 'Tổng quan tồn kho, hạn sử dụng và rủi ro cận hạn';

  const valueAtRiskFormatted =
    data?.valueAtRisk !== null && data?.valueAtRisk !== undefined
      ? formatVndCompact(data.valueAtRisk.amount)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Bảng điều khiển" description={description} />

      {dashboardQuery.isLoading && (
        <Card>
          <CardContent className="py-10 text-sm text-[var(--text-muted)]">
            Đang tải số liệu tổng quan bảng điều khiển...
          </CardContent>
        </Card>
      )}

      {dashboardQuery.isError && (
        <div className="rounded-lg border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
          Không thể tải dữ liệu bảng điều khiển. Vui lòng thử lại.{' '}
          <button
            type="button"
            onClick={() => void dashboardQuery.refetch()}
            className="font-medium underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Hàng 1: 4 thẻ KPI (ẩn ô Giá trị có nguy cơ mất khi thiếu reports.read hoặc analysis.read) */}
          <div
            className={`grid gap-4 sm:grid-cols-2 ${
              showValueAtRisk ? 'xl:grid-cols-4' : 'xl:grid-cols-3'
            }`}
          >
            <Link
              to="/inventory"
              className="block rounded-lg border border-border bg-[var(--surface)] p-5 transition-colors hover:border-[var(--info)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
            >
              <div className="text-sm font-medium text-[var(--text-muted)]">Tổng tồn kho</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--text)]">
                {formatQuantity(data.totalOnHand)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {formatQuantity(data.lotsInStock)} lô đang còn hàng
              </div>
            </Link>

            <Link
              to="/expiry-alerts"
              className="block rounded-lg border border-border bg-[var(--surface)] p-5 transition-colors hover:border-[var(--info)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
            >
              <div className="text-sm font-medium text-[var(--text-muted)]">Lô cận hạn</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-medium-kpi)]">
                {formatQuantity(data.nearExpiry.lots)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                theo ngưỡng riêng của từng mặt hàng
              </div>
            </Link>

            <Link
              to="/expiry-alerts?severity=expired"
              className="block rounded-lg border border-border bg-[var(--surface)] p-5 transition-colors hover:border-[var(--info)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
            >
              <div className="text-sm font-medium text-[var(--text-muted)]">Lô đã hết hạn</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-critical-fg)]">
                {formatQuantity(data.expired.lots)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {formatQuantity(data.expired.qty)} đơn vị cần xử lý
              </div>
            </Link>

            {showValueAtRisk && (
              <Link
                to="/risk"
                className="block rounded-lg border border-border bg-[var(--surface)] p-5 transition-colors hover:border-[var(--info)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
              >
                <div className="text-sm font-medium text-[var(--text-muted)]">
                  Giá trị có nguy cơ mất
                </div>
                {data.valueAtRisk && valueAtRiskFormatted ? (
                  <>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-4xl font-semibold tabular-nums text-[var(--risk-critical-fg)]">
                        {valueAtRiskFormatted.valueText}
                      </span>
                      <span className="text-sm font-medium text-[var(--text-muted)]">
                        {valueAtRiskFormatted.unitText}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                      {formatQuantity(data.valueAtRisk.surplusQty)} đơn vị tồn dư ước tính
                      {data.valueAtRisk.lotsWithoutCost > 0
                        ? ` · ${data.valueAtRisk.lotsWithoutCost} lô chưa có đơn giá`
                        : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-3 text-base font-medium text-[var(--text-muted)]">
                      Chưa có dữ liệu phân tích
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                      Chạy phân tích tồn dư để ước tính giá trị
                    </div>
                  </>
                )}
              </Link>
            )}
          </div>

          {/* Hàng 2: Biểu đồ 12 tháng + Mức rủi ro tồn dư */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className={canReadAnalysis ? 'lg:col-span-8' : 'lg:col-span-12'}>
              <MonthlyInOutChartCard
                title="Nhập và xuất 12 tháng"
                data={data.monthlyInOut}
              />
            </div>

            {canReadAnalysis && (
              <div className="lg:col-span-4">
                <Card className="h-full">
                  <CardHeader className="border-b border-border py-4">
                    <CardTitle className="text-lg font-semibold text-[var(--text)]">
                      Mức rủi ro tồn dư
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {data.riskSummary ? (
                      <div className="divide-y divide-border">
                        {data.riskSummary.map((row) => (
                          <div
                            key={row.level}
                            className="flex items-center justify-between gap-2 py-3 text-sm"
                          >
                            <RiskLevelBadge level={row.level} />
                            <div className="flex items-center gap-3 tabular-nums sm:gap-5">
                              <span className="whitespace-nowrap font-medium text-[var(--text)]">
                                {formatQuantity(row.lots)} lô
                              </span>
                              <span className="min-w-[68px] whitespace-nowrap text-right text-[var(--text-muted)]">
                                {formatQuantity(row.surplusQty)} dư
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-sm text-[var(--text-muted)]">
                        Chưa có dữ liệu phân tích tồn dư. Chạy phân tích để xem phân bố mức rủi ro.
                      </p>
                    )}

                    <div className="mt-4">
                      <Button asChild variant="secondary" size="sm">
                        <Link to="/risk">Xem chi tiết phân tích</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Hàng 3: Lô cần xử lý sớm nhất + Đơn chờ xuất kho */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border py-4">
                  <CardTitle className="text-lg font-semibold text-[var(--text)]">
                    Lô cần xử lý sớm nhất
                  </CardTitle>
                  {canReadProposals && data.pendingProposals !== null && (
                    <Button asChild variant="secondary" size="sm">
                      <Link to="/proposals">
                        {formatQuantity(data.pendingProposals)} đề xuất chờ duyệt
                      </Link>
                    </Button>
                  )}
                </CardHeader>

                <CardContent className="p-0">
                  {data.topLots.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                      Chưa có lô hàng cận hạn hoặc rủi ro cần xử lý.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sản phẩm</TableHead>
                            <TableHead>Lô</TableHead>
                            <TableHead className="text-right">Tồn</TableHead>
                            <TableHead>Hạn dùng</TableHead>
                            <TableHead>Rủi ro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.topLots.map((lot) => (
                            <TableRow key={lot.lotId}>
                              <TableCell>
                                <div className="min-w-[160px]">
                                  <span className="font-medium text-[var(--text)]">
                                    {lot.product.code}
                                  </span>{' '}
                                  <span className="text-[var(--text-muted)]">
                                    {lot.product.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium whitespace-nowrap text-[var(--text)]">
                                {lot.lotCode}
                              </TableCell>
                              <TableCell className="text-right tabular-nums whitespace-nowrap text-[var(--text)]">
                                {formatQuantity(lot.onHandQty)}
                              </TableCell>
                              <TableCell>
                                <ExpiryBar
                                  daysRemaining={lot.daysRemaining}
                                  severity={lot.expirySeverity}
                                  maxDays={Math.max(lot.warningDays, 30)}
                                />
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {lot.riskLevel ? (
                                  <RiskLevelBadge level={lot.riskLevel} />
                                ) : (
                                  <ExpirySeverityBadge severity={lot.expirySeverity} />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card className="h-full">
                <CardHeader className="border-b border-border py-4">
                  <CardTitle className="text-lg font-semibold text-[var(--text)]">
                    Đơn chờ xuất kho
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.pendingOrders.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                      Không có đơn đại lý nào đang chờ xuất kho.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {data.pendingOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between gap-3 px-6 py-3.5"
                        >
                          <div className="min-w-0">
                            <Link
                              to={`/orders/${order.id}`}
                              className="font-medium text-[var(--info)] hover:underline"
                            >
                              {order.orderNo}
                            </Link>
                            <div className="truncate text-xs text-[var(--text-muted)]">
                              {order.agency.name}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm text-[var(--text)] tabular-nums">
                            {formatQuantity(order.itemCount)} mặt hàng
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Thẻ trạng thái dịch vụ thu gọn từ T-001 — chỉ hiển thị cho ADMIN */}
      {isAdmin && <SystemHealthCompactCard />}
    </div>
  );
}
