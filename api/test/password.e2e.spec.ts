import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
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
const DEMO_USERNAMES = ['admin', 'quanly', 'nhanvien'] as const;
const E2E_USERNAME_PREFIX = 'e2e_t020_';

describe('Đổi mật khẩu và đặt lại mật khẩu (T-020 E2E)', () => {
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
      // Luôn khôi phục mật khẩu demo về 123456, status=active và tokenVersion=0 kể cả khi test fail
      const restoredHash = await bcrypt.hash(DEMO_PASSWORD, 10);
      await prisma.user.updateMany({
        where: { username: { in: [...DEMO_USERNAMES] } },
        data: {
          passwordHash: restoredHash,
          status: 'active',
          tokenVersion: 0,
        },
      });

      // Xóa audit logs phát sinh trong lúc chạy test T-020
      await prisma.auditLog.deleteMany({
        where: {
          createdAt: { gte: testStartedAt },
        },
      });

      // Xóa tài khoản tạm tạo trong e2e
      const tempUsers = await prisma.user.findMany({
        where: {
          OR: [
            { id: { in: createdUserIds } },
            { username: { startsWith: E2E_USERNAME_PREFIX } },
          ],
        },
        select: { id: true },
      });
      const tempIds = tempUsers.map((u) => u.id);
      if (tempIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [{ actorUserId: { in: tempIds } }, { entityId: { in: tempIds } }],
          },
        });
        await prisma.userRole.deleteMany({
          where: { userId: { in: tempIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: tempIds } },
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

  describe('AC1 & AC4: Nhân viên tự đổi mật khẩu, vô hiệu token cũ và ghi audit không lộ mật khẩu', () => {
    it('nhanvien đổi mật khẩu thành công (204), token cũ bị 401, đăng nhập mật khẩu mới được, mật khẩu cũ bị 401, ghi audit sạch', async () => {
      const staffAuth = await loginAs('nhanvien', DEMO_PASSWORD);
      const newPassword = 'NhanVienMoi2026!';

      // Chặn truyền field lạ (ví dụ userId của người khác) -> 400 (PB31 AC6)
      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          userId: '00000000-0000-0000-0000-000000000001',
          currentPassword: DEMO_PASSWORD,
          newPassword,
          confirmPassword: newPassword,
        })
        .expect(400);

      // Đổi mật khẩu hợp lệ -> 204, body rỗng
      const changeRes = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          currentPassword: DEMO_PASSWORD,
          newPassword,
          confirmPassword: newPassword,
        })
        .expect(204);
      expect(changeRes.text).toBe('');

      // Token cũ lập tức bị 401 khi gọi /api/auth/me
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .expect(401);

      // Mật khẩu cũ bị 401
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nhanvien', password: DEMO_PASSWORD })
        .expect(401);

      // Mật khẩu mới đăng nhập được -> 200
      const relogin = await loginAs('nhanvien', newPassword);
      expect(relogin.user.username).toBe('nhanvien');
      expect(relogin.user).not.toHaveProperty('password');
      expect(relogin.user).not.toHaveProperty('passwordHash');

      // Kiểm tra audit USER_PASSWORD_CHANGED đúng actor/entity và không chứa mật khẩu hay hash
      const audit = await prisma.auditLog.findFirst({
        where: {
          eventType: 'USER_PASSWORD_CHANGED',
          entityType: 'user',
          entityId: staffAuth.user.id,
          createdAt: { gte: testStartedAt },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit).not.toBeNull();
      expect(audit?.actorUserId).toBe(staffAuth.user.id);
      const serialized = JSON.stringify({
        oldData: audit?.oldData ?? null,
        newData: audit?.newData ?? null,
      });
      expect(serialized).not.toContain(DEMO_PASSWORD);
      expect(serialized).not.toContain(newPassword);
      expect(serialized).not.toContain('$2a$');
      expect(serialized).not.toContain('$2b$');
      expect(serialized).not.toContain('passwordHash');
    });
  });

  describe('AC2: Validate đổi mật khẩu và nâng chính sách tạo tài khoản lên tối thiểu 8 ký tự', () => {
    it('sai mật khẩu hiện tại -> 400 (không 401), mật khẩu không đổi, token vẫn dùng được; mới < 8 / không khớp / trùng -> 400 có errors', async () => {
      const currentStaffPass = 'NhanVienMoi2026!';
      const staffAuth = await loginAs('nhanvien', currentStaffPass);

      // Sai mật khẩu hiện tại -> 400
      const wrongRes = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          currentPassword: 'SaiMatKhauHienTai',
          newPassword: 'MatKhauMoiHopLe2026',
          confirmPassword: 'MatKhauMoiHopLe2026',
        })
        .expect(400);
      expect(wrongRes.body.message).toBe('Mật khẩu hiện tại không đúng');
      expect(wrongRes.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'currentPassword' }),
        ]),
      );

      // Token vẫn hoạt động sau khi nhập sai mật khẩu hiện tại
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .expect(200);

      // Mật khẩu mới < 8 ký tự -> 400 có errors[field=newPassword]
      const shortRes = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          currentPassword: currentStaffPass,
          newPassword: '1234567',
          confirmPassword: '1234567',
        })
        .expect(400);
      expect(shortRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'newPassword' })]),
      );

      // Nhập lại không khớp -> 400 có errors[field=confirmPassword]
      const mismatchRes = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          currentPassword: currentStaffPass,
          newPassword: 'MatKhauMoiHopLe2026',
          confirmPassword: 'KhongKhopMatKhau2026',
        })
        .expect(400);
      expect(mismatchRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'confirmPassword' })]),
      );

      // Trùng mật khẩu hiện tại -> 400 có errors[field=newPassword]
      const sameRes = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({
          currentPassword: currentStaffPass,
          newPassword: currentStaffPass,
          confirmPassword: currentStaffPass,
        })
        .expect(400);
      expect(sameRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'newPassword' })]),
      );

      // Mật khẩu vẫn chưa đổi, đăng nhập lại bằng currentStaffPass vẫn 200
      await loginAs('nhanvien', currentStaffPass);

      // POST /api/users với mật khẩu < 8 ký tự -> 400 có errors[field=password]
      const adminAuth = await loginAs('admin', DEMO_PASSWORD);
      const createShortRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: `${E2E_USERNAME_PREFIX}short`,
          email: `${E2E_USERNAME_PREFIX}short@kho-ai.local`,
          fullName: 'Người Dùng Mật Khẩu Ngắn',
          password: '1234567',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(400);
      expect(createShortRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });
  });

  describe('AC3 & AC4: Admin đặt lại mật khẩu, vô hiệu token, phân quyền, chặn tự reset, 404 và audit sạch', () => {
    it('admin đặt lại cho quanly -> 204, token quanly bị 401, đăng nhập mới được; chặn nhanvien/quanly (403), chặn tự reset (403), id không tồn tại (404), giữ nguyên status khóa', async () => {
      const [adminAuth, managerAuth, staffAuth] = await Promise.all([
        loginAs('admin', DEMO_PASSWORD),
        loginAs('quanly', DEMO_PASSWORD),
        loginAs('nhanvien', 'NhanVienMoi2026!'),
      ]);

      const resetPass = 'QuanLyReset2026!';

      // Không token -> 401
      await request(app.getHttpServer())
        .post(`/api/users/${managerAuth.user.id}/reset-password`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(401);

      // nhanvien gọi reset -> 403
      await request(app.getHttpServer())
        .post(`/api/users/${managerAuth.user.id}/reset-password`)
        .set('Authorization', `Bearer ${staffAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(403);

      // quanly gọi reset -> 403
      await request(app.getHttpServer())
        .post(`/api/users/${staffAuth.user.id}/reset-password`)
        .set('Authorization', `Bearer ${managerAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(403);

      // admin tự reset chính mình -> 403 "Hãy dùng chức năng Đổi mật khẩu"
      const selfResetRes = await request(app.getHttpServer())
        .post(`/api/users/${adminAuth.user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(403);
      expect(selfResetRes.body.message).toBe('Hãy dùng chức năng Đổi mật khẩu');

      // id không tồn tại -> 404
      await request(app.getHttpServer())
        .post('/api/users/00000000-0000-4000-8000-000000000099/reset-password')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(404);

      // UUID sai định dạng -> 400
      await request(app.getHttpServer())
        .post('/api/users/khong-phai-uuid/reset-password')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(400);

      // Admin reset mật khẩu cho quanly -> 204
      const resetRes = await request(app.getHttpServer())
        .post(`/api/users/${managerAuth.user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ newPassword: resetPass, confirmPassword: resetPass })
        .expect(204);
      expect(resetRes.text).toBe('');

      // Token cũ của quanly bị 401 ngay lập tức
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${managerAuth.accessToken}`)
        .expect(401);

      // Mật khẩu cũ của quanly bị 401
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'quanly', password: DEMO_PASSWORD })
        .expect(401);

      // Mật khẩu mới của quanly đăng nhập được -> 200
      const managerRelogin = await loginAs('quanly', resetPass);
      expect(managerRelogin.user.username).toBe('quanly');

      // Audit USER_PASSWORD_RESET đúng actor=admin, entity=quanly, không chứa mật khẩu/hash
      const audit = await prisma.auditLog.findFirst({
        where: {
          eventType: 'USER_PASSWORD_RESET',
          entityType: 'user',
          entityId: managerAuth.user.id,
          createdAt: { gte: testStartedAt },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorUserId).toBe(adminAuth.user.id);
      const serialized = JSON.stringify({
        oldData: audit?.oldData ?? null,
        newData: audit?.newData ?? null,
      });
      expect(serialized).not.toContain(resetPass);
      expect(serialized).not.toContain(DEMO_PASSWORD);
      expect(serialized).not.toContain('$2a$');
      expect(serialized).not.toContain('$2b$');
      expect(serialized).not.toContain('passwordHash');

      // Kiểm tra không đổi trạng thái khóa của tài khoản đích khi reset
      const tempUsername = `${E2E_USERNAME_PREFIX}locked_${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({
          username: tempUsername,
          email: `${tempUsername}@kho-ai.local`,
          fullName: 'Tài Khoản Đang Khóa',
          password: 'InitialPassword1',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(201);
      const tempUserId = createRes.body.id as string;
      createdUserIds.push(tempUserId);

      await request(app.getHttpServer())
        .patch(`/api/users/${tempUserId}/status`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ status: 'locked' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/users/${tempUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ newPassword: 'LockedReset2026!', confirmPassword: 'LockedReset2026!' })
        .expect(204);

      const lockedUser = await prisma.user.findUnique({ where: { id: tempUserId } });
      expect(lockedUser?.status).toBe('locked');
    });
  });

  describe('AC5: Tài khoản seed vẫn đăng nhập bằng 123456', () => {
    it('admin vẫn đăng nhập bằng mật khẩu seed 123456 dù ngắn hơn 8 ký tự', async () => {
      const adminAuth = await loginAs('admin', DEMO_PASSWORD);
      expect(adminAuth.user.username).toBe('admin');
    });
  });
});
