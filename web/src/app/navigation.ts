export interface NavItem {
  label: string;
  path: string;
  requiredPermission?: string;
  pageTitle?: string;
  pageDescription?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Tổng quan',
    items: [{ label: 'Bảng điều khiển', path: '/' }],
  },
  {
    title: 'Danh mục',
    items: [
      {
        label: 'Sản phẩm',
        path: '/products',
        requiredPermission: 'catalog.read',
        pageDescription: 'Danh mục mặt hàng lưu kho theo lô và hạn sử dụng',
      },
      {
        label: 'Nhà cung cấp',
        path: '/suppliers',
        requiredPermission: 'catalog.read',
        pageDescription: 'Nhà cung cấp không có tài khoản đăng nhập',
      },
      {
        label: 'Đại lý',
        path: '/agencies',
        requiredPermission: 'catalog.read',
        pageDescription: 'Đơn hàng do nhân viên kho nhập hộ, đại lý không tự đăng nhập',
      },
    ],
  },
  {
    title: 'Nhập kho',
    items: [
      {
        label: 'Phiếu nhập',
        path: '/inbound',
        requiredPermission: 'inbound.read',
        pageTitle: 'Phiếu nhập kho',
        pageDescription: 'Tồn kho chỉ tăng khi phiếu được xác nhận',
      },
      {
        label: 'Tồn kho theo lô',
        path: '/inventory',
        requiredPermission: 'inventory.read',
        pageTitle: 'Tồn kho theo lô',
        pageDescription:
          'Số tồn chỉ thay đổi qua phiếu nhập, phiếu xuất hoặc phiếu kiểm kê đã xác nhận',
      },
      {
        label: 'Lịch sử biến động',
        path: '/stock-movements',
        requiredPermission: 'inventory.read',
        pageTitle: 'Lịch sử biến động tồn kho',
        pageDescription: 'Mỗi dòng gắn với một chứng từ đã xác nhận và không thể sửa',
      },
      {
        label: 'Kiểm kê kho',
        path: '/stock-counts',
        requiredPermission: 'inventory.read',
        pageTitle: 'Phiếu kiểm kê kho',
        pageDescription: 'Đối chiếu tồn thực tế theo lô; tồn kho chỉ thay đổi khi phiếu được duyệt',
      },
    ],
  },
  {
    title: 'Xuất kho',
    items: [
      {
        label: 'Đơn đại lý',
        path: '/orders',
        requiredPermission: 'orders.read',
        pageTitle: 'Đơn đặt hàng đại lý',
        pageDescription: 'Tạo đơn không làm giảm tồn kho',
      },
      {
        label: 'Phiếu xuất',
        path: '/outbound',
        requiredPermission: 'outbound.read',
        pageTitle: 'Phiếu xuất kho',
        pageDescription: 'Chỉ hiển thị phiếu đã xác nhận; tồn kho đã giảm theo từng lô',
      },
    ],
  },
  {
    title: 'Hàng cận hạn',
    items: [
      {
        label: 'Cảnh báo cận hạn',
        path: '/expiry-alerts',
        requiredPermission: 'expiry.read',
        pageTitle: 'Cảnh báo hàng cận hạn',
        pageDescription: 'Theo dõi các lô đã hết hạn và cận hạn còn tồn theo múi giờ Asia/Ho_Chi_Minh',
      },
      {
        label: 'Ngưỡng cảnh báo',
        path: '/expiry-thresholds',
        requiredPermission: 'expiry.read',
        pageTitle: 'Ngưỡng cảnh báo hạn sử dụng',
        pageDescription:
          'Ngưỡng theo sản phẩm được ưu tiên hơn ngưỡng theo nhóm hàng, nhóm hàng ưu tiên hơn ngưỡng chung',
      },
    ],
  },
  {
    title: 'Phân tích AI',
    items: [
      {
        label: 'Dự báo nhu cầu',
        path: '/forecast',
        requiredPermission: 'forecast.read',
        pageTitle: 'Dự báo nhu cầu tiêu thụ',
        pageDescription: 'Ước lượng nhu cầu tiêu thụ và đối chiếu tồn kho hiện tại',
      },
      {
        label: 'Phân tích tồn dư',
        path: '/risk',
        requiredPermission: 'analysis.read',
        pageTitle: 'Phân tích nguy cơ tồn dư',
        pageDescription: 'Ước lượng tồn dư theo FEFO và mức rủi ro cận hạn của từng lô',
      },
      { label: 'Đề xuất xử lý', path: '/proposals', requiredPermission: 'proposals.read' },
      { label: 'Theo dõi thực hiện', path: '/executions', requiredPermission: 'executions.read' },
    ],
  },
  {
    title: 'Khác',
    items: [
      {
        label: 'Báo cáo',
        path: '/reports',
        requiredPermission: 'reports.read',
        pageTitle: 'Báo cáo nhập — xuất — tồn',
        pageDescription: 'Chỉ tính chứng từ kho đã xác nhận',
      },
      {
        label: 'Tài khoản',
        path: '/users',
        requiredPermission: 'users.read',
        pageTitle: 'Tài khoản và phân quyền',
        pageDescription: 'Ba vai trò nội bộ; đại lý và nhà cung cấp không có tài khoản đăng nhập',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function filterNavGroups(hasPermission: (code?: string) => boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(item.requiredPermission)),
  })).filter((group) => group.items.length > 0);
}
