import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

interface AuditLogItemBody {
  id: string;
  createdAt: string;
  actor: { id: string; username: string; fullName: string } | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

interface AuditLogsListBody {
  items: AuditLogItemBody[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditLogFacetsBody {
  eventTypes: string[];
  entityTypes: string[];
  actors: Array<{ id: string; username: string; fullName: string }>;
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const E2E_PREFIX = 'e2e_t021_';

function getVnDateIso(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

describe('Nhật ký hệ thống — Audit Logs (T-021 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;

  const createdUserIds: string[] = [];
  const createdReceiptIds: string[] = [];
  const createdLotIds: string[] = [];
  const insertedAuditIds: bigint[] = [];

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
      // Xóa audit log chèn trực tiếp hoặc phát sinh trong test
      if (insertedAuditIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { id: { in: insertedAuditIds } },
        });
      }
      await prisma.auditLog.deleteMany({
        where: { createdAt: { gte: testStartedAt } },
      });

      // Dọn phiếu nhập và lô hàng tạm tạo trong test
      if (createdReceiptIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: {
            sourceType: 'INBOUND_RECEIPT',
            sourceId: { in: createdReceiptIds },
          },
        });
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdReceiptIds } },
        });
        await prisma.inboundReceipt.deleteMany({
          where: { id: { in: createdReceiptIds } },
        });
      }
      if (createdLotIds.length > 0) {
        await prisma.inventoryLotBalance.deleteMany({
          where: { lotId: { in: createdLotIds } },
        });
        await prisma.lot.deleteMany({
          where: { id: { in: createdLotIds } },
        });
      }

      // Dọn tài khoản tạm
      const tempUsers = await prisma.user.findMany({
        where: {
          OR: [{ id: { in: createdUserIds } }, { username: { startsWith: E2E_PREFIX } }],
        },
        select: { id: true },
      });
      const tempUserIds = tempUsers.map((u) => u.id);
      if (tempUserIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [{ actorUserId: { in: tempUserIds } }, { entityId: { in: tempUserIds } }],
          },
        });
        await prisma.userRole.deleteMany({
          where: { userId: { in: tempUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: tempUserIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function loginAs(username: string): Promise<LoginResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return res.body as LoginResponseBody;
  }

  describe('AC1: Phân quyền truy cập GET /api/audit-logs và GET /api/audit-logs/facets', () => {
    it('không có token → 401 cho cả 2 route', async () => {
      await request(app.getHttpServer()).get('/api/audit-logs').expect(401);
      await request(app.getHttpServer()).get('/api/audit-logs/facets').expect(401);
    });

    it('quanly và nhanvien → 403 cho cả 2 route', async () => {
      const manager = await loginAs('quanly');
      const staff = await loginAs('nhanvien');

      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/audit-logs/facets')
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/audit-logs/facets')
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(403);
    });

    it('admin → 200 cho cả 2 route với cấu trúc phản hồi đúng', async () => {
      const admin = await loginAs('admin');

      const listRes = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const listBody = listRes.body as AuditLogsListBody;
      expect(Array.isArray(listBody.items)).toBe(true);
      expect(typeof listBody.total).toBe('number');
      expect(listBody.page).toBe(1);
      expect(listBody.pageSize).toBe(50);

      const facetsRes = await request(app.getHttpServer())
        .get('/api/audit-logs/facets')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const facetsBody = facetsRes.body as AuditLogFacetsBody;
      expect(Array.isArray(facetsBody.eventTypes)).toBe(true);
      expect(Array.isArray(facetsBody.entityTypes)).toBe(true);
      expect(Array.isArray(facetsBody.actors)).toBe(true);
    });
  });

  describe('AC2: Lọc theo eventType, entityType, actorUserId, khoảng ngày VN, search và phân trang', () => {
    it('ghi nhận khóa/mở tài khoản và xác nhận phiếu nhập, lọc và phân trang chính xác', async () => {
      const admin = await loginAs('admin');
      const staff = await loginAs('nhanvien');

      // 1. Admin tạo, khóa rồi mở khóa 1 tài khoản tạm
      const suffix = Date.now();
      const createUserRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          username: `${E2E_PREFIX}user_${suffix}`,
          email: `${E2E_PREFIX}user_${suffix}@kho-ai.local`,
          fullName: 'Người dùng E2E Audit',
          password: 'AuditPassword123',
          roleCode: 'WAREHOUSE_STAFF',
        })
        .expect(201);
      const targetUserId = (createUserRes.body as { id: string }).id;
      createdUserIds.push(targetUserId);

      await request(app.getHttpServer())
        .patch(`/api/users/${targetUserId}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'locked' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/users/${targetUserId}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'active' })
        .expect(200);

      // 2. Nhân viên kho tạo và xác nhận 1 phiếu nhập
      const [supplier, product] = await Promise.all([
        prisma.supplier.findFirst({ where: { status: 'active' }, select: { id: true } }),
        prisma.product.findFirst({ where: { status: 'active' }, select: { id: true } }),
      ]);
      expect(supplier).not.toBeNull();
      expect(product).not.toBeNull();

      const todayVn = getVnDateIso(new Date());
      const createInboundRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .send({
          supplierId: supplier!.id,
          receiptDate: todayVn,
          notes: 'Phiếu nhập kiểm thử audit log T-021',
          items: [
            {
              productId: product!.id,
              lotCode: `LOT-T021-${suffix}`,
              expiryDate: '2027-12-31',
              quantity: '10',
              unitCost: '50000',
            },
          ],
        })
        .expect(201);
      const receiptId = (createInboundRes.body as { id: string; receiptNo: string }).id;
      const receiptNo = (createInboundRes.body as { id: string; receiptNo: string }).receiptNo;
      createdReceiptIds.push(receiptId);

      const confirmRes = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${receiptId}/confirm`)
        .set('Authorization', `Bearer ${staff.accessToken}`)
        .expect(200);
      const confirmedItems = (confirmRes.body as { items: Array<{ lotId: string | null }> }).items;
      for (const item of confirmedItems) {
        if (item.lotId) {
          createdLotIds.push(item.lotId);
        }
      }

      // 3. Lọc theo eventType=USER_LOCKED
      const lockedRes = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({ eventType: 'USER_LOCKED', entityType: 'user', actorUserId: admin.user.id })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const lockedBody = lockedRes.body as AuditLogsListBody;
      expect(lockedBody.items.some((item) => item.entityId === targetUserId)).toBe(true);
      expect(lockedBody.items.every((item) => item.eventType === 'USER_LOCKED')).toBe(true);
      expect(lockedBody.items.every((item) => item.entityType === 'user')).toBe(true);
      expect(lockedBody.items.every((item) => item.actor?.id === admin.user.id)).toBe(true);

      // 4. Lọc theo INBOUND_CONFIRMED + actor = nhanvien + khoảng ngày hôm nay VN
      const inboundRes = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({
          eventType: 'INBOUND_CONFIRMED',
          entityType: 'inbound_receipt',
          actorUserId: staff.user.id,
          from: todayVn,
          to: todayVn,
        })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const inboundBody = inboundRes.body as AuditLogsListBody;
      expect(inboundBody.items.some((item) => item.entityId === receiptId)).toBe(true);
      expect(inboundBody.items.every((item) => item.eventType === 'INBOUND_CONFIRMED')).toBe(true);

      // 5. Lọc theo ngày quá khứ không có bản ghi mới vừa tạo
      const pastRes = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({
          eventType: 'INBOUND_CONFIRMED',
          from: '2020-01-01',
          to: '2020-01-02',
        })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect((pastRes.body as AuditLogsListBody).total).toBe(0);

      // 6. Search theo số phiếu nhập và theo entityId
      const searchByNoRes = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({ search: receiptNo })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(
        (searchByNoRes.body as AuditLogsListBody).items.some((item) => item.entityId === receiptId),
      ).toBe(true);

      // 7. Phân trang đúng total và pageSize
      const page1Res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({ actorUserId: admin.user.id, page: 1, pageSize: 2 })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const page1 = page1Res.body as AuditLogsListBody;
      expect(page1.total).toBeGreaterThanOrEqual(3);
      expect(page1.items).toHaveLength(2);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);

      const page2Res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({ actorUserId: admin.user.id, page: 2, pageSize: 2 })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const page2 = page2Res.body as AuditLogsListBody;
      expect(page2.total).toBe(page1.total);
      expect(page2.items.length).toBeGreaterThanOrEqual(1);
      expect(page2.items[0].id).not.toBe(page1.items[0].id);

      // 8. Facets có đủ eventTypes, entityTypes, actors
      const facetsRes = await request(app.getHttpServer())
        .get('/api/audit-logs/facets')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const facets = facetsRes.body as AuditLogFacetsBody;
      expect(facets.eventTypes).toContain('USER_LOCKED');
      expect(facets.eventTypes).toContain('INBOUND_CONFIRMED');
      expect(facets.entityTypes).toContain('user');
      expect(facets.entityTypes).toContain('inbound_receipt');
      expect(facets.actors.some((a) => a.id === admin.user.id)).toBe(true);
      expect(facets.actors.some((a) => a.id === staff.user.id)).toBe(true);
    });
  });

  describe('AC3: Lọc khóa nhạy cảm khỏi oldData/newData trước khi trả về', () => {
    it('bản ghi chèn sẵn có passwordHash, password, accessToken, apiKey không bị lộ trong response', async () => {
      const admin = await loginAs('admin');
      const markerEntityId = `t021-sensitive-${Date.now()}`;

      const inserted = await prisma.auditLog.create({
        data: {
          actorUserId: admin.user.id,
          eventType: 'LEGACY_SENSITIVE_TEST',
          entityType: 'user',
          entityId: markerEntityId,
          oldData: {
            username: 'legacy_user',
            passwordHash: '$2b$10$legacyoldhash',
            token: 'legacy-token-1',
          },
          newData: {
            username: 'legacy_user',
            status: 'active',
            passwordHash: '$2b$10$legacynewhash',
            password: 'plain-secret-value',
            accessToken: 'jwt-secret-value',
            apiKey: 'sk-secret-key',
            nested: {
              safe: true,
              password_hash: '$2b$10$nestedhash',
            },
          },
        },
      });
      insertedAuditIds.push(inserted.id);

      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .query({ search: markerEntityId })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const body = res.body as AuditLogsListBody;
      expect(body.items).toHaveLength(1);
      const item = body.items[0];
      const serialized = JSON.stringify(item);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('$2b$10$');
      expect(serialized).not.toContain('plain-secret-value');
      expect(serialized).not.toContain('jwt-secret-value');
      expect(serialized).not.toContain('sk-secret-key');
      expect(serialized).not.toContain('legacy-token-1');

      expect(item.oldData).toEqual({ username: 'legacy_user' });
      expect(item.newData).toEqual({
        username: 'legacy_user',
        status: 'active',
        nested: { safe: true },
      });
    });
  });

  describe('AC4: Chỉ đọc — không tồn tại route ghi cho audit-logs', () => {
    it('POST/PUT/PATCH/DELETE /api/audit-logs đều trả về 404', async () => {
      const admin = await loginAs('admin');

      await request(app.getHttpServer())
        .post('/api/audit-logs')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(404);

      await request(app.getHttpServer())
        .patch('/api/audit-logs/1')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(404);

      await request(app.getHttpServer())
        .put('/api/audit-logs/1')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(404);

      await request(app.getHttpServer())
        .delete('/api/audit-logs/1')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });
});
