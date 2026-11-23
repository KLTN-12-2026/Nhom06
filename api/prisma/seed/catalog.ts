export type ProductGroupCode = 'SUA' | 'SUA_CHUA' | 'NGK' | 'BANH_KEO';

export interface ProductGroupSeed {
  code: ProductGroupCode;
  name: string;
  description: string;
}

export interface ProductSeed {
  code: string;
  name: string;
  groupCode: ProductGroupCode;
  unit: string;
  shelfLifeDays: number;
}

export interface SupplierSeed {
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface AgencySeed {
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
}

export const PRODUCT_GROUPS: readonly ProductGroupSeed[] = [
  { code: 'SUA', name: 'Sữa', description: 'Các sản phẩm sữa tiệt trùng, sữa đặc và sữa hạt' },
  { code: 'SUA_CHUA', name: 'Sữa chua', description: 'Sữa chua ăn và sữa chua uống các loại' },
  { code: 'NGK', name: 'Nước giải khát', description: 'Nước lọc, trà đóng chai, nước ngọt và nước ép' },
  { code: 'BANH_KEO', name: 'Bánh kẹo', description: 'Bánh quy, bánh bông lan, kẹo và snack đóng gói' },
] as const;

/**
 * 20 sản phẩm mẫu khớp mã SP001..SP020 và nhóm với dữ liệu mô phỏng của dịch vụ ML
 * (chép cứng giá trị vào seed, không đọc file ngoài `api/` lúc chạy).
 */
export const PRODUCTS: readonly ProductSeed[] = [
  { code: 'SP001', name: 'Sữa tươi tiệt trùng 1L', groupCode: 'SUA', unit: 'thùng', shelfLifeDays: 180 },
  { code: 'SP002', name: 'Sữa tươi ít đường 180ml lốc 4', groupCode: 'SUA', unit: 'thùng', shelfLifeDays: 180 },
  { code: 'SP003', name: 'Sữa đặc có đường lon 380g', groupCode: 'SUA', unit: 'thùng', shelfLifeDays: 365 },
  { code: 'SP004', name: 'Sữa hạt nguyên chất 1L', groupCode: 'SUA', unit: 'thùng', shelfLifeDays: 180 },
  { code: 'SP005', name: 'Sữa tiệt trùng sô-cô-la lốc 4', groupCode: 'SUA', unit: 'thùng', shelfLifeDays: 180 },

  { code: 'SP006', name: 'Sữa chua trắng có đường lốc 4', groupCode: 'SUA_CHUA', unit: 'thùng', shelfLifeDays: 45 },
  { code: 'SP007', name: 'Sữa chua không đường lốc 4', groupCode: 'SUA_CHUA', unit: 'thùng', shelfLifeDays: 45 },
  { code: 'SP008', name: 'Sữa chua trái cây lốc 4', groupCode: 'SUA_CHUA', unit: 'thùng', shelfLifeDays: 45 },
  { code: 'SP009', name: 'Sữa chua uống hương cam lốc 4', groupCode: 'SUA_CHUA', unit: 'thùng', shelfLifeDays: 45 },
  { code: 'SP010', name: 'Sữa chua uống hương dâu lốc 4', groupCode: 'SUA_CHUA', unit: 'thùng', shelfLifeDays: 45 },

  { code: 'SP011', name: 'Nước lọc đóng chai thùng 24', groupCode: 'NGK', unit: 'thùng', shelfLifeDays: 540 },
  { code: 'SP012', name: 'Trà xanh đóng chai thùng 24', groupCode: 'NGK', unit: 'thùng', shelfLifeDays: 300 },
  { code: 'SP013', name: 'Nước ngọt có ga thùng 24', groupCode: 'NGK', unit: 'thùng', shelfLifeDays: 365 },
  { code: 'SP014', name: 'Nước tăng lực thùng 24', groupCode: 'NGK', unit: 'thùng', shelfLifeDays: 365 },
  { code: 'SP015', name: 'Nước ép trái cây hộp 1L', groupCode: 'NGK', unit: 'thùng', shelfLifeDays: 270 },

  { code: 'SP016', name: 'Bánh quy bơ hộp thiếc', groupCode: 'BANH_KEO', unit: 'thùng', shelfLifeDays: 300 },
  { code: 'SP017', name: 'Bánh bông lan đóng gói thùng', groupCode: 'BANH_KEO', unit: 'thùng', shelfLifeDays: 240 },
  { code: 'SP018', name: 'Kẹo mềm trái cây gói', groupCode: 'BANH_KEO', unit: 'thùng', shelfLifeDays: 365 },
  { code: 'SP019', name: 'Snack khoai tây thùng', groupCode: 'BANH_KEO', unit: 'thùng', shelfLifeDays: 240 },
  { code: 'SP020', name: 'Bánh gạo giòn gói', groupCode: 'BANH_KEO', unit: 'thùng', shelfLifeDays: 300 },
] as const;

export const SUPPLIERS: readonly SupplierSeed[] = [
  {
    code: 'NCC001',
    name: 'Công ty TNHH Phân phối Thực phẩm Sông Hàn',
    phone: '02363811001',
    email: 'lienhe@songhanfood.local',
    address: 'KCN Hòa Khánh, Quận Liên Chiểu, TP. Đà Nẵng',
  },
  {
    code: 'NCC002',
    name: 'Công ty Cổ phần Đồ uống Miền Trung',
    phone: '02363811002',
    email: 'kinhdoanh@douongmientrung.local',
    address: 'Đường số 3, KCN Đà Nẵng, Quận Sơn Trà, TP. Đà Nẵng',
  },
  {
    code: 'NCC003',
    name: 'Công ty TNHH Bánh Kẹo và Sữa Hải Vân',
    phone: '02363811003',
    email: 'sales@haivanfoods.local',
    address: 'KCN Hòa Cầm, Quận Cẩm Lệ, TP. Đà Nẵng',
  },
] as const;

export const AGENCIES: readonly AgencySeed[] = [
  {
    code: 'DL001',
    name: 'Đại lý Minh Tâm Hải Châu',
    contactName: 'Nguyễn Minh Tâm',
    phone: '0905110001',
    email: 'minhtam.hc@agency.local',
    address: '124 Phan Châu Trinh, Quận Hải Châu, TP. Đà Nẵng',
  },
  {
    code: 'DL002',
    name: 'Cửa hàng Tổng hợp Thanh Khê',
    contactName: 'Trần Thị Bích Ngọc',
    phone: '0905110002',
    email: 'tonghop.tk@agency.local',
    address: '285 Điện Biên Phủ, Quận Thanh Khê, TP. Đà Nẵng',
  },
  {
    code: 'DL003',
    name: 'Đại lý An Phú Sơn Trà',
    contactName: 'Lê Văn An',
    phone: '0905110003',
    email: 'anphu.st@agency.local',
    address: '68 Ngô Quyền, Quận Sơn Trà, TP. Đà Nẵng',
  },
  {
    code: 'DL004',
    name: 'Siêu thị Mini Ngũ Hành Sơn',
    contactName: 'Phạm Quốc Huy',
    phone: '0905110004',
    email: 'minimart.nhs@agency.local',
    address: '412 Lê Văn Hiến, Quận Ngũ Hành Sơn, TP. Đà Nẵng',
  },
  {
    code: 'DL005',
    name: 'Đại lý Hòa Khánh Liên Chiểu',
    contactName: 'Võ Thị Thu Hà',
    phone: '0905110005',
    email: 'hoakhanh.lc@agency.local',
    address: '96 Tôn Đức Thắng, Quận Liên Chiểu, TP. Đà Nẵng',
  },
] as const;
