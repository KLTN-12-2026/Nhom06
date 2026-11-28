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
        pageDescription: 'Quản lý sản phẩm và hạn dùng',
      },
      {
        label: 'Nhà cung cấp',
        path: '/suppliers',
        requiredPermission: 'catalog.read',
        pageDescription: 'Quản lý thông tin nhà cung cấp',
      },
      {
        label: 'Đại lý',
        path: '/agencies',
        requiredPermission: 'catalog.read',
        pageDescription: 'Quản lý thông tin đại lý',
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
        pageDescription: 'Lập và theo dõi phiếu nhập',
      },
      {
        label: 'Tồn kho theo lô',
        path: '/inventory',
        requiredPermission: 'inventory.read',
        pageTitle: 'Tồn kho theo lô',
        pageDescription: 'Theo dõi số lượng tồn theo từng lô',
      },
      {
        label: 'Lịch sử biến động',
        path: '/stock-movements',
        requiredPermission: 'inventory.read',
        pageTitle: 'Lịch sử biến động tồn kho',
        pageDescription: 'Tra cứu lịch sử nhập, xuất, điều chỉnh',
      },
      {
        label: 'Kiểm kê kho',
        path: '/stock-counts',
        requiredPermission: 'inventory.read',
        pageTitle: 'Phiếu kiểm kê kho',
        pageDescription: 'Lập và duyệt phiếu kiểm kê',
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
        pageDescription: 'Lập và theo dõi đơn đại lý',
      },
      {
        label: 'Phiếu xuất',
        path: '/outbound',
        requiredPermission: 'outbound.read',
        pageTitle: 'Phiếu xuất kho',
        pageDescription: 'Theo dõi hàng đã xuất theo từng lô',
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
        pageDescription: 'Theo dõi lô hết hạn và cận hạn',
      },
      {
        label: 'Ngưỡng cảnh báo',
        path: '/expiry-thresholds',
        requiredPermission: 'expiry.read',
        pageTitle: 'Ngưỡng cảnh báo hạn sử dụng',
        pageDescription: 'Thiết lập ngưỡng cảnh báo hạn dùng',
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
        pageDescription: 'Dự báo nhu cầu theo từng sản phẩm',
      },
      {
        label: 'Phân tích tồn dư',
        path: '/risk',
        requiredPermission: 'analysis.read',
        pageTitle: 'Phân tích nguy cơ tồn dư',
        pageDescription: 'Đánh giá tồn dư và rủi ro từng lô',
      },
      {
        label: 'Đề xuất xử lý',
        path: '/proposals',
        requiredPermission: 'proposals.read',
        pageTitle: 'Đề xuất xử lý hàng cận hạn',
        pageDescription: 'Xem xét phương án xử lý hàng cận hạn',
      },
      {
        label: 'Theo dõi thực hiện',
        path: '/executions',
        requiredPermission: 'executions.read',
        pageTitle: 'Theo dõi thực hiện phương án',
        pageDescription: 'Cập nhật kết quả thực hiện phương án',
      },
    ],
  },
  {
    title: 'Khác',
    items: [
      {
        label: 'Báo cáo',
        path: '/reports',
        requiredPermission: 'reports.read',
        pageTitle: 'Báo cáo nhập, xuất, tồn',
        pageDescription: 'Tổng hợp số liệu nhập, xuất, tồn',
      },
      {
        label: 'Tài khoản',
        path: '/users',
        requiredPermission: 'users.read',
        pageTitle: 'Tài khoản và phân quyền',
        pageDescription: 'Quản lý tài khoản và phân quyền',
      },
      {
        label: 'Nhật ký hệ thống',
        path: '/audit-logs',
        requiredPermission: 'audit.read',
        pageTitle: 'Nhật ký hệ thống',
        pageDescription: 'Tra cứu lịch sử thao tác',
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
