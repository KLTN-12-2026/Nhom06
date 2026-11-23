# Báo cáo đánh giá mô hình dự báo nhu cầu — KHO-AI ML

> **Lưu ý dữ liệu**: Toàn bộ chỉ số dưới đây được đo trên **dữ liệu mô phỏng** (`data/synthetic_sales.csv`, sinh bằng `training/generate_data.py --seed 42`, 20 sản phẩm `SP001`–`SP020`, từ `2024-12-01` đến `2026-11-22`). Không phải số liệu bán hàng thực tế của doanh nghiệp.

## 1. Thiết lập chia tập train / test

- **Tập huấn luyện**: `2024-12-01` → `2026-09-23` (662 ngày/sản phẩm; sau khi trừ 28 ngày đầu dựng đặc trưng lag/rolling còn `634 × 20 = 12.680` dòng).
- **Tập kiểm thử**: 60 ngày cuối `2026-09-24` → `2026-11-22` (cùng mốc chia với `reports/baseline_metrics.json`).
- **Mô hình**: một `RandomForestRegressor` chung cho mọi sản phẩm (`rf-v1`, `n_estimators=200`, `max_depth=None`, `min_samples_leaf=2`, `random_state=42`), 11 đặc trưng chỉ dùng dữ liệu quá khứ (`lag_1, lag_7, lag_14, lag_28, roll_mean_7, roll_mean_28, roll_std_7, dow, month, is_weekend, level_28`). Không huấn luyện lại trong lúc test.

## 2. Kết quả đánh giá

### 2.1. Rolling 1 bước trên 60 ngày test (`2026-09-24` → `2026-11-22`)

Tại mỗi ngày test `i`, cả 3 phương pháp chỉ nhìn lịch sử thực tế `values[:i]`.

| Phương pháp | Mean MAE | Mean RMSE | Pooled RMSE | So với `moving_average_7` (Mean MAE) |
|---|---:|---:|---:|---:|
| `moving_average_7` | 6.6514 | 9.1745 | 10.1568 | — (baseline) |
| `seasonal_naive_7` | 7.4800 | 10.8644 | 12.1455 | +12.46% |
| `random_forest` (`rf-v1`) | **5.3823** | **8.0579** | **8.9618** | **-19.08%** |

- **Kết luận (1 bước)**: `random_forest` vượt trội cả `moving_average_7` và `seasonal_naive_7` trên cả 3 chỉ số tổng hợp (giảm 19.08% Mean MAE, 12.17% Mean RMSE, 11.77% Pooled RMSE so với MA7) và đạt MAE thấp hơn MA7 ở **20/20 sản phẩm**. Nguyên nhân chính là mô hình học được chu kỳ theo thứ trong tuần (`dow`, `is_weekend`) kết hợp mức nền sản phẩm (`level_28`, `roll_mean_28`), trong khi MA7 san phẳng biến động cuối tuần.

### 2.2. Dự báo đệ quy 14 ngày không dùng thực tế (`cutoff 2026-09-23`, dự báo `2026-09-24` → `2026-10-07`)

Huấn luyện mô hình tới đúng ngày cắt `2026-09-23`, sau đó dự báo liên tục 14 ngày (20 sản phẩm × 14 ngày = 280 điểm) hoàn toàn không đưa giá trị thực tế của kỳ test vào lại. Đây là kịch bản sát nhất với vận hành thực tế của `POST /forecast`.

| Phương pháp | Mean MAE | Mean RMSE | Pooled RMSE | So với `moving_average_7` (Mean MAE) |
|---|---:|---:|---:|---:|
| `moving_average_7` | 6.8255 | 9.4249 | 10.6028 | — (baseline) |
| `seasonal_naive_7` | 7.4143 | 10.3526 | 11.7470 | +8.63% |
| `random_forest` (`rf-v1`) | **6.0127** | **8.5595** | **9.9479** | **-11.91%** |

- **Kết luận (đệ quy 14 ngày)**: `random_forest` vẫn tốt hơn `moving_average_7` trên tổng thể (giảm 11.91% Mean MAE, 9.18% Mean RMSE, 6.18% Pooled RMSE), thắng ở **16/20 sản phẩm**; tuy nhiên MA7 có MAE thấp hơn ở 4 sản phẩm (`SP001`, `SP002`, `SP006`, `SP009`). So với đánh giá 1 bước, Mean MAE của `random_forest` tăng từ `5.3823` lên `6.0127` (+11.71%) do tích lũy sai số qua các bước dự báo đệ quy.

## 3. Cách tái lập kết quả

Chạy từ thư mục `QuanLyKhoAI/` (hoặc worktree tương ứng):

```bash
docker compose -p kho-ai-ml run --rm ml python -m training.train
docker compose -p kho-ai-ml run --rm ml python -m training.evaluate
docker compose -p kho-ai-ml run --rm ml pytest -q
```

File báo cáo chi tiết từng sản phẩm: `reports/model_metrics.json`. File mô hình `models/rf_v1.joblib` và `models/rf_v1.json` không commit vào git và sẽ tự được huấn luyện khi khởi động dịch vụ nếu chưa tồn tại.

## 4. Giới hạn

- Kết quả đo trên dữ liệu mô phỏng có quy luật mùa vụ tuần/năm rõ ràng; mức giảm MAE trên dữ liệu thực tế có thể khác (nhỏ hơn hoặc thậm chí không thắng baseline nếu dữ liệu nhiễu cao, thiếu lịch sử hoặc có khuyến mãi không báo trước).
- Đánh giá đệ quy 14 ngày hiện đo tại 1 điểm cắt (`2026-09-23`, ngoài mùa Tết và mùa hè); giai đoạn biến động mạnh như cận Tết có thể cho sai số lớn hơn.
- Chưa tối ưu siêu tham số sâu và chưa đưa vào các biến ngoại sinh (lịch khuyến mãi, ngày lễ âm lịch). Khi tích hợp dữ liệu kho thật cần đánh giá lại theo quy trình tương tự.
