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
      { label: 'Sản phẩm', path: '/products', requiredPermission: 'catalog.read' },
      { label: 'Nhà cung cấp', path: '/suppliers', requiredPermission: 'catalog.read' },
      { label: 'Đại lý', path: '/agencies', requiredPermission: 'catalog.read' },
    ],
  },
  {
    title: 'Nhập kho',
    items: [
      { label: 'Phiếu nhập', path: '/inbound', requiredPermission: 'inbound.read' },
      { label: 'Tồn kho theo lô', path: '/inventory', requiredPermission: 'inventory.read' },
      { label: 'Lịch sử biến động', path: '/movements', requiredPermission: 'inventory.read' },
    ],
  },
  {
    title: 'Xuất kho',
    items: [
      { label: 'Đơn đại lý', path: '/orders', requiredPermission: 'orders.read' },
      { label: 'Phiếu xuất', path: '/outbound', requiredPermission: 'outbound.read' },
    ],
  },
  {
    title: 'Hàng cận hạn',
    items: [
      { label: 'Cảnh báo cận hạn', path: '/expiry-alerts', requiredPermission: 'expiry.read' },
      { label: 'Ngưỡng cảnh báo', path: '/expiry-thresholds', requiredPermission: 'expiry.read' },
    ],
  },
  {
    title: 'Phân tích AI',
    items: [
      { label: 'Dự báo nhu cầu', path: '/forecast', requiredPermission: 'forecast.read' },
      { label: 'Phân tích nguy cơ', path: '/risk', requiredPermission: 'analysis.read' },
      { label: 'Đề xuất xử lý', path: '/proposals', requiredPermission: 'proposals.read' },
      { label: 'Theo dõi thực hiện', path: '/executions', requiredPermission: 'executions.read' },
    ],
  },
  {
    title: 'Khác',
    items: [
      { label: 'Báo cáo', path: '/reports', requiredPermission: 'reports.read' },
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
