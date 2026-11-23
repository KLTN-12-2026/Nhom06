import { type StatusTone } from '@/components/common/StatusBadge';

const EVENT_TYPE_LABELS: Record<string, string> = {
  // Tài khoản & bảo mật
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
  USER_LOCKED: 'Khóa tài khoản',
  USER_UNLOCKED: 'Mở khóa tài khoản',
  USER_ROLE_CHANGED: 'Đổi vai trò',
  USER_PASSWORD_CHANGED: 'Đổi mật khẩu',
  USER_PASSWORD_RESET: 'Đặt lại mật khẩu',
  AUTH_LOGIN_LOCKED: 'Đăng nhập tài khoản bị khóa',
  ROLE_PERMISSIONS_UPDATED: 'Cập nhật quyền vai trò',

  // Nhập kho
  INBOUND_CREATED: 'Tạo phiếu nhập',
  INBOUND_UPDATED: 'Sửa phiếu nhập',
  INBOUND_CONFIRMED: 'Xác nhận nhập',
  INBOUND_CANCELLED: 'Hủy phiếu nhập',

  // Xuất kho & đơn đại lý
  ORDER_CREATED: 'Tạo đơn đại lý',
  ORDER_UPDATED: 'Sửa đơn đại lý',
  ORDER_CANCELLED: 'Hủy đơn đại lý',
  OUTBOUND_CONFIRMED: 'Xác nhận xuất',

  // Tồn kho & kiểm kê
  STOCK_COUNT_CREATED: 'Tạo phiếu kiểm kê',
  STOCK_COUNT_UPDATED: 'Sửa phiếu kiểm kê',
  STOCK_COUNT_SUBMITTED: 'Gửi duyệt kiểm kê',
  STOCK_COUNT_APPROVED: 'Duyệt kiểm kê',
  STOCK_COUNT_CANCELLED: 'Hủy phiếu kiểm kê',
  LOT_BLOCKED: 'Khóa lô hàng',
  LOT_UNBLOCKED: 'Mở khóa lô hàng',

  // Hàng cận hạn
  EXPIRY_THRESHOLD_GLOBAL_UPDATED: 'Cập nhật ngưỡng chung',
  EXPIRY_THRESHOLD_OVERRIDE_CREATED: 'Tạo ngưỡng riêng',
  EXPIRY_THRESHOLD_OVERRIDE_UPDATED: 'Sửa ngưỡng riêng',
  EXPIRY_THRESHOLD_OVERRIDE_ENDED: 'Kết thúc ngưỡng riêng',
  EXPIRY_ALERTS_EVALUATED: 'Đánh giá cảnh báo HSD',

  // Phân tích AI & đề xuất
  PROPOSAL_APPROVED: 'Phê duyệt đề xuất',
  PROPOSAL_REJECTED: 'Từ chối đề xuất',
  EXECUTION_UPDATED: 'Cập nhật thực hiện',
  EXECUTION_DISPOSAL_CREATED: 'Lập phiếu hủy/trả NCC',
  EXECUTION_OUTBOUND_LINKED: 'Liên kết phiếu xuất',

  // Danh mục
  PRODUCT_CREATED: 'Tạo sản phẩm',
  PRODUCT_UPDATED: 'Sửa sản phẩm',
  PRODUCT_STATUS_CHANGED: 'Đổi trạng thái sản phẩm',
  PRODUCT_GROUP_CREATED: 'Tạo nhóm hàng',
  PRODUCT_GROUP_UPDATED: 'Sửa nhóm hàng',
  PRODUCT_GROUP_STATUS_CHANGED: 'Đổi trạng thái nhóm hàng',
  SUPPLIER_CREATED: 'Tạo nhà cung cấp',
  SUPPLIER_UPDATED: 'Sửa nhà cung cấp',
  SUPPLIER_STATUS_CHANGED: 'Đổi trạng thái nhà cung cấp',
  AGENCY_CREATED: 'Tạo đại lý',
  AGENCY_UPDATED: 'Sửa đại lý',
  AGENCY_STATUS_CHANGED: 'Đổi trạng thái đại lý',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Tài khoản',
  role: 'Vai trò',
  inbound_receipt: 'Phiếu nhập',
  outbound_receipt: 'Phiếu xuất',
  agency_order: 'Đơn đại lý',
  stock_count: 'Phiếu kiểm kê',
  lot: 'Lô hàng',
  product: 'Sản phẩm',
  product_group: 'Nhóm hàng',
  supplier: 'Nhà cung cấp',
  agency: 'Đại lý',
  expiry_threshold: 'Ngưỡng HSD',
  expiry_alert: 'Cảnh báo HSD',
  treatment_proposal: 'Đề xuất xử lý',
  treatment_execution: 'Thực hiện phương án',
};

export function getEventLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function getEventTone(eventType: string): StatusTone {
  if (
    eventType.endsWith('_LOCKED') ||
    eventType.endsWith('_CANCELLED') ||
    eventType.endsWith('_REJECTED') ||
    eventType.endsWith('_BLOCKED') ||
    eventType.endsWith('_ENDED')
  ) {
    return 'critical';
  }
  if (
    eventType.endsWith('_CONFIRMED') ||
    eventType.endsWith('_APPROVED') ||
    eventType.endsWith('_CREATED') ||
    eventType.endsWith('_UNLOCKED') ||
    eventType.endsWith('_UNBLOCKED')
  ) {
    return 'active';
  }
  if (
    eventType.endsWith('_CHANGED') ||
    eventType.endsWith('_RESET') ||
    eventType.endsWith('_UPDATED') ||
    eventType.endsWith('_SUBMITTED')
  ) {
    return 'warning';
  }
  return 'neutral';
}

export function getEntityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function formatShortEntityId(entityId: string | null): string {
  if (!entityId) {
    return '—';
  }
  if (entityId.length <= 12) {
    return entityId;
  }
  return `${entityId.slice(0, 8)}…`;
}
