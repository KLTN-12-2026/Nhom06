import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  apiGetAsCurrentUser,
  captureScreenshot,
  getMonthStartIso,
  getVnTodayIso,
  loginAs,
  logout,
  toMilli,
} from './helpers';

interface InventoryLotApiItem {
  lotId: string;
  lotCode: string;
  onHandQty: string;
  product: { id: string; code: string; name: string; unit: string };
}

interface InventoryLotsApiResponse {
  items: InventoryLotApiItem[];
  total: number;
}

interface StockMovementsApiResponse {
  items: Array<{
    id: string;
    movementType: string;
    lotCode: string;
    quantityDelta: string;
    source: { type: string; documentNo: string | null };
  }>;
  total: number;
}

interface OrdersApiResponse {
  items: Array<{
    id: string;
    orderNo: string;
    status: string;
    agency: { code: string; name: string };
  }>;
  pendingCount: number;
}

interface OrderDetailApiResponse {
  id: string;
  orderNo: string;
  items: Array<{ product: { code: string } }>;
}

interface StockLedgerApiResponse {
  from: string;
  to: string;
  items: Array<{
    product: { id: string; code: string; name: string; unit: string };
    opening: string;
    inbound: string;
    outbound: string;
    adjustment: string;
    closing: string;
  }>;
}

test.describe.serial('Kịch bản demo KHO-AI 12 bước + ảnh báo cáo', () => {
  test('chạy trọn bộ 12 bước nghiệp vụ và chụp ≥ 12 ảnh', async ({ page, context, request }) => {
    // Biến chia sẻ giữa các bước tuần tự (không phụ thuộc cứng mã lô biến động)
    let approvedDisposalLotCode = '';
    let approvedDisposalQtyMilli = 0;

    // -------------------------------------------------------------------------
    // Bước 1: Đăng nhập 3 vai trò, kiểm menu khác nhau, ma trận quyền & Dashboard
    // -------------------------------------------------------------------------
    await test.step('01. Đăng nhập 3 vai trò và kiểm tra phân quyền menu khác nhau', async () => {
      const desktopNav = page.locator('nav[aria-label="Điều hướng chính"]');

      // 1a. Admin: thấy Tài khoản, Nhật ký hệ thống, Báo cáo; mở /users xem ma trận quyền
      await loginAs(page, 'admin');
      await expect(desktopNav.getByRole('link', { name: 'Tài khoản' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Nhật ký hệ thống' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Báo cáo' })).toBeVisible();

      await page.goto('/users');
      await expect(page.getByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'quanly', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'nhanvien', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Ma trận quyền' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Quản trị' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Quản lý kho' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Nhân viên' })).toBeVisible();
      await captureScreenshot(page, '01-phan-quyen-3-vai-tro.png');

      // 1b. Quản lý kho: thấy Báo cáo, Dự báo, Phân tích tồn dư; không thấy Tài khoản / Nhật ký
      await logout(page);
      await loginAs(page, 'quanly');
      await expect(desktopNav.getByRole('link', { name: 'Báo cáo' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Dự báo nhu cầu' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Phân tích tồn dư' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Tài khoản' })).toHaveCount(0);
      await expect(desktopNav.getByRole('link', { name: 'Nhật ký hệ thống' })).toHaveCount(0);

      await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
      await expect(page.getByText('Tổng tồn kho')).toBeVisible();
      await expect(page.getByText('Giá trị có nguy cơ mất')).toBeVisible();
      await expect(page.getByText('Nhập và xuất 12 tháng')).toBeVisible();
      await expect(page.getByText('Đơn chờ xuất kho')).toBeVisible();
      await captureScreenshot(page, '01b-bang-dieu-khien.png');

      // 1c. Nhân viên kho: thấy Phiếu nhập, Đơn đại lý, Theo dõi thực hiện; ẩn Báo cáo, Tài khoản, Nhật ký
      await logout(page);
      await loginAs(page, 'nhanvien');
      await expect(desktopNav.getByRole('link', { name: 'Phiếu nhập' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Đơn đại lý' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Theo dõi thực hiện' })).toBeVisible();
      await expect(desktopNav.getByRole('link', { name: 'Báo cáo' })).toHaveCount(0);
      await expect(desktopNav.getByRole('link', { name: 'Tài khoản' })).toHaveCount(0);
      await expect(desktopNav.getByRole('link', { name: 'Nhật ký hệ thống' })).toHaveCount(0);

      // Chứng minh truy cập trực tiếp /reports bị chặn phân quyền
      await page.goto('/reports');
      await expect(page.getByText('Không có quyền truy cập')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Bước 2: Nhập kho (lập nháp → tồn chưa đổi → xác nhận → chặn xác nhận lần 2)
    // -------------------------------------------------------------------------
    await test.step('02. Nhập kho: lập nháp → xác nhận nguyên tử → chặn xác nhận lần 2 (409)', async () => {
      const lotCode = 'E2E-SP001-01';
      const qtyToImport = 25;

      const beforeLots = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        '/inventory/lots?search=SP001&pageSize=100',
      );
      const sp001BeforeMilli = beforeLots.items
        .filter((item) => item.product.code === 'SP001')
        .reduce((sum, item) => sum + toMilli(item.onHandQty), 0);

      await page.goto('/inbound/new');
      await expect(page.getByRole('heading', { name: 'Lập phiếu nhập kho' })).toBeVisible();

      const supplierSelect = page.locator('#supplierId');
      await expect(supplierSelect.locator('option')).not.toHaveCount(1);
      await supplierSelect.selectOption({ index: 1 });

      const productSelect = page.getByLabel('Sản phẩm dòng 1');
      await expect(productSelect.locator('option')).not.toHaveCount(1);
      const sp001OptionValue = await productSelect.evaluate((el) => {
        const select = el as HTMLSelectElement;
        const found = Array.from(select.options).find((opt) => opt.text.startsWith('SP001'));
        return found?.value ?? '';
      });
      expect(sp001OptionValue).toBeTruthy();
      await productSelect.selectOption(sp001OptionValue);

      await page.getByLabel('Mã lô dòng 1').fill(lotCode);
      await expect(page.getByLabel('Hạn sử dụng dòng 1')).not.toHaveValue('');
      await page.getByLabel('Số lượng dòng 1').fill(String(qtyToImport));
      await page.locator('#notes').fill('Phiếu nhập kiểm thử E2E');

      await page.getByRole('button', { name: 'Lưu phiếu nháp' }).click();
      await expect(page).toHaveURL(/\/inbound\/[0-9a-f-]+$/);
      await expect(page.getByText('Phiếu đang ở trạng thái nháp.')).toBeVisible();

      // Bất biến 1: nháp không đổi tồn
      const afterDraftLots = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        '/inventory/lots?search=SP001&pageSize=100',
      );
      const sp001AfterDraftMilli = afterDraftLots.items
        .filter((item) => item.product.code === 'SP001')
        .reduce((sum, item) => sum + toMilli(item.onHandQty), 0);
      expect(sp001AfterDraftMilli).toBe(sp001BeforeMilli);

      // Mở tab thứ 2 cùng phiếu nháp để kiểm tra chặn xác nhận 2 lần trên UI thật
      const draftUrl = page.url();
      const secondTab = await context.newPage();
      try {
        await secondTab.goto(draftUrl);
        await expect(
          secondTab.getByRole('button', { name: 'Xác nhận nhập kho' }),
        ).toBeVisible();

        // Tab 1 xác nhận lần 1 → thành công
        await page.getByRole('button', { name: 'Xác nhận nhập kho' }).click();
        const confirmDialog1 = page.getByRole('dialog', { name: /Xác nhận nhập kho phiếu/i });
        await expect(confirmDialog1).toBeVisible();
        await confirmDialog1.getByRole('button', { name: 'Xác nhận nhập kho' }).click();

        await expect(page.getByText(/Tồn kho đã cộng 25 đơn vị/)).toBeVisible();
        await captureScreenshot(page, '02-nhap-kho-xac-nhan.png');

        // Tab 2 bấm xác nhận lần 2 → backend trả 409, tồn không bị cộng đúp
        await secondTab.getByRole('button', { name: 'Xác nhận nhập kho' }).click();
        const confirmDialog2 = secondTab.getByRole('dialog', {
          name: /Xác nhận nhập kho phiếu/i,
        });
        await expect(confirmDialog2).toBeVisible();
        const [conflictRes] = await Promise.all([
          secondTab.waitForResponse(
            (res) =>
              res.request().method() === 'POST' &&
              /\/api\/inbound-receipts\/[^/]+\/confirm$/.test(res.url()),
          ),
          confirmDialog2.getByRole('button', { name: 'Xác nhận nhập kho' }).click(),
        ]);
        expect(conflictRes.status()).toBe(409);
        await expect(secondTab.getByText(/Tồn kho đã cộng 25 đơn vị/)).toBeVisible();
      } finally {
        await secondTab.close();
      }

      // Kiểm chứng tồn chỉ tăng đúng 25 và sổ biến động có đúng 1 dòng INBOUND
      await page.goto(`/inventory?search=${lotCode}`);
      const lotRow = page.locator('tbody tr', { hasText: lotCode });
      await expect(lotRow).toBeVisible();
      await expect(lotRow).toContainText('25');

      const movements = await apiGetAsCurrentUser<StockMovementsApiResponse>(
        page,
        request,
        `/stock-movements?search=${lotCode}&pageSize=10`,
      );
      const matchingInbound = movements.items.filter(
        (m) => m.lotCode === lotCode && m.movementType === 'INBOUND',
      );
      expect(matchingInbound).toHaveLength(1);
      expect(toMilli(matchingInbound[0].quantityDelta)).toBe(qtyToImport * 1000);
    });

    // -------------------------------------------------------------------------
    // Bước 3: Đơn đại lý → FEFO (lô bị loại kèm lý do) → xác nhận xuất
    // -------------------------------------------------------------------------
    await test.step('03. Đơn đại lý → FEFO thấy lô bị loại kèm lý do → xác nhận xuất', async () => {
      // Tìm đơn confirmed có chứa SP002 (ưu tiên đơn của DL001)
      const confirmedOrders = await apiGetAsCurrentUser<OrdersApiResponse>(
        page,
        request,
        '/orders?status=confirmed&pageSize=50',
      );
      let targetOrderNo = '';
      for (const order of confirmedOrders.items) {
        const detail = await apiGetAsCurrentUser<OrderDetailApiResponse>(
          page,
          request,
          `/orders/${order.id}`,
        );
        if (detail.items.some((item) => item.product.code === 'SP002')) {
          targetOrderNo = order.orderNo;
          if (order.agency.code === 'DL001') {
            break;
          }
        }
      }
      expect(targetOrderNo).toBeTruthy();

      await page.goto('/orders');
      await page.getByLabel('Lọc theo trạng thái').selectOption('confirmed');
      const orderRow = page.locator('tbody tr', { hasText: targetOrderNo });
      await expect(orderRow).toBeVisible();
      await orderRow.getByRole('link', { name: 'Tạo phiếu xuất' }).click();

      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\/outbound$/);
      await expect(page.getByRole('heading', { name: /Phiếu xuất cho đơn/i })).toBeVisible();

      // Bất biến 5: hiển thị khối Lô bị loại trước khi xếp FEFO kèm lý do "Đã hết hạn"
      await expect(page.getByText(/Lô bị loại trước khi xếp FEFO/).first()).toBeVisible();
      await expect(page.getByText('DEMO-SP002-EXP1').first()).toBeVisible();
      await expect(page.getByText(/Đã hết hạn/).first()).toBeVisible();

      // Xác định lô SP002 hạng #1 trong bảng gợi ý và tồn trước khi xuất
      const sp002Card = page
        .locator('div.rounded-lg.border', {
          has: page.getByRole('heading', { name: /SP002/ }),
        })
        .first();
      const firstLotRow = sp002Card.locator('tbody tr').first();
      const firstLotCode = (await firstLotRow.locator('td').nth(1).innerText()).trim();
      const allocatedQtyStr = await firstLotRow.locator('input').inputValue();
      const allocatedMilli = toMilli(allocatedQtyStr);
      expect(allocatedMilli).toBeGreaterThan(0);

      const beforeLots = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        `/inventory/lots?search=${encodeURIComponent(firstLotCode)}&includeEmpty=true&pageSize=20`,
      );
      const lotBefore = beforeLots.items.find((l) => l.lotCode === firstLotCode);
      expect(lotBefore).toBeTruthy();
      const beforeLotMilli = toMilli(lotBefore!.onHandQty);

      await captureScreenshot(page, '03-xuat-kho-fefo.png');

      // Xác nhận xuất kho
      await page.getByRole('button', { name: 'Xác nhận xuất kho' }).first().click();
      const confirmOutboundDialog = page.getByRole('dialog', {
        name: /Xác nhận xuất kho cho đơn/i,
      });
      await expect(confirmOutboundDialog).toBeVisible();
      await confirmOutboundDialog.getByRole('button', { name: 'Xác nhận xuất kho' }).click();

      await expect(page).toHaveURL(/\/outbound\/[0-9a-f-]+$/);

      const afterLots = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        `/inventory/lots?search=${encodeURIComponent(firstLotCode)}&includeEmpty=true&pageSize=20`,
      );
      const lotAfter = afterLots.items.find((l) => l.lotCode === firstLotCode);
      expect(lotAfter).toBeTruthy();
      expect(toMilli(lotAfter!.onHandQty)).toBe(beforeLotMilli - allocatedMilli);
    });

    // -------------------------------------------------------------------------
    // Bước 4: Ngưỡng & Cảnh báo HSD theo ngưỡng riêng
    // -------------------------------------------------------------------------
    await test.step('04. Cảnh báo HSD theo ngưỡng riêng (Sản phẩm > Nhóm hàng > Chung)', async () => {
      await logout(page);
      await loginAs(page, 'quanly');

      await page.goto('/expiry-thresholds');
      await expect(
        page.getByRole('heading', { name: 'Ngưỡng cảnh báo hạn sử dụng' }),
      ).toBeVisible();
      await expect(page.locator('#global-warning-days')).toHaveValue('30');
      await expect(page.getByRole('heading', { name: 'Ngưỡng riêng' })).toBeVisible();
      const sp002OverrideRow = page.locator('tbody tr', { hasText: 'SP002' });
      await expect(sp002OverrideRow).toBeVisible();
      await expect(sp002OverrideRow).toContainText('10');
      const suaOverrideRow = page
        .locator('tbody tr', { hasText: 'Nhóm hàng' })
        .filter({ hasText: 'Sữa' })
        .first();
      await expect(suaOverrideRow).toBeVisible();
      await expect(suaOverrideRow).toContainText('45');

      await page.goto('/expiry-alerts');
      await expect(page.getByRole('heading', { name: 'Cảnh báo hàng cận hạn' })).toBeVisible();
      await expect(page.getByText('Đã hết hạn').first()).toBeVisible();
      await expect(page.getByText('Cận hạn').first()).toBeVisible();
      await expect(page.getByText('Ngưỡng chung')).toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await expect(page.getByText('DEMO-SP002-EXP1').first()).toBeVisible();

      await captureScreenshot(page, '04-canh-bao-hsd.png');
    });

    // -------------------------------------------------------------------------
    // Bước 5: Dự báo nhu cầu (so sánh với trung bình 7 ngày)
    // -------------------------------------------------------------------------
    await test.step('05. Dự báo nhu cầu (so sánh với trung bình 7 ngày)', async () => {
      await page.goto('/forecast');
      await expect(page.getByRole('heading', { name: 'Dự báo nhu cầu tiêu thụ' })).toBeVisible();
      await expect(page.getByText('(mô phỏng)')).toBeVisible();
      await expect(page.getByText('Thông tin lượt chạy')).toBeVisible();
      await expect(page.getByText(/Random Forest \(rf-/)).toBeVisible();
      await expect(page.getByText('Sai số MAE')).toBeVisible();
      await expect(page.getByText(/Trung bình 7 ngày:\s+[\d.,]+/)).toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();

      await captureScreenshot(page, '05-du-bao-nhu-cau.png');
    });

    // -------------------------------------------------------------------------
    // Bước 6: Chạy phân tích nguy cơ tồn dư
    // -------------------------------------------------------------------------
    await test.step('06. Chạy phân tích nguy cơ tồn dư và xem căn cứ tính FEFO', async () => {
      await page.goto('/risk');
      await expect(
        page.getByRole('heading', { name: 'Phân tích nguy cơ tồn dư' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Kết quả theo lô' })).toBeVisible();

      const rerunButton = page.getByRole('button', { name: 'Phân tích lại' });
      await expect(rerunButton).toBeEnabled();
      await rerunButton.click();

      await expect(
        page.getByText('Đã hoàn tất phân tích nguy cơ tồn dư.').first(),
      ).toBeVisible({ timeout: 45_000 });

      // Mở hộp thoại "Căn cứ tính" cho một lô có tồn dư (ưu tiên lô không hết hạn hoặc lô đầu tiên)
      const nearRow = page.locator('tbody tr', { hasText: /Nguy cấp|Trung bình/ }).first();
      const targetRow = (await nearRow.count()) > 0 ? nearRow : page.locator('tbody tr').first();
      await expect(targetRow).toBeVisible();
      await targetRow.click();

      const basisDialog = page.getByRole('dialog', { name: /Căn cứ tính - Lô/i });
      await expect(basisDialog).toBeVisible();
      await expect(basisDialog.getByText('Tồn lúc phân tích').first()).toBeVisible();
      await expect(basisDialog.getByText('Tồn dư ước tính').first()).toBeVisible();
      await basisDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(basisDialog).toBeHidden();

      await captureScreenshot(page, '06-phan-tich-ton-du.png');
    });

    // -------------------------------------------------------------------------
    // Bước 7: Đề xuất xử lý + diễn giải LLM mock + "Mô phỏng lỗi dịch vụ" → fallback
    // -------------------------------------------------------------------------
    await test.step('07. Đề xuất xử lý + LLM mock + "Mô phỏng lỗi dịch vụ" → fallback', async () => {
      await page.goto('/proposals');
      await expect(
        page.getByRole('heading', { name: 'Đề xuất xử lý hàng cận hạn' }),
      ).toBeVisible();

      // Bất biến 8: lượt phân tích bước 6 không ghi đè phương án đã duyệt/đang thực hiện trước đó
      await expect(page.locator('tbody tr', { hasText: 'Đang thực hiện' }).first()).toBeVisible();

      // Lọc đề xuất chờ duyệt mức Hết hạn (DISPOSE)
      await page.getByLabel('Lọc theo trạng thái').selectOption('pending');
      await page.getByLabel('Lọc theo mức rủi ro').selectOption('critical');

      const pendingDisposeRow = page.locator('tbody tr').first();
      await expect(pendingDisposeRow).toBeVisible();
      approvedDisposalLotCode = (await pendingDisposeRow.locator('td').nth(1).innerText()).trim();
      expect(approvedDisposalLotCode).toBeTruthy();

      await pendingDisposeRow.getByRole('link', { name: 'Xem chi tiết' }).click();
      await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]+$/);
      await expect(
        page.getByRole('heading', { name: `Lô ${approvedDisposalLotCode}` }),
      ).toBeVisible();

      // Xác minh diễn giải LLM mock hợp lệ & mở bảng dữ liệu AI đã dùng
      await expect(
        page.getByText(/Diễn giải do mô hình ngôn ngữ viết từ số liệu bên dưới/),
      ).toBeVisible();
      await page.getByText('Số liệu dùng để diễn giải').click();
      await expect(
        page.getByRole('region', { name: 'Bảng số liệu dùng để diễn giải' }),
      ).toBeVisible();
      await captureScreenshot(page, '07-de-xuat-llm-mock.png');

      // Bất biến 7: bấm "Mô phỏng lỗi dịch vụ" → rơi về tóm tắt bộ quy tắc, số liệu giữ nguyên
      await page.getByRole('button', { name: 'Mô phỏng lỗi dịch vụ' }).click();
      await expect(
        page.getByText(/Không thể tải phần diễn giải\. Đang hiển thị tóm tắt nghiệp vụ dự phòng/).first(),
      ).toBeVisible();
      await expect(page.getByText('Tóm tắt nghiệp vụ dự phòng').first()).toBeVisible();
      await expect(page.getByText('Tồn dư ước tính').first()).toBeVisible();
      await captureScreenshot(page, '07b-de-xuat-llm-fallback.png');

      // Khôi phục lại diễn giải LLM mock
      await page.getByRole('button', { name: 'Khôi phục' }).click();
      await expect(
        page.getByText(/Diễn giải do mô hình ngôn ngữ viết từ số liệu bên dưới/).first(),
      ).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Bước 8: Phê duyệt đề xuất (không trừ tồn kho)
    // -------------------------------------------------------------------------
    await test.step('08. Phê duyệt đề xuất (tuyệt đối không trừ tồn kho)', async () => {
      const lotsBefore = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        `/inventory/lots?search=${encodeURIComponent(approvedDisposalLotCode)}&includeEmpty=true&pageSize=20`,
      );
      const targetLotBefore = lotsBefore.items.find(
        (item) => item.lotCode === approvedDisposalLotCode,
      );
      expect(targetLotBefore).toBeTruthy();
      approvedDisposalQtyMilli = toMilli(targetLotBefore!.onHandQty);
      expect(approvedDisposalQtyMilli).toBeGreaterThan(0);

      const movementsBefore = await apiGetAsCurrentUser<StockMovementsApiResponse>(
        page,
        request,
        '/stock-movements?pageSize=1',
      );

      await page.locator('#proposal-decision-note').fill('Đồng ý hủy lô hết hạn theo biên bản E2E');
      await page.getByRole('button', { name: 'Phê duyệt', exact: true }).click();

      const approveDialog = page.getByRole('dialog', { name: /Phê duyệt đề xuất này/i });
      await expect(approveDialog).toBeVisible();
      await approveDialog.getByRole('button', { name: 'Phê duyệt', exact: true }).click();

      await expect(page.getByText('Đã phê duyệt').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Theo dõi thực hiện' }).first()).toBeVisible();

      // Bất biến 1 & 8: phê duyệt KHÔNG đổi tồn và KHÔNG sinh stock_movement mới
      const lotsAfter = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        `/inventory/lots?search=${encodeURIComponent(approvedDisposalLotCode)}&includeEmpty=true&pageSize=20`,
      );
      const targetLotAfter = lotsAfter.items.find(
        (item) => item.lotCode === approvedDisposalLotCode,
      );
      expect(toMilli(targetLotAfter!.onHandQty)).toBe(approvedDisposalQtyMilli);

      const movementsAfter = await apiGetAsCurrentUser<StockMovementsApiResponse>(
        page,
        request,
        '/stock-movements?pageSize=1',
      );
      expect(movementsAfter.total).toBe(movementsBefore.total);

      await captureScreenshot(page, '08-phe-duyet-de-xuat.png');
    });

    // -------------------------------------------------------------------------
    // Bước 9: Theo dõi thực hiện & Lập phiếu hủy (tồn giảm về 0)
    // -------------------------------------------------------------------------
    await test.step('09. Theo dõi thực hiện & lập phiếu hủy (tồn giảm về 0)', async () => {
      await logout(page);
      await loginAs(page, 'nhanvien');

      await page.goto('/executions');
      await expect(
        page.getByRole('heading', { name: 'Theo dõi thực hiện phương án' }),
      ).toBeVisible();

      // Phương án đang thực hiện sẵn từ dữ liệu demo (120 đơn vị)
      const inProgressRow = page.locator('tbody tr', { hasText: 'Đang thực hiện' }).first();
      await expect(inProgressRow).toBeVisible();
      await expect(inProgressRow).toContainText('120');

      // Mở dialog Ghi kết quả cho đề xuất DISPOSE vừa duyệt ở bước 8
      const disposalRow = page.locator('tbody tr', { hasText: approvedDisposalLotCode }).first();
      await expect(disposalRow).toBeVisible();
      await disposalRow.getByRole('button', { name: 'Ghi kết quả', exact: true }).click();

      const resultDialog = page.getByRole('dialog', { name: /Ghi kết quả thực hiện/i });
      await expect(resultDialog).toBeVisible();
      await expect(resultDialog.locator('#exec-disposal-qty')).not.toHaveValue('');
      await resultDialog.locator('#exec-disposal-notes').fill('BBH-E2E-01 hủy lô hết hạn');
      await resultDialog.getByRole('button', { name: 'Lập phiếu hủy', exact: true }).click();

      const confirmDisposalDialog = page.getByRole('dialog', {
        name: /Xác nhận lập phiếu hủy/i,
      });
      await expect(confirmDisposalDialog).toBeVisible();
      await confirmDisposalDialog.getByRole('button', { name: 'Lập phiếu hủy', exact: true }).click();

      await expect(resultDialog).toBeHidden();
      const updatedDisposalRow = page
        .locator('tbody tr', { hasText: approvedDisposalLotCode })
        .first();
      await expect(updatedDisposalRow).toContainText('Đang thực hiện');

      // Đánh dấu hoàn thành phương án sau khi đã hủy hết tồn lô hết hạn (đúng README bước 11)
      await updatedDisposalRow.getByRole('button', { name: 'Ghi kết quả', exact: true }).click();
      await expect(resultDialog).toBeVisible();
      await resultDialog.locator('#exec-status').selectOption('completed');
      await resultDialog.locator('#exec-note').fill('Đã hoàn tất hủy toàn bộ lô hết hạn theo BBH-E2E-01');
      await resultDialog.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
      await expect(resultDialog).toBeHidden();

      await expect(
        page.locator('tbody tr', { hasText: approvedDisposalLotCode }).first(),
      ).toContainText('Hoàn thành');

      await captureScreenshot(page, '09-thuc-hien-phieu-huy.png');

      // Xác minh tồn lô hết hạn đã giảm về 0 và có dòng DISPOSAL trong sổ biến động
      const lotsAfterDisposal = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
        page,
        request,
        `/inventory/lots?search=${encodeURIComponent(approvedDisposalLotCode)}&includeEmpty=true&pageSize=20`,
      );
      const disposedLot = lotsAfterDisposal.items.find(
        (item) => item.lotCode === approvedDisposalLotCode,
      );
      expect(disposedLot).toBeTruthy();
      expect(toMilli(disposedLot!.onHandQty)).toBe(0);

      const disposalMovements = await apiGetAsCurrentUser<StockMovementsApiResponse>(
        page,
        request,
        `/stock-movements?search=${encodeURIComponent(approvedDisposalLotCode)}&movementType=DISPOSAL&pageSize=10`,
      );
      const matchedDisposal = disposalMovements.items.find(
        (m) => m.lotCode === approvedDisposalLotCode && m.movementType === 'DISPOSAL',
      );
      expect(matchedDisposal).toBeTruthy();
      expect(toMilli(matchedDisposal!.quantityDelta)).toBe(-approvedDisposalQtyMilli);
    });

    // -------------------------------------------------------------------------
    // Bước 10: Báo cáo Nhập – Xuất – Tồn khớp tồn kho (+ Xuất Excel)
    // -------------------------------------------------------------------------
    await test.step('10. Báo cáo Nhập – Xuất – Tồn khớp tồn kho 100% và xuất Excel', async () => {
      await logout(page);
      await loginAs(page, 'quanly');

      await page.goto('/reports');
      await expect(
        page.getByRole('heading', { name: 'Báo cáo nhập, xuất, tồn' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tổng hợp theo sản phẩm' })).toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();

      // Đối chiếu toán học: closing = opening + inbound - outbound + adjustment === tổng tồn hiện tại
      const todayIso = getVnTodayIso();
      const monthStartIso = getMonthStartIso(todayIso);
      const ledger = await apiGetAsCurrentUser<StockLedgerApiResponse>(
        page,
        request,
        `/reports/stock-ledger?from=${monthStartIso}&to=${todayIso}`,
      );
      const allLots: InventoryLotApiItem[] = [];
      let lotsPage = 1;
      while (true) {
        const pageRes = await apiGetAsCurrentUser<InventoryLotsApiResponse>(
          page,
          request,
          `/inventory/lots?page=${lotsPage}&pageSize=100`,
        );
        allLots.push(...pageRes.items);
        if (allLots.length >= pageRes.total || pageRes.items.length === 0) {
          break;
        }
        lotsPage += 1;
      }
      const onHandByProduct = new Map<string, number>();
      for (const lot of allLots) {
        onHandByProduct.set(
          lot.product.id,
          (onHandByProduct.get(lot.product.id) ?? 0) + toMilli(lot.onHandQty),
        );
      }

      expect(ledger.items.length).toBeGreaterThan(0);
      for (const row of ledger.items) {
        const computedClosing =
          toMilli(row.opening) +
          toMilli(row.inbound) -
          toMilli(row.outbound) +
          toMilli(row.adjustment);
        const reportedClosing = toMilli(row.closing);
        expect(reportedClosing, `Lệch phương trình NXT ở ${row.product.code}`).toBe(
          computedClosing,
        );
        expect(reportedClosing, `Lệch tồn kho ở ${row.product.code}`).toBe(
          onHandByProduct.get(row.product.id) ?? 0,
        );
      }

      // Kiểm tra tải file Excel (.xlsx)
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Xuất Excel', exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
      const downloadedPath = await download.path();
      expect(downloadedPath).toBeTruthy();
      expect(fs.statSync(downloadedPath!).size).toBeGreaterThan(1_000);

      await captureScreenshot(page, '10-bao-cao-nxt.png');

      // Kiểm tra tab Rủi ro cận hạn tải được bình thường
      await page.getByRole('tab', { name: 'Rủi ro cận hạn', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Báo cáo rủi ro cận hạn' })).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Bước 11: Nhật ký hệ thống (admin)
    // -------------------------------------------------------------------------
    await test.step('11. Nhật ký hệ thống (admin)', async () => {
      await logout(page);
      await loginAs(page, 'admin');

      await page.goto('/audit-logs');
      await expect(page.getByRole('heading', { name: 'Nhật ký hệ thống' })).toBeVisible();
      await expect(page.getByText(/\d+\s+bản ghi/)).toBeVisible();

      const firstDetailBtn = page.getByRole('button', { name: 'Chi tiết', exact: true }).first();
      await expect(firstDetailBtn).toBeVisible();
      await firstDetailBtn.click();
      await expect(page.getByText('Trước', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Sau', { exact: true }).first()).toBeVisible();

      await captureScreenshot(page, '11-nhat-ky-he-thong.png');
    });

    // -------------------------------------------------------------------------
    // Bước 12: Kiểm tra giao diện màn hẹp 390px
    // -------------------------------------------------------------------------
    await test.step('12. Kiểm tra bố cục màn hình hẹp 390px không tràn ngang', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
      await expect(page.getByTestId('mobile-topbar')).toBeVisible();
      await expect(page.locator('aside')).toBeHidden();
      await expect(page.getByText('Tổng tồn kho')).toBeVisible();

      const overflowPx = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflowPx, 'Trang 390px không được tràn ngang').toBeLessThanOrEqual(1);

      await captureScreenshot(page, '12-man-hep-390px.png', { fullPage: true });
    });
  });
});
