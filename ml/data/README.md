# Dữ liệu xuất kho mô phỏng — KHO-AI ML

> **Lưu ý quan trọng**: Toàn bộ dữ liệu trong thư mục này là **dữ liệu mô phỏng (synthetic data)** được sinh bằng script `training/generate_data.py`, không phải số liệu lịch sử thực tế của doanh nghiệp. Kết quả dự báo trên tập dữ liệu này chỉ dùng để phát triển, kiểm thử và đối chứng thuật toán (PB20/US21).

## 1. Biến mục tiêu và các tệp dữ liệu

- **Biến mục tiêu (`qty`)**: **số lượng đã xuất kho thực tế** theo ngày của từng sản phẩm (số nguyên không âm, đơn vị `thung`). Đây **không phải** số lượng đặt hàng của đại lý.
- `data/products.csv`: danh mục 20 sản phẩm (`SP001`–`SP020`) thuộc 4 nhóm hàng (`sua`, `sua_chua`, `nuoc_giai_khat`, `banh_keo`), tên chung chung không dùng thương hiệu thật.
  - Cột: `product_code,name,group,unit,shelf_life_days`.
- `data/synthetic_sales.csv`: chuỗi thời gian xuất kho hằng ngày từ `2024-12-01` đến `2026-11-22` (722 ngày × 20 sản phẩm = 14.440 dòng).
  - Cột: `date,product_code,qty`.

## 2. Các thành phần và tham số sinh dữ liệu

Bộ sinh dữ liệu sử dụng `numpy.random.default_rng(seed)` với thứ tự duyệt cố định theo `(date, product_code)` để đảm bảo cùng `--seed` cho ra file giống hệt từng byte (byte-identical).

- **Mức nền (base level)**: cố định riêng theo từng sản phẩm, dao động `12`–`44` thùng/ngày.
- **Xu hướng (trend)**: tăng/giảm tuyến tính nhẹ theo thời gian (`-8%` đến `+16%` trong toàn giai đoạn 2 năm).
- **Mùa vụ tuần (weekly seasonality)**: hệ số theo thứ trong tuần — Thứ 2–Thứ 5 (`0.90–0.96`), Thứ 6 (`1.08`), Thứ 7 (`1.32`), Chủ nhật (`1.28`).
- **Mùa vụ năm (yearly seasonality)**:
  - **Tết âm lịch** (ngày mùng 1 cố định trong code: `2025-01-29` và `2026-02-17`): 20 ngày cận Tết tăng mạnh theo nhóm hàng (`banh_keo × 1.75`, `nuoc_giai_khat × 1.60`, `sua × 1.40`, `sua_chua × 1.30`); 3 ngày nghỉ Tết chính giảm về `× 0.35`.
  - **Mùa hè** (tháng 5–8): nhóm `nuoc_giai_khat` tăng `× 1.35`, nhóm `sua_chua` tăng `× 1.15`.
- **Ngày khuyến mãi ngẫu nhiên**: xác suất `5%` mỗi ngày, tăng đột biến `× 1.4–1.8`.
- **Ngày không xuất hàng (`qty = 0`)**: xác suất `4%` (trừ giai đoạn 20 ngày cận Tết).
- **Nhiễu ngẫu nhiên**: phân phối chuẩn `N(0, max(1.0, 0.15 * expected))`, làm tròn số nguyên và kẹp `>= 0`.

## 3. Giới hạn

- Không phản ánh gián đoạn chuỗi cung ứng thực tế, hết tồn kho (stockout) hay biến động giá.
- Quy luật mùa vụ và khuyến mãi là giả định mô phỏng; khi có dữ liệu thực tế từ vận hành kho cần đánh giá lại mô hình từ đầu.

## 4. Lệnh sinh lại dữ liệu và đánh giá baseline

Chạy trong thư mục `QuanLyKhoAI/` (hoặc worktree tương ứng):

```bash
docker compose -p kho-ai-ml run --rm ml python -m training.generate_data --seed 42 --out data/synthetic_sales.csv
docker compose -p kho-ai-ml run --rm ml python -m training.evaluate
```
