import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type DependencyStatus } from '../api';
import { useHealthQuery } from '../hooks';

function ServiceStatusBadge({ status }: { status: DependencyStatus }) {
  const isUp = status === 'up';
  return (
    <Badge variant={isUp ? 'default' : 'critical'}>
      <span
        className={
          isUp
            ? 'h-2 w-2 rounded-full bg-[var(--risk-low-fg)]'
            : 'h-2 w-2 rounded-full bg-[var(--risk-critical-fg)]'
        }
        aria-hidden="true"
      />
      {isUp ? 'Hoạt động (up)' : 'Ngừng kết nối (down)'}
    </Badge>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useHealthQuery();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]">
        Bộ khung hệ thống KHO-AI đã sẵn sàng. Các màn hình nghiệp vụ kho và phân tích AI sẽ được bổ
        sung ở các giai đoạn tiếp theo.
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Trạng thái dịch vụ hệ thống</CardTitle>
            <CardDescription>
              Kiểm tra kết nối trực tiếp từ API đến cơ sở dữ liệu PostgreSQL và dịch vụ ML.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <p className="text-sm text-[var(--text-muted)]">
              Đang kiểm tra trạng thái kết nối tới máy chủ API...
            </p>
          )}

          {isError && (
            <div className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
              Không thể kết nối tới dịch vụ API. Vui lòng kiểm tra container <strong>api</strong>{' '}
              rồi bấm &quot;Kiểm tra lại&quot;.
            </div>
          )}

          {data && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-[var(--surface)] p-4">
                <div className="text-sm text-[var(--text-muted)]">Tổng thể API</div>
                <div className="mt-2">
                  <Badge variant={data.status === 'ok' ? 'default' : 'warning'}>
                    <span
                      className={
                        data.status === 'ok'
                          ? 'h-2 w-2 rounded-full bg-[var(--risk-low-fg)]'
                          : 'h-2 w-2 rounded-full bg-[var(--risk-medium-fg)]'
                      }
                      aria-hidden="true"
                    />
                    {data.status === 'ok' ? 'Ổn định (ok)' : 'Suy giảm (degraded)'}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-[var(--surface)] p-4">
                <div className="text-sm text-[var(--text-muted)]">Cơ sở dữ liệu (PostgreSQL)</div>
                <div className="mt-2">
                  <ServiceStatusBadge status={data.db} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-[var(--surface)] p-4">
                <div className="text-sm text-[var(--text-muted)]">Dịch vụ dự báo (ML)</div>
                <div className="mt-2">
                  <ServiceStatusBadge status={data.ml} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
