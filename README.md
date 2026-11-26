# Nhom06 - Quản lý kho tích hợp AI

[![CI](https://github.com/KLTN-12-2026/Nhom06/actions/workflows/ci.yml/badge.svg)](https://github.com/KLTN-12-2026/Nhom06/actions/workflows/ci.yml)

Xây dựng hệ thống quản lý kho thông minh tích hợp AI đề xuất xử lý hàng cận hạn.
GVHD: ThS. Trần Bàn Thạch

## Công nghệ

- web: React, Vite, Tailwind, shadcn/ui
- api: NestJS, Prisma, PostgreSQL
- ml: FastAPI, scikit-learn

## Chạy dự án

Cần cài Docker.

```bash
cp .env.example .env
docker compose up -d --build
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/docs
- ML: http://localhost:8000/docs

## Demo

### 1. Dựng dữ liệu demo (neo theo ngày hiện tại)

Đảm bảo `.env` đang bật `LLM_PROVIDER=mock` và `LLM_DEMO_TOGGLE=true` (mặc định trong `.env.example`) để có diễn giải mô phỏng tất định và nút mô phỏng lỗi dịch vụ LLM khi trình bày.

```bash
# Khởi động toàn bộ dịch vụ (Postgres + ML + API + Web)
docker compose up -d --build

# Reset DB, chạy migration + seed cơ bản (tài khoản, 20 SP, NCC, đại lý, 722 ngày lịch sử mô phỏng)
docker compose exec api npx prisma migrate reset --force

# Dựng bộ dữ liệu demo qua các service nghiệp vụ thật (< 2 phút)
# Bắt buộc truyền tường minh ALLOW_DEMO_SEED=true; script tự từ chối trên NODE_ENV=production
docker compose exec -e ALLOW_DEMO_SEED=true api npm run seed:demo -- --reset
```

Bộ dữ liệu sau khi dựng gồm: lịch sử nhập–xuất 12 tháng cho `SP001..SP010`, 40 lô đang còn tồn có đầy đủ đơn giá nhập (`SP002` có 4 lô đã hết hạn quá 7–53 ngày và 1 lô còn 8 ngày; `SP004` & `SP007` mỗi sản phẩm 1 lô còn 20 ngày; 33 lô hạn dài), 2 ngưỡng cảnh báo riêng (`SP002: 10 ngày`, nhóm `Sữa: 45 ngày`), 3 đơn chờ xuất (`confirmed`) + 1 đơn đã xuất một phần (`partial`), 1 phiếu kiểm kê đã duyệt có chênh lệch, 1 lượt dự báo + 1 lượt phân tích `FULL`, và 1 đề xuất `PRIORITIZE_FEFO` của `SP004` đã duyệt sẵn đang thực hiện `120` đơn vị.

> Lưu ý: dữ liệu lịch sử nhu cầu (`demand_history` nguồn `SIMULATED`) và mô hình dự báo (`rf-v1`) sử dụng dữ liệu **mô phỏng** theo mùa vụ/xu hướng; giao diện hiển thị rõ nhãn nguồn dữ liệu.

### 2. Tài khoản demo

Mật khẩu mặc định cho cả 3 tài khoản là `123456` (có thể đổi qua `SEED_DEMO_PASSWORD` trước khi seed).

| Tài khoản | Họ tên | Vai trò | Phạm vi chính |
|---|---|---|---|
| `admin` | Phan Thanh Đức | Quản trị viên (`ADMIN`) | Toàn quyền danh mục, kho, báo cáo, tài khoản & phân quyền; **không** có quyền phê duyệt đề xuất AI (bất biến 8). |
| `quanly` | Nguyễn Văn Dương | Quản lý kho (`WAREHOUSE_MANAGER`) | Duyệt kiểm kê, cấu hình ngưỡng HSD, chạy dự báo & phân tích AI, **duy nhất phê duyệt/từ chối đề xuất**, xem báo cáo. |
| `nhanvien` | Trương Thành Lê | Nhân viên kho (`WAREHOUSE_STAFF`) | Lập/xác nhận phiếu nhập, tạo đơn đại lý, xuất kho FEFO, lập phiếu kiểm kê, ghi kết quả thực hiện & lập phiếu hủy sau khi được duyệt; **không** xem báo cáo, không chạy phân tích hay duyệt đề xuất. |

### 3. Kịch bản demo cho hội đồng (12 bước)

| Bước | Vai trò | Màn hình | Thao tác | Điều cần chỉ ra với hội đồng |
|---|---|---|---|---|
| 1 | `admin` | Tài khoản & phân quyền (`/users`) | Đăng nhập `admin`, mở bảng ma trận phân quyền 3 vai trò. | Phân quyền kiểm tra ở **backend** (guard `@Permissions`), không chỉ ẩn nút ở UI; đặc biệt bỏ quyền **Phê duyệt đề xuất** khỏi `ADMIN` để bảo đảm chỉ Quản lý kho ra quyết định (bất biến 8). |
| 2 | `quanly` | Bảng điều khiển (`/`) | Đăng nhập `quanly`, xem các thẻ KPI, biểu đồ 12 tháng, đơn chờ xuất và danh sách lô ưu tiên. | Bức tranh kho neo theo ngày hiện tại: 40 lô còn hàng, 4 lô hết hạn `SP002`, 3 lô cận hạn (`SP002`, `SP004`, `SP007`), **Giá trị có nguy cơ mất** tính từ đơn giá nhập thật, biểu đồ nhập–xuất 12 tháng đầy đủ. |
| 3 | `nhanvien` | Phiếu nhập (`/inbound/new` → `/inbound/:id`) | Lập 1 phiếu nhập nháp mới → kiểm tra tồn kho chưa đổi → bấm **Xác nhận nhập** (thử gửi lại lần 2 hoặc giải thích cơ chế khóa giao dịch) → mở `/inventory` và `/stock-movements`. | **Tồn kho chỉ đổi khi xác nhận** (bất biến 1); xác nhận nguyên tử trong 1 DB transaction có `FOR UPDATE`, **chống xác nhận 2 lần** (API trả `409`), tự ghi dòng `INBOUND` vào sổ biến động gắn mã chứng từ nguồn. |
| 4 | `nhanvien` | Đơn đại lý & Xuất FEFO (`/orders` → `/orders/:id/outbound`) | Mở đơn chờ xuất đầu tiên của `DL001` (có `SP002`) → bấm **Tạo phiếu xuất (FEFO)** → xem phân bổ gợi ý → bấm **Xác nhận xuất kho**. | Chỉ rõ khối **"Lô bị loại trước khi xếp FEFO"**: 4 lô hết hạn của `SP002` bị lọc bỏ kèm lý do *"Đã hết hạn"* **trước** khi sắp xếp; lô còn 8 ngày (`>= min_delivery_days = 7`) được xếp trước lô hạn dài; đơn chuyển trạng thái sau khi xác nhận và trừ tồn nguyên tử. |
| 5 | `quanly` | Ngưỡng & Cảnh báo HSD (`/expiry-thresholds` → `/expiry-alerts`) | Xem ngưỡng chung (`30 / 7 / 7`) và 2 ngưỡng riêng (`SP002: 10 ngày`, nhóm `Sữa: 45 ngày`) → chuyển sang Cảnh báo hàng cận hạn. | Cơ chế ưu tiên **Sản phẩm > Nhóm hàng > Chung**: lô `SP002` còn 8 ngày áp ngưỡng `10 ngày`, lô `SP004` còn 20 ngày áp ngưỡng nhóm `45 ngày`, lô `SP007` còn 20 ngày áp ngưỡng chung `30 ngày`. |
| 6 | `quanly` | Dự báo nhu cầu (`/forecast`) | Xem biểu đồ 60 ngày của `SP002` / `SP004` và thẻ chỉ số mô hình. | Dịch vụ ML (`FastAPI`) chỉ trả dự báo số thô; luôn so sánh **Random Forest (`rf-v1`) với baseline trung bình trượt 7 ngày (MA7)** qua MAE/RMSE trên tập kiểm thử chia theo thời gian, ghi rõ dữ liệu mô phỏng. |
| 7 | `quanly` | Phân tích nguy cơ tồn dư (`/risk`) | Xem danh sách 40 lô phân loại theo mức rủi ro → bấm vào 1 lô (`DEMO-SP004-NEAR` hoặc `DEMO-SP002-NEAR`) xem hộp **"Cách tính"**. | NestJS thực hiện toàn bộ logic nghiệp vụ (ML không đọc DB): cửa sổ bán đến `HSD − 7 ngày`, phân bổ nhu cầu dự báo theo thứ tự FEFO, tính `tồn dư ước tính` và mức rủi ro có bằng chứng (`basis`). |
| 8 | `quanly` | Đề xuất xử lý (`/proposals`) | Xem danh sách đề xuất chờ duyệt theo thứ tự ưu tiên rủi ro. | Bộ quy tắc tất định sinh phương án chính và `allowed_actions`: lô hết hạn → **Loại bỏ & lập biên bản hủy (`DISPOSE`)**, nguy cấp ≤ 14 ngày → **Liên hệ đại lý (`CONTACT_AGENCY`)**, trung bình > 14 ngày → **Ưu tiên FEFO (`PRIORITIZE_FEFO`)**. Không bao giờ gợi ý bán hàng hết hạn. |
| 9 | `quanly` | Chi tiết đề xuất (`/proposals/:id`) | Mở 1 đề xuất `DISPOSE` của `SP002` → mở khung **"Số liệu thô gửi LLM"** → bấm **"Mô phỏng lỗi dịch vụ"** → quan sát giao diện fallback → bấm **"Khôi phục dịch vụ diễn giải"**. | Chứng minh **LLM chỉ là lớp trình bày có rào chắn**: đầu vào chỉ gồm 12 trường số liệu + `allowed_actions` (không lộ tên đại lý/người dùng); khi LLM lỗi hoặc bịa số, hệ thống tự rơi về **tóm tắt do bộ quy tắc sinh**, bảng số liệu và phương án từ DB không hề bị ảnh hưởng. |
| 10 | `quanly` | Chi tiết đề xuất (`/proposals/:id`) | Bấm **Phê duyệt đề xuất** cho 1 lô `SP002` hết hạn → quay nhanh sang `/inventory` & `/stock-movements`. | **Phê duyệt chỉ ghi quyết định của con người và tạo kế hoạch thực hiện — tuyệt đối KHÔNG trừ tồn kho** (bất biến 1 & 8). Lượt phân tích mới sau này cũng không ghi đè quyết định đã duyệt. |
| 11 | `nhanvien` | Theo dõi thực hiện (`/executions`) | Xem phương án `PRIORITIZE_FEFO` của `SP004` đang thực hiện `120` đơn vị → bấm **"Lập phiếu hủy"** trên đề xuất `DISPOSE` vừa duyệt → xác nhận hủy hết tồn lô hết hạn → đánh dấu hoàn thành & kiểm tra `/inventory`, `/stock-movements`. | **Chỉ khi lập & xác nhận phiếu hủy (`DISPOSAL`) tồn kho mới giảm về `0`** và ghi dòng `DISPOSAL` trong sổ biến động; phương án ghi nhận lượng thực tế gắn mã phiếu xuất hủy. |
| 12 | `quanly` | Báo cáo (`/reports`) | Xem tab **Báo cáo Nhập – Xuất – Tồn**, bấm **Xuất Excel (`.xlsx`)**, chuyển sang tab **Báo cáo rủi ro cận hạn**; đăng nhập lại `nhanvien` để chứng minh không truy cập được báo cáo. | Tồn cuối kỳ = `Đầu kỳ + Nhập − Xuất ± Điều chỉnh` **khớp 100%** với tổng tồn hiện tại theo từng sản phẩm (tách ĐVT, không gộp sai đơn vị); phân quyền chặn `WAREHOUSE_STAFF` xem báo cáo. |

### 4. Kiểm thử tự động

Bộ test API (`npm test` và `npm run test:smoke`) tự động chạy trên database riêng `kho_ai_test` (cấu hình qua `TEST_DATABASE_URL`), tự tạo DB nếu chưa có, chạy migration + seed cơ bản trước mỗi lượt và **không làm thay đổi dữ liệu demo trên DB dev `kho_ai`**. Rào chắn an toàn sẽ chặn ngay nếu `TEST_DATABASE_URL` trùng DB dev hoặc tên DB không kết thúc bằng `_test`.

```bash
# Chạy toàn bộ unit test & e2e test API trên DB test kho_ai_test
docker compose exec api npm test

# Chạy smoke test toàn hệ thống qua HTTP + kiểm tra bất biến dữ liệu demo trên DB test kho_ai_test
docker compose exec -e ALLOW_DEMO_SEED=true api npm run test:smoke
```

### 5. Xử lý sự cố nhanh khi demo

- **Dịch vụ ML chưa sẵn sàng hoặc báo lỗi timeout khi chạy dự báo/phân tích**:
  - Kiểm tra container ML: `docker compose ps` và `docker compose logs --tail=50 ml`.
  - Lần khởi động đầu tiên chưa có file `ml/models/rf_v1.joblib`, dịch vụ ML tự huấn luyện mất khoảng 15–30 giây; kiểm tra `curl http://localhost:8000/health` đến khi trả `{"status":"ok","service":"ml"}`.
  - Nếu máy chậm, tăng `ML_TIMEOUT_MS=20000` trong `.env` và `docker compose up -d api`.
- **Dịch vụ LLM bên ngoài lỗi, mất mạng hoặc hết hạn mức**:
  - Đặt `LLM_PROVIDER=mock` (diễn giải mô phỏng tất định) hoặc `LLM_PROVIDER=none` (chỉ hiển thị tóm tắt do bộ quy tắc sinh) trong `.env`, rồi chạy `docker compose up -d api`.
  - Chủ động tận dụng tình huống này để giải thích cho hội đồng cơ chế fallback theo bất biến 7: mọi số liệu, đề xuất và thao tác phê duyệt vẫn hoạt động bình thường.
- **Cần khôi phục nhanh trạng thái demo sạch trước giờ bảo vệ**:
  - Chạy lại 1 lệnh duy nhất (mất dưới 2 phút, giữ nguyên tài khoản/danh mục/ngưỡng):
    `docker compose exec -e ALLOW_DEMO_SEED=true api npm run seed:demo -- --reset`

## Thành viên

Trương Thành Lê, Nguyễn Văn Dương, Phan Thanh Đức, Phan Nhật Tuyến, Lê Trương Hồng Long
