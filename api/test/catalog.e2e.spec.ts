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
  };
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const E2E_PREFIX = 'T006_';

describe('Danh mục: sản phẩm, nhóm hàng, nhà cung cấp, đại lý (T-006 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;

  let staffToken: string;
  let managerToken: string;
  let readOnlyToken: string;

  let readOnlyUserId: string;
  let readOnlyRoleId: string;

  const createdLotIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdSupplierIds: string[] = [];
  const createdAgencyIds: string[] = [];

  beforeAll(async () => {
    testStartedAt = new Date();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // Đăng nhập nhanvien và quanly
    const staffLogin = await loginAs('nhanvien');
    staffToken = staffLogin.accessToken;

    const managerLogin = await loginAs('quanly');
    managerToken = managerLogin.accessToken;

    // Tạo vai trò + tài khoản test chỉ có quyền catalog.read (không có catalog.manage) cho AC1
    const readPerm = await prisma.permission.findUniqueOrThrow({
      where: { code: 'catalog.read' },
    });
    const role = await prisma.role.create({
      data: {
        code: `${E2E_PREFIX}READ_ONLY`,
        name: 'Vai trò test chỉ đọc danh mục',
        status: 'active',
      },
    });
    readOnlyRoleId = role.id;

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: readPerm.id },
    });

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        username: 'e2e_t006_readonly',
        email: 'e2e_t006_readonly@kho-ai.local',
        fullName: 'Người dùng chỉ xem danh mục',
        passwordHash,
        status: 'active',
      },
    });
    readOnlyUserId = user.id;

    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    const readOnlyLogin = await loginAs('e2e_t006_readonly');
    readOnlyToken = readOnlyLogin.accessToken;
  });

  afterAll(async () => {
    try {
      if (createdLotIds.length > 0) {
        await prisma.inventoryLotBalance.deleteMany({
          where: { lotId: { in: createdLotIds } },
        });
        await prisma.lot.deleteMany({
          where: { id: { in: createdLotIds } },
        });
      }
      if (createdProductIds.length > 0) {
        await prisma.product.deleteMany({
          where: { id: { in: createdProductIds } },
        });
      }
      if (createdGroupIds.length > 0) {
        await prisma.productGroup.deleteMany({
          where: { id: { in: createdGroupIds } },
        });
      }
      if (createdSupplierIds.length > 0) {
        await prisma.supplier.deleteMany({
          where: { id: { in: createdSupplierIds } },
        });
      }
      if (createdAgencyIds.length > 0) {
        await prisma.agency.deleteMany({
          where: { id: { in: createdAgencyIds } },
        });
      }

      await prisma.auditLog.deleteMany({
        where: { createdAt: { gte: testStartedAt } },
      });

      if (readOnlyUserId) {
        await prisma.userRole.deleteMany({ where: { userId: readOnlyUserId } });
        await prisma.user.deleteMany({ where: { id: readOnlyUserId } });
      }
      if (readOnlyRoleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId: readOnlyRoleId } });
        await prisma.role.deleteMany({ where: { id: readOnlyRoleId } });
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
  describe('AC1: Phân quyền và xác thực', () => {
    it('không có token → 401 trên route danh mục', async () => {
      await request(app.getHttpServer()).get('/api/products').expect(401);
      await request(app.getHttpServer()).post('/api/suppliers').send({}).expect(401);
    });

    it('user thiếu quyền catalog.manage → đọc được (200) nhưng ghi bị chặn 403 trên cả 4 thực thể', async () => {
      await request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/product-groups')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ code: `${E2E_PREFIX}G_NOPE`, name: 'Không đủ quyền' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ code: `${E2E_PREFIX}P_NOPE`, name: 'Không đủ quyền' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ code: `${E2E_PREFIX}S_NOPE`, name: 'Không đủ quyền' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/agencies')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ code: `${E2E_PREFIX}A_NOPE`, name: 'Không đủ quyền' })
        .expect(403);
    });

    it('nhanvien và quanly đều tạo và sửa được sản phẩm, NCC, đại lý', async () => {
      const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

      // nhanvien tạo sản phẩm, quanly sửa sản phẩm
      const prodRes = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          code: `${E2E_PREFIX}sp01`,
          name: 'Sữa thử nghiệm T006',
          groupId: suaGroup.id,
          unit: 'thùng',
          shelfLifeDays: 120,
        })
        .expect(201);

      createdProductIds.push(prodRes.body.id);
      expect(prodRes.body.code).toBe(`${E2E_PREFIX}SP01`);
      expect(prodRes.body.onHandQty).toBe('0');

      const updatedProd = await request(app.getHttpServer())
        .patch(`/api/products/${prodRes.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Sữa thử nghiệm T006 đã sửa' })
        .expect(200);
      expect(updatedProd.body.name).toBe('Sữa thử nghiệm T006 đã sửa');

      // quanly tạo NCC, nhanvien sửa NCC
      const supRes = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: `${E2E_PREFIX}ncc1`,
          name: 'Nhà cung cấp thử nghiệm',
          phone: '0236 388 9900',
          email: 'test@supplier.local',
          address: 'Đà Nẵng',
        })
        .expect(201);
      createdSupplierIds.push(supRes.body.id);
      expect(supRes.body.code).toBe(`${E2E_PREFIX}NCC1`);

      await request(app.getHttpServer())
        .patch(`/api/suppliers/${supRes.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'NCC đã sửa' })
        .expect(200);

      // nhanvien tạo đại lý, quanly sửa đại lý
      const agencyRes = await request(app.getHttpServer())
        .post('/api/agencies')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          code: `${E2E_PREFIX}dl1`,
          name: 'Đại lý thử nghiệm',
          contactName: 'Nguyễn Văn Test',
          phone: '+84 905 123 456',
          email: 'test@agency.local',
        })
        .expect(201);
      createdAgencyIds.push(agencyRes.body.id);
      expect(agencyRes.body.code).toBe(`${E2E_PREFIX}DL1`);

      await request(app.getHttpServer())
        .patch(`/api/agencies/${agencyRes.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ contactName: 'Trần Thị Test' })
        .expect(200);
    });
  });

  // AC2
  describe('AC2: Validate dữ liệu đầu vào và trùng mã', () => {
    it('tạo sản phẩm trùng mã khác hoa thường (sp001) → 409 "Mã đã tồn tại"', async () => {
      const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          code: 'sp001',
          name: 'Sản phẩm trùng mã',
          groupId: suaGroup.id,
          unit: 'thùng',
        })
        .expect(409);

      expect(res.body.message).toBe('Mã đã tồn tại');
    });

    it('mã/tên trống, email sai, SĐT sai → 400 có errors[].field', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          code: '',
          name: '   ',
          email: 'khong-phai-email',
          phone: 'abc123',
        })
        .expect(400);

      const fields = (res.body.errors as Array<{ field: string }>).map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['code', 'name', 'email', 'phone']));
    });
  });

  // AC3
  describe('AC3: Tìm kiếm và lọc sản phẩm', () => {
    it('GET /api/products?search=SP00 trả 9 mục; lọc theo groupId nhóm Sữa trả 5 mục', async () => {
      const resSearch = await request(app.getHttpServer())
        .get('/api/products')
        .query({ search: 'SP00', status: 'active' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(resSearch.body.total).toBe(9);
      expect(resSearch.body.items).toHaveLength(9);

      const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });
      const resGroup = await request(app.getHttpServer())
        .get('/api/products')
        .query({ groupId: suaGroup.id, status: 'active', search: 'SP' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // Chỉ đếm các mã SP001..SP005 (không tính T006_SP01 nếu có)
      const seedCodes = (resGroup.body.items as Array<{ code: string }>)
        .map((i) => i.code)
        .filter((c) => /^SP\d{3}$/.test(c));
      expect(seedCodes).toEqual(['SP001', 'SP002', 'SP003', 'SP004', 'SP005']);
    });
  });

  // AC4, AC5, AC6, AC7
  describe('AC4–AC7: Bất biến không xóa vật lý, không đổi code, nhóm inactive, onHandQty và audit_logs', () => {
    it('tổng hợp kiểm tra AC4, AC5, AC6, AC7 trên sản phẩm có lô và nhóm hàng inactive', async () => {
      const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });
      const ngkGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'NGK' } });

      // Tạo nhóm hàng rồi ngừng hoạt động để test không cho gán nhóm inactive
      const inactiveGroupRes = await request(app.getHttpServer())
        .post('/api/product-groups')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ code: `${E2E_PREFIX}GRP_OFF`, name: 'Nhóm ngừng dùng' })
        .expect(201);
      createdGroupIds.push(inactiveGroupRes.body.id);

      await request(app.getHttpServer())
        .patch(`/api/product-groups/${inactiveGroupRes.body.id}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'inactive' })
        .expect(200);

      // Tạo sản phẩm mới với nhóm inactive → 400
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: `${E2E_PREFIX}P_BADGRP`,
          name: 'SP nhóm ngừng',
          groupId: inactiveGroupRes.body.id,
          unit: 'hộp',
        })
        .expect(400);

      // Tạo sản phẩm hợp lệ
      const createdRes = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: `${E2E_PREFIX}LOT_SP`,
          name: 'Sản phẩm có lô',
          groupId: suaGroup.id,
          unit: 'hộp',
          shelfLifeDays: 90,
        })
        .expect(201);
      const productId = createdRes.body.id as string;
      createdProductIds.push(productId);

      // AC5: PATCH đổi tên + nhóm giữ nguyên id/code; gửi code khác → 400
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Sản phẩm có lô (mới)', groupId: ngkGroup.id })
        .expect(200);
      expect(patchRes.body.id).toBe(productId);
      expect(patchRes.body.code).toBe(`${E2E_PREFIX}LOT_SP`);
      expect(patchRes.body.group.id).toBe(ngkGroup.id);

      await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ code: `${E2E_PREFIX}OTHER` })
        .expect(400);

      // AC6: Tạo 2 lô + balance 10.5 và 4 → onHandQty === "14.5"
      const lot1 = await prisma.lot.create({
        data: {
          productId,
          lotCode: `${E2E_PREFIX}L01`,
          expiryDate: new Date('2027-06-01'),
          receivedAt: new Date('2026-11-20'),
          initialQuantity: '10.500',
          status: 'active',
        },
      });
      const lot2 = await prisma.lot.create({
        data: {
          productId,
          lotCode: `${E2E_PREFIX}L02`,
          expiryDate: new Date('2027-07-01'),
          receivedAt: new Date('2026-11-21'),
          initialQuantity: '4.000',
          status: 'active',
        },
      });
      createdLotIds.push(lot1.id, lot2.id);

      await prisma.inventoryLotBalance.createMany({
        data: [
          { lotId: lot1.id, onHandQty: '10.500' },
          { lotId: lot2.id, onHandQty: '4.000' },
        ],
      });

      const detailRes = await request(app.getHttpServer())
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(detailRes.body.onHandQty).toBe('14.5');

      // AC4: Ngừng sản phẩm đang có lô tham chiếu → 200, lô vẫn trỏ đúng, không có route DELETE
      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/products/${productId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'inactive' })
        .expect(200);
      expect(deactivateRes.body.status).toBe('inactive');

      const stillReadable = await request(app.getHttpServer())
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(stillReadable.body.id).toBe(productId);
      expect(stillReadable.body.status).toBe('inactive');

      const lotCheck = await prisma.lot.findUniqueOrThrow({ where: { id: lot1.id } });
      expect(lotCheck.productId).toBe(productId);

      await request(app.getHttpServer())
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);

      // AC7: Kiểm tra audit_logs cho create / update / status change
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'product', entityId: productId },
        orderBy: { id: 'asc' },
      });
      expect(logs.map((l) => l.eventType)).toEqual([
        'PRODUCT_CREATED',
        'PRODUCT_UPDATED',
        'PRODUCT_STATUS_CHANGED',
      ]);
    });
  });
});
