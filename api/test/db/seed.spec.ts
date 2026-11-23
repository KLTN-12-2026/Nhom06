import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { runSeed } from '../../prisma/seed';
import { PERMISSIONS, ROLE_PERMISSION_MATRIX, ROLES } from '../../prisma/seed/permissions';

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

  // AC6 + Plan review: đọc ma trận từ hằng số ROLE_PERMISSION_MATRIX
  it('ma trận quyền của 3 vai trò trong DB khớp đúng hằng số ROLE_PERMISSION_MATRIX', async () => {
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
      const expectedPerms = [...ROLE_PERMISSION_MATRIX[roleDef.code]].sort();

      expect(actualPerms).toEqual(expectedPerms);
    }
  });

  // AC6 bất biến phân quyền theo tài khoản demo
  it('manager có quyền duyệt đề xuất và kiểm kê; staff và admin không có; staff có quyền xác nhận nhập/xuất', async () => {
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

    const [adminPerms, managerPerms, staffPerms] = await Promise.all([
      getUserPermissions('admin'),
      getUserPermissions('manager'),
      getUserPermissions('staff'),
    ]);

    expect(managerPerms.has('proposals.approve')).toBe(true);
    expect(managerPerms.has('stock_count.approve')).toBe(true);

    expect(staffPerms.has('proposals.approve')).toBe(false);
    expect(staffPerms.has('stock_count.approve')).toBe(false);
    expect(adminPerms.has('proposals.approve')).toBe(false);
    expect(adminPerms.has('stock_count.approve')).toBe(false);

    expect(staffPerms.has('inbound.confirm')).toBe(true);
    expect(staffPerms.has('outbound.confirm')).toBe(true);
  });

  // AC6 mật khẩu bcrypt
  it('mật khẩu tài khoản demo lưu dạng bcrypt và khớp mật khẩu mặc định Demo@123 khi không đặt env', async () => {
    const expectedPassword = process.env.SEED_DEMO_PASSWORD || 'Demo@123';
    const users = await prisma.user.findMany({
      where: { username: { in: ['admin', 'manager', 'staff'] } },
      orderBy: { username: 'asc' },
    });

    expect(users).toHaveLength(3);
    for (const user of users) {
      expect(user.passwordHash.startsWith('$2')).toBe(true);
      await expect(bcrypt.compare(expectedPassword, user.passwordHash)).resolves.toBe(true);
    }
  });
});
