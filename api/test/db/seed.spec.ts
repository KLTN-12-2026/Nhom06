import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { runSeed } from '../../prisma/seed';
import { PERMISSIONS, ROLE_PERMISSION_MATRIX, ROLES, RoleCode } from '../../prisma/seed/permissions';

const EXPECTED_D016_MATRIX: Record<RoleCode, readonly string[]> = {
  ADMIN: [
    'users.read',
    'users.manage',
    'roles.read',
    'roles.manage',
    'audit.read',
    'catalog.read',
    'catalog.manage',
    'inbound.read',
    'inbound.create',
    'inbound.confirm',
    'inventory.read',
    'stock_count.create',
    'stock_count.approve',
    'orders.read',
    'orders.create',
    'orders.cancel',
    'outbound.read',
    'outbound.create',
    'outbound.confirm',
    'expiry.read',
    'expiry.manage',
    'forecast.read',
    'analysis.read',
    'analysis.run',
    'proposals.read',
    'executions.read',
    'executions.update',
    'reports.read',
  ],
  WAREHOUSE_MANAGER: [
    'catalog.read',
    'catalog.manage',
    'inbound.read',
    'inbound.confirm',
    'inventory.read',
    'stock_count.create',
    'stock_count.approve',
    'orders.read',
    'outbound.read',
    'outbound.confirm',
    'expiry.read',
    'expiry.manage',
    'forecast.read',
    'analysis.read',
    'analysis.run',
    'proposals.read',
    'proposals.approve',
    'executions.read',
    'executions.update',
    'reports.read',
  ],
  WAREHOUSE_STAFF: [
    'catalog.read',
    'catalog.manage',
    'inbound.read',
    'inbound.create',
    'inbound.confirm',
    'inventory.read',
    'stock_count.create',
    'orders.read',
    'orders.create',
    'orders.cancel',
    'outbound.read',
    'outbound.create',
    'outbound.confirm',
    'expiry.read',
    'forecast.read',
    'analysis.read',
    'proposals.read',
    'executions.read',
    'executions.update',
  ],
};

describe('Dữ liệu seed cơ bản và phân quyền (T-004)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function countSeedTables() {
    const [
      roles,
      permissions,
      rolePermissions,
      users,
      userRoles,
      productGroups,
      products,
      suppliers,
      agencies,
      expiryThresholds,
    ] = await Promise.all([
      prisma.role.count(),
      prisma.permission.count(),
      prisma.rolePermission.count(),
      prisma.user.count(),
      prisma.userRole.count(),
      prisma.productGroup.count(),
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.agency.count(),
      prisma.expiryThreshold.count(),
    ]);

    return {
      roles,
      permissions,
      rolePermissions,
      users,
      userRoles,
      productGroups,
      products,
      suppliers,
      agencies,
      expiryThresholds,
    };
  }

  // AC5
  it('chạy seed hai lần liên tiếp không lỗi và số dòng không đổi ở lần hai', async () => {
    await runSeed(prisma);
    const countsAfterFirst = await countSeedTables();

    await runSeed(prisma);
    const countsAfterSecond = await countSeedTables();

    expect(countsAfterSecond).toEqual(countsAfterFirst);
    expect(countsAfterSecond).toMatchObject({
      roles: 3,
      permissions: PERMISSIONS.length,
      users: 3,
      userRoles: 3,
      productGroups: 4,
      products: 20,
      suppliers: 3,
      agencies: 5,
      expiryThresholds: 1,
    });
  });

  // AC5 chi tiết mã danh mục và ngưỡng HSD
  it('có đủ 4 nhóm hàng, 20 sản phẩm SP001..SP020 (5/nhóm), 3 NCC, 5 đại lý và 1 ngưỡng HSD chung', async () => {
    const groups = await prisma.productGroup.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { code: 'asc' },
    });
    expect(groups.map((g) => g.code)).toEqual(['BANH_KEO', 'NGK', 'SUA', 'SUA_CHUA']);
    for (const group of groups) {
      expect(group._count.products).toBe(5);
    }

    const products = await prisma.product.findMany({ orderBy: { code: 'asc' } });
    const expectedCodes = Array.from({ length: 20 }, (_, i) => `SP${String(i + 1).padStart(3, '0')}`);
    expect(products.map((p) => p.code)).toEqual(expectedCodes);

    const suppliers = await prisma.supplier.findMany({ orderBy: { code: 'asc' } });
    expect(suppliers.map((s) => s.code)).toEqual(['NCC001', 'NCC002', 'NCC003']);

    const agencies = await prisma.agency.findMany({ orderBy: { code: 'asc' } });
    expect(agencies.map((a) => a.code)).toEqual(['DL001', 'DL002', 'DL003', 'DL004', 'DL005']);

    const thresholds = await prisma.expiryThreshold.findMany();
    expect(thresholds).toHaveLength(1);
    expect(thresholds[0]).toMatchObject({
      warningDays: 30,
      criticalDays: 7,
    });
  });

  // AC6 + D-016: kiểm chứng bằng bảng mong đợi đầy đủ cho cả 3 vai trò
  it('ma trận quyền của 3 vai trò trong DB khớp đúng quyết định D-016 và hằng số ROLE_PERMISSION_MATRIX', async () => {
    for (const roleDef of ROLES) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: roleDef.code },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      const actualPerms = role.rolePermissions.map((rp) => rp.permission.code).sort();
      const matrixPerms = [...ROLE_PERMISSION_MATRIX[roleDef.code]].sort();
      const expectedPerms = [...EXPECTED_D016_MATRIX[roleDef.code]].sort();

      expect(matrixPerms).toEqual(expectedPerms);
      expect(actualPerms).toEqual(expectedPerms);
    }
  });

  // AC6 bất biến phân quyền theo tài khoản demo D-016
  it('quanly là tài khoản duy nhất có proposals.approve và không có inbound.create; nhanvien có inbound/outbound.confirm nhưng không có stock_count.approve', async () => {
    async function getUserPermissions(username: string): Promise<Set<string>> {
      const user = await prisma.user.findUniqueOrThrow({
        where: { username },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });

      const perms = new Set<string>();
      for (const ur of user.userRoles) {
        for (const rp of ur.role.rolePermissions) {
          perms.add(rp.permission.code);
        }
      }
      return perms;
    }

    const [adminPerms, quanlyPerms, nhanvienPerms] = await Promise.all([
      getUserPermissions('admin'),
      getUserPermissions('quanly'),
      getUserPermissions('nhanvien'),
    ]);

    // Chỉ quanly có proposals.approve
    expect(quanlyPerms.has('proposals.approve')).toBe(true);
    expect(adminPerms.has('proposals.approve')).toBe(false);
    expect(nhanvienPerms.has('proposals.approve')).toBe(false);

    // quanly không lập phiếu nhập/đơn/phiếu xuất hay quản trị tài khoản
    expect(quanlyPerms.has('inbound.create')).toBe(false);
    expect(quanlyPerms.has('orders.create')).toBe(false);
    expect(quanlyPerms.has('orders.cancel')).toBe(false);
    expect(quanlyPerms.has('outbound.create')).toBe(false);
    expect(quanlyPerms.has('users.manage')).toBe(false);
    expect(quanlyPerms.has('roles.manage')).toBe(false);
    expect(quanlyPerms.has('audit.read')).toBe(false);

    // nhanvien có xác nhận nhập/xuất, quản lý danh mục; không duyệt kiểm kê hay xem báo cáo
    expect(nhanvienPerms.has('inbound.confirm')).toBe(true);
    expect(nhanvienPerms.has('outbound.confirm')).toBe(true);
    expect(nhanvienPerms.has('catalog.manage')).toBe(true);
    expect(nhanvienPerms.has('stock_count.approve')).toBe(false);
    expect(nhanvienPerms.has('expiry.manage')).toBe(false);
    expect(nhanvienPerms.has('analysis.run')).toBe(false);
    expect(nhanvienPerms.has('reports.read')).toBe(false);

    // Cả 3 vai trò đều có catalog.manage theo D-016
    expect(adminPerms.has('catalog.manage')).toBe(true);
    expect(quanlyPerms.has('catalog.manage')).toBe(true);
  });

  // AC6 tài khoản demo D-016 & mật khẩu bcrypt mặc định 123456
  it('tài khoản demo admin/quanly/nhanvien đúng họ tên, lưu mật khẩu bcrypt và khớp 123456 khi không đặt env', async () => {
    const expectedPassword = process.env.SEED_DEMO_PASSWORD || '123456';
    const users = await prisma.user.findMany({
      where: { username: { in: ['admin', 'quanly', 'nhanvien'] } },
      orderBy: { username: 'asc' },
    });

    expect(users.map((u) => ({ username: u.username, email: u.email, fullName: u.fullName }))).toEqual([
      { username: 'admin', email: 'admin@kho-ai.local', fullName: 'Phan Thanh Đức' },
      { username: 'nhanvien', email: 'nhanvien@kho-ai.local', fullName: 'Trương Thành Lê' },
      { username: 'quanly', email: 'quanly@kho-ai.local', fullName: 'Nguyễn Văn Dương' },
    ]);

    for (const user of users) {
      expect(user.passwordHash.startsWith('$2')).toBe(true);
      await expect(bcrypt.compare(expectedPassword, user.passwordHash)).resolves.toBe(true);
    }
  });
});
