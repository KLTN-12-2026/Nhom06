export interface NavItem {
  label: string;
  path: string;
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
      { label: 'Sản phẩm', path: '/products' },
      { label: 'Nhà cung cấp', path: '/suppliers' },
      { label: 'Đại lý', path: '/agencies' },
    ],
  },
  {
    title: 'Nhập kho',
    items: [
      { label: 'Phiếu nhập', path: '/inbound' },
      { label: 'Tồn kho theo lô', path: '/inventory' },
      { label: 'Lịch sử biến động', path: '/movements' },
    ],
  },
  {
    title: 'Xuất kho',
    items: [
      { label: 'Đơn đại lý', path: '/orders' },
      { label: 'Phiếu xuất', path: '/outbound' },
    ],
  },
  {
    title: 'Hàng cận hạn',
    items: [
      { label: 'Cảnh báo cận hạn', path: '/expiry-alerts' },
      { label: 'Ngưỡng cảnh báo', path: '/expiry-thresholds' },
    ],
  },
  {
    title: 'Phân tích AI',
    items: [
      { label: 'Dự báo nhu cầu', path: '/forecast' },
      { label: 'Phân tích nguy cơ', path: '/risk' },
      { label: 'Đề xuất xử lý', path: '/proposals' },
      { label: 'Theo dõi thực hiện', path: '/executions' },
    ],
  },
  {
    title: 'Khác',
    items: [
      { label: 'Báo cáo', path: '/reports' },
      { label: 'Tài khoản', path: '/users' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
