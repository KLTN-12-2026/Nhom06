import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AGENCIES, PRODUCT_GROUPS, PRODUCTS, SUPPLIERS } from './seed/catalog';
import { PERMISSIONS, ROLE_PERMISSION_MATRIX, ROLES, RoleCode } from './seed/permissions';

interface DemoUserSeed {
  username: string;
  email: string;
  fullName: string;
  roleCode: RoleCode;
}

const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    username: 'admin',
    email: 'admin@kho-ai.local',
    fullName: 'Phan Thanh Đức',
    roleCode: 'ADMIN',
  },
  {
    username: 'quanly',
    email: 'quanly@kho-ai.local',
    fullName: 'Nguyễn Văn Dương',
    roleCode: 'WAREHOUSE_MANAGER',
  },
  {
    username: 'nhanvien',
    email: 'nhanvien@kho-ai.local',
    fullName: 'Trương Thành Lê',
    roleCode: 'WAREHOUSE_STAFF',
  },
];

const BCRYPT_ROUNDS = 10;
const DEFAULT_THRESHOLD_EFFECTIVE_FROM = new Date('2026-01-01');

export async function runSeed(prisma: PrismaClient): Promise<void> {
  // 1. Vai trò
  const roleByCode = new Map<RoleCode, string>();
  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        status: 'active',
      },
      create: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        status: 'active',
      },
    });
    roleByCode.set(roleDef.code, role.id);
  }

  // 2. Quyền hệ thống
  const permissionByCode = new Map<string, string>();
  for (const permDef of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: permDef.code },
      update: {
        module: permDef.module,
        action: permDef.action,
        description: permDef.description,
      },
      create: {
        code: permDef.code,
        module: permDef.module,
        action: permDef.action,
        description: permDef.description,
      },
    });
    permissionByCode.set(permDef.code, perm.id);
  }

  // 3. Tài khoản demo (băm bcrypt cost 10)
  const demoPassword = process.env.SEED_DEMO_PASSWORD || '123456';
  const passwordHash = await bcrypt.hash(demoPassword, BCRYPT_ROUNDS);

  const userByUsername = new Map<string, string>();
  for (const userDef of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { username: userDef.username },
      update: {
        email: userDef.email,
        fullName: userDef.fullName,
        passwordHash,
        status: 'active',
      },
      create: {
        username: userDef.username,
        email: userDef.email,
        fullName: userDef.fullName,
        passwordHash,
        status: 'active',
      },
    });
    userByUsername.set(userDef.username, user.id);
  }

  const adminId = userByUsername.get('admin');
  if (!adminId) {
    throw new Error('Không tìm thấy tài khoản admin sau khi seed');
  }

  // 4. Gán vai trò cho tài khoản demo
  for (const userDef of DEMO_USERS) {
    const userId = userByUsername.get(userDef.username);
    const roleId = roleByCode.get(userDef.roleCode);
    if (!userId || !roleId) {
      throw new Error(`Thiếu userId hoặc roleId cho tài khoản ${userDef.username}`);
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: {
        userId,
        roleId,
        assignedBy: adminId,
      },
    });
  }

  // 5. Gán ma trận quyền cho 3 vai trò (đồng bộ đúng ROLE_PERMISSION_MATRIX)
  for (const roleDef of ROLES) {
    const roleId = roleByCode.get(roleDef.code);
    if (!roleId) {
      throw new Error(`Thiếu roleId cho vai trò ${roleDef.code}`);
    }
    const allowedPermissionIds: string[] = [];
    for (const permCode of ROLE_PERMISSION_MATRIX[roleDef.code]) {
      const permissionId = permissionByCode.get(permCode);
      if (!permissionId) {
        throw new Error(`Quyền không tồn tại trong danh sách PERMISSIONS: ${permCode}`);
      }
      allowedPermissionIds.push(permissionId);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: {
          roleId,
          permissionId,
          grantedBy: adminId,
        },
      });
    }

    // Gỡ quyền không còn trong ma trận nếu cấu hình thay đổi giữa các lần seed
    await prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { notIn: allowedPermissionIds },
      },
    });
  }

  // 6. Danh mục nhóm hàng
  const groupByCode = new Map<string, string>();
  for (const groupDef of PRODUCT_GROUPS) {
    const group = await prisma.productGroup.upsert({
      where: { code: groupDef.code },
      update: {
        name: groupDef.name,
        description: groupDef.description,
        status: 'active',
      },
      create: {
        code: groupDef.code,
        name: groupDef.name,
        description: groupDef.description,
        status: 'active',
      },
    });
    groupByCode.set(groupDef.code, group.id);
  }

  // 7. Danh mục 20 sản phẩm SP001..SP020
  for (const productDef of PRODUCTS) {
    const groupId = groupByCode.get(productDef.groupCode);
    if (!groupId) {
      throw new Error(`Không tìm thấy nhóm hàng ${productDef.groupCode}`);
    }
    await prisma.product.upsert({
      where: { code: productDef.code },
      update: {
        name: productDef.name,
        groupId,
        unit: productDef.unit,
        status: 'active',
      },
      create: {
        code: productDef.code,
        name: productDef.name,
        groupId,
        unit: productDef.unit,
        status: 'active',
      },
    });
  }

  // 8. 3 nhà cung cấp
  for (const supplierDef of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { code: supplierDef.code },
      update: {
        name: supplierDef.name,
        phone: supplierDef.phone,
        email: supplierDef.email,
        address: supplierDef.address,
        status: 'active',
      },
      create: {
        code: supplierDef.code,
        name: supplierDef.name,
        phone: supplierDef.phone,
        email: supplierDef.email,
        address: supplierDef.address,
        status: 'active',
      },
    });
  }

  // 9. 5 đại lý
  for (const agencyDef of AGENCIES) {
    await prisma.agency.upsert({
      where: { code: agencyDef.code },
      update: {
        name: agencyDef.name,
        contactName: agencyDef.contactName,
        phone: agencyDef.phone,
        email: agencyDef.email,
        address: agencyDef.address,
        status: 'active',
      },
      create: {
        code: agencyDef.code,
        name: agencyDef.name,
        contactName: agencyDef.contactName,
        phone: agencyDef.phone,
        email: agencyDef.email,
        address: agencyDef.address,
        status: 'active',
      },
    });
  }

  // 10. 1 ngưỡng cảnh báo HSD chung (idempotent theo effective_from + effective_to NULL)
  const existingThreshold = await prisma.expiryThreshold.findFirst({
    where: {
      effectiveFrom: DEFAULT_THRESHOLD_EFFECTIVE_FROM,
      effectiveTo: null,
    },
  });

  if (existingThreshold) {
    await prisma.expiryThreshold.update({
      where: { id: existingThreshold.id },
      data: {
        warningDays: 30,
        criticalDays: 7,
        createdBy: adminId,
      },
    });
  } else {
    await prisma.expiryThreshold.create({
      data: {
        warningDays: 30,
        criticalDays: 7,
        effectiveFrom: DEFAULT_THRESHOLD_EFFECTIVE_FROM,
        effectiveTo: null,
        createdBy: adminId,
      },
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Lỗi khi chạy seed dữ liệu KHO-AI:', error);
    process.exit(1);
  });
}
