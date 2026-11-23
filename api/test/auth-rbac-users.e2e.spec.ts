import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ROLE_PERMISSION_MATRIX } from '../prisma/seed/permissions';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    role: { code: string; name: string };
    permissions: string[];
  };
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const E2E_USERNAME_PREFIX = 'e2e_t005_';

describe('Xác thực JWT, phân quyền RBAC và quản lý tài khoản (T-005 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  let testStartedAt: Date;

  beforeAll(async () => {
    testStartedAt = new Date();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      // Khôi phục tuyệt đối 3 tài khoản demo về trạng thái gốc để không ảnh hưởng seed.spec.ts và task sau
      const demoRoleMap: Record<string, string> = {
        admin: 'ADMIN',
        quanly: 'WAREHOUSE_MANAGER',
        nhanvien: 'WAREHOUSE_STAFF',
      };

      const roles = await prisma.role.findMany({
        where: { code: { in: Object.values(demoRoleMap) } },
      });
      const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]));

      const demoUsers = await prisma.user.findMany({
        where: { username: { in: Object.keys(demoRoleMap) } },
      });
      const adminUser = demoUsers.find((u) => u.username === 'admin');

      for (const user of demoUsers) {
        const expectedRoleId = roleIdByCode.get(demoRoleMap[user.username]);
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'active', tokenVersion: 0 },
        });
        if (expectedRoleId) {
          await prisma.userRole.deleteMany({ where: { userId: user.id } });
          await prisma.userRole.create({
            data: {
              userId: user.id,
              roleId: expectedRoleId,
              assignedBy: adminUser?.id ?? null,
            },
          });
        }
      }

      // Xóa audit_logs sinh ra trong quá trình chạy e2e
      await prisma.auditLog.deleteMany({
        where: {
          createdAt: { gte: testStartedAt },
        },
      });

      // Xóa user test tạo ra trong e2e
      const testUsers = await prisma.user.findMany({
        where: {
          OR: [
            { id: { in: createdUserIds } },
            { username: { startsWith: E2E_USERNAME_PREFIX } },
          ],
        },
        select: { id: true },
      });
      const idsToDelete = testUsers.map((u) => u.id);
      if (idsToDelete.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [{ actorUserId: { in: idsToDelete } }, { entityId: { in: idsToDelete } }],
          },
        });
        await prisma.userRole.deleteMany({
          where: { userId: { in: idsToDelete } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function loginAs(username: string, password = DEMO_PASSWORD): Promise<LoginResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return res.body as LoginResponseBody;
  }

  // AC1
  describe('AC1: Đăng nhập hợp lệ, sai mật khẩu và validate đầu vào', () => {
    it('đăng nhập quanly/123456 trả 200 với token, role WAREHOUSE_MANAGER và permissions khớp D-016', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'quanly', password: DEMO_PASSWORD })
        .expect(200);

      const body = res.body as LoginResponseBody;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(20);
      expect(body.user.username).toBe('quanly');
      expect(body.user.fullName).toBe('Nguyễn Văn Dương');
      expect(body.user.role).toEqual({ code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' });
      expect([...body.user.permissions].sort()).toEqual(
        [...ROLE_PERMISSION_MATRIX.WAREHOUSE_MANAGER].sort(),
      );
      expect(body.user).not.toHaveProperty('passwordHash');
    });

    it('sai mật khẩu trả 401 đúng thông báo chung không tiết lộ trường sai', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'quanly', password: 'wrong-password' })
        .expect(401);

      expect(res.body).toMatchObject({
        statusCode: 401,
        message: 'Tên đăng nhập hoặc mật khẩu không đúng',
      });
    });

    it('để trống username hoặc password trả 400 có danh sách errors chỉ rõ từng trường', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: '', password: '' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const fields = (res.body.errors as Array<{ field: string; message: string }>).map(
        (e) => e.field,
      );
      expect(fields).toEqual(expect.arrayContaining(['username', 'password']));
    });
  });

  // AC2
  describe('AC2: Khóa/mở tài khoản thu hồi phiên ngay lập tức và ghi audit_logs', () => {
    it('khóa nhanvien khiến token đang có bị 401 ngay, login bị 403, mở khóa đăng nhập lại được và ghi 2 dòng audit khóa/mở', async () => {
      const adminAuth = await loginAs('admin');
      const staffAuth = await loginAs('nhanvien');
      const staffId = staffAuth.user.id;

      // Token của nhanvien hoạt động trước khi khóa
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .expect(200);

      // Admin khóa nhanvien
      const lockRes = await request(app.getHttpServer())
        .patch(`/api/users/${staffId}/status`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ status: 'locked' })
        .expect(200);
      expect(lockRes.body.status).toBe('locked');

      // Token cũ của nhanvien bị 401 ngay lập tức
      const blockedMe = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .expect(401);
      expect(blockedMe.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

      // Login lại khi bị khóa → 403 "Tài khoản đã bị khóa"
      const blockedLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nhanvien', password: DEMO_PASSWORD })
        .expect(403);
      expect(blockedLogin.body.message).toBe('Tài khoản đã bị khóa');

      // Admin mở khóa lại
      const unlockRes = await request(app.getHttpServer())
        .patch(`/api/users/${staffId}/status`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ status: 'active' })
        .expect(200);
      expect(unlockRes.body.status).toBe('active');

      // Đăng nhập lại thành công
      const relogin = await loginAs('nhanvien');
      expect(relogin.user.username).toBe('nhanvien');

      // Kiểm tra audit_logs có dòng khóa, mở khóa (với actor = admin) và đăng nhập khi bị khóa
      const logs = await prisma.auditLog.findMany({
        where: {
          entityType: 'user',
          entityId: staffId,
          createdAt: { gte: testStartedAt },
        },
        orderBy: { createdAt: 'asc' },
      });

      const lockLog = logs.find((l) => l.eventType === 'USER_LOCKED');
      const unlockLog = logs.find((l) => l.eventType === 'USER_UNLOCKED');
      const loginLockedLog = logs.find((l) => l.eventType === 'AUTH_LOGIN_LOCKED');

      expect(lockLog?.actorUserId).toBe(adminAuth.user.id);
      expect(unlockLog?.actorUserId).toBe(adminAuth.user.id);
      expect(loginLockedLog).toBeDefined();
      expect(JSON.stringify(loginLockedLog?.newData)).not.toContain(DEMO_PASSWORD);
      expect(JSON.stringify(loginLockedLog?.oldData ?? null)).not.toContain(DEMO_PASSWORD);
    });
  });

  // AC3
  describe('AC3: Đăng xuất làm mất hiệu lực token cũ', () => {
    it('gọi POST /api/auth/logout xong dùng lại token cũ gọi /api/auth/me bị 401', async () => {
      const auth = await loginAs('quanly');

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .expect(204);

      const meRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .expect(401);

      expect(meRes.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    });
  });

  // AC4
  describe('AC4: Phân quyền RBAC theo từng vai trò trên /api/users và PUT /api/users/:id/role', () => {
    it('chặn không token (401), chặn nhanvien/quanly (403) và cho phép admin (200)', async () => {
      const [adminAuth, managerAuth, staffAuth] = await Promise.all([
        loginAs('admin'),
        loginAs('quanly'),
        loginAs('nhanvien'),
      ]);

      // Không token -> 401
      await request(app.getHttpServer()).get('/api/users').expect(401);
      await request(app.getHttpServer())
        .put(`/api/users/${staffAuth.user.id}/role`)
        .send({ roleCode: 'WAREHOUSE_MANAGER' })
        .expect(401);

      // Nhân viên -> 403
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/users/${managerAuth.user.id}/role`)
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({ roleCode: 'WAREHOUSE_STAFF' })
        .expect(403);

      // Quản lý kho -> 403
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${managerAuth.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/users/${staffAuth.user.id}/role`)
        .set('Authorization', `Bearer ${managerAuth.accessToken}`)
        .send({ roleCode: 'WAREHOUSE_MANAGER' })
        .expect(403);

      // Admin -> 200 GET /api/users, /api/roles, /api/permissions/matrix
      const listRes = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .expect(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBeGreaterThanOrEqual(3);
      for (const user of listRes.body as Array<Record<string, unknown>>) {
        expect(user).not.toHaveProperty('passwordHash');
      }

      const matrixRes = await request(app.getHttpServer())
        .get('/api/permissions/matrix')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .expect(200);
      expect(matrixRes.body.roles.map((r: { code: string }) => r.code)).toEqual([
        'ADMIN',
        'WAREHOUSE_MANAGER',
        'WAREHOUSE_STAFF',
      ]);
      expect(matrixRes.body.permissions.length).toBeGreaterThanOrEqual(29);
    });
  });

  // AC5 & AC6
  describe('AC5 & AC6: Tạo tài khoản, kiểm tra trùng/định dạng, chặn tự khóa/tự đổi vai trò và audit đổi vai trò', () => {
    it('tạo user mới, từ chối trùng username/email (409), từ chối email sai định dạng (400), chặn admin tự khóa/tự đổi vai trò (403) và ghi audit đổi vai trò người khác', async () => {
      const adminAuth = await loginAs('admin');
      const uniqueUsername = `${E2E_USERNAME_PREFIX}${Date.now()}`;
      const uniqueEmail = `${uniqueUsername}@kho-ai.local`;

      // Email sai định dạng -> 400 chỉ rõ field email
      const badEmailRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: `${uniqueUsername}_bad`,
          email: 'khong-phai-email',
          fullName: 'Người Dùng Sai Email',
          password: 'password123',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(400);
      expect(
        (badEmailRes.body.errors as Array<{ field: string }>).some((e) => e.field === 'email'),
      ).toBe(true);

      // Tạo tài khoản hợp lệ -> 201
      const createRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: uniqueUsername,
          email: uniqueEmail,
          fullName: 'Nhân Viên Kiểm Thử',
          phone: '0905000111',
          password: 'password123',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(201);

      const createdUserId = createRes.body.id as string;
      createdUserIds.push(createdUserId);
      expect(createRes.body).not.toHaveProperty('passwordHash');
      expect(createRes.body.role.code).toBe('WAREHOUSE_STAFF');

      // Trùng username -> 409
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: uniqueUsername,
          email: `other_${uniqueEmail}`,
          fullName: 'Trùng Username',
          password: 'password123',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(409);

      // Trùng email -> 409
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: `${uniqueUsername}_dup_email`,
          email: uniqueEmail,
          fullName: 'Trùng Email',
          password: 'password123',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(409);

      // Cập nhật hồ sơ -> 200
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ fullName: 'Nhân Viên Đã Cập Nhật', phone: '0905999888' })
        .expect(200);
      expect(patchRes.body.fullName).toBe('Nhân Viên Đã Cập Nhật');

      // Admin tự khóa mình -> 403
      await request(app.getHttpServer())
        .patch(`/api/users/${adminAuth.user.id}/status`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ status: 'locked' })
        .expect(403);

      // Admin tự đổi vai trò mình -> 403
      await request(app.getHttpServer())
        .put(`/api/users/${adminAuth.user.id}/role`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ roleCode: 'WAREHOUSE_MANAGER' })
        .expect(403);

      // Admin đổi vai trò của user test -> 200 + ghi audit old/new role
      const roleRes = await request(app.getHttpServer())
        .put(`/api/users/${createdUserId}/role`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ roleCode: 'WAREHOUSE_MANAGER' })
        .expect(200);
      expect(roleRes.body.role).toEqual({ code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' });

      const roleAudit = await prisma.auditLog.findFirst({
        where: {
          eventType: 'USER_ROLE_CHANGED',
          entityType: 'user',
          entityId: createdUserId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(roleAudit?.actorUserId).toBe(adminAuth.user.id);
      expect(roleAudit?.oldData).toMatchObject({ roleCode: 'WAREHOUSE_STAFF' });
      expect(roleAudit?.newData).toMatchObject({ roleCode: 'WAREHOUSE_MANAGER' });
    });
  });
});
