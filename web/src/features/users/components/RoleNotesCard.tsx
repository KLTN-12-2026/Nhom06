import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RoleNotesCard() {
  return (
    <Card>
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-lg">Ghi chú phân quyền</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4 text-sm">
        <p className="text-[var(--text-muted)]">Ba ranh giới quan trọng nhất trong ma trận bên cạnh:</p>

        <div className="space-y-1 border-b border-border pb-3.5">
          <div className="font-semibold text-[var(--text)]">Phê duyệt đề xuất</div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Chỉ Quản lý kho được phê duyệt hoặc từ chối đề xuất xử lý hàng cận hạn.
          </p>
        </div>

        <div className="space-y-1 border-b border-border pb-3.5">
          <div className="font-semibold text-[var(--text)]">Lập phiếu nhập</div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Quản lý kho không có quyền này: họ xác nhận chứ không tự lập chứng từ.
          </p>
        </div>

        <div className="space-y-1 pb-1">
          <div className="font-semibold text-[var(--text)]">Xác nhận điều chỉnh tồn</div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Nhân viên kho lập được phiếu kiểm kê nhưng không xác nhận được, vì đây là thao tác duy
            nhất đổi tồn mà không có chứng từ nhập xuất đi kèm.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
