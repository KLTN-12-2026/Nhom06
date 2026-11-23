"""Sinh dữ liệu xuất kho mô phỏng theo ngày cho 20 sản phẩm KHO-AI.

Chạy từ thư mục `ml/`:
    python -m training.generate_data --seed 42 --out data/synthetic_sales.csv
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

START_DATE = date(2024, 12, 1)
END_DATE = date(2026, 11, 22)

# Mùng 1 Tết âm lịch cố định cho giai đoạn 2024-12-01 -> 2026-11-22
TET_DATES = (date(2025, 1, 29), date(2026, 2, 17))

# Hệ số mùa vụ tuần theo thứ (0=Thứ 2 .. 6=Chủ nhật)
WEEKLY_FACTORS = (0.92, 0.90, 0.94, 0.96, 1.08, 1.32, 1.28)

PRODUCTS: tuple[dict[str, object], ...] = (
    # Nhóm sữa
    {"product_code": "SP001", "name": "Sữa tươi tiệt trùng 1L", "group": "sua", "unit": "thung", "shelf_life_days": 180, "base": 32.0, "slope": 0.10},
    {"product_code": "SP002", "name": "Sữa tươi ít đường 180ml lốc 4", "group": "sua", "unit": "thung", "shelf_life_days": 180, "base": 28.0, "slope": 0.08},
    {"product_code": "SP003", "name": "Sữa đặc có đường lon 380g", "group": "sua", "unit": "thung", "shelf_life_days": 365, "base": 18.0, "slope": -0.04},
    {"product_code": "SP004", "name": "Sữa hạt nguyên chất 1L", "group": "sua", "unit": "thung", "shelf_life_days": 180, "base": 14.0, "slope": 0.16},
    {"product_code": "SP005", "name": "Sữa tiệt trùng sô-cô-la lốc 4", "group": "sua", "unit": "thung", "shelf_life_days": 180, "base": 22.0, "slope": 0.05},
    # Nhóm sữa chua
    {"product_code": "SP006", "name": "Sữa chua trắng có đường lốc 4", "group": "sua_chua", "unit": "thung", "shelf_life_days": 45, "base": 26.0, "slope": 0.06},
    {"product_code": "SP007", "name": "Sữa chua không đường lốc 4", "group": "sua_chua", "unit": "thung", "shelf_life_days": 45, "base": 16.0, "slope": 0.14},
    {"product_code": "SP008", "name": "Sữa chua trái cây lốc 4", "group": "sua_chua", "unit": "thung", "shelf_life_days": 45, "base": 19.0, "slope": 0.04},
    {"product_code": "SP009", "name": "Sữa chua uống hương cam lốc 4", "group": "sua_chua", "unit": "thung", "shelf_life_days": 60, "base": 24.0, "slope": -0.03},
    {"product_code": "SP010", "name": "Sữa chua uống hương dâu lốc 4", "group": "sua_chua", "unit": "thung", "shelf_life_days": 60, "base": 20.0, "slope": 0.07},
    # Nhóm nước giải khát
    {"product_code": "SP011", "name": "Nước lọc đóng chai thùng 24", "group": "nuoc_giai_khat", "unit": "thung", "shelf_life_days": 365, "base": 44.0, "slope": 0.12},
    {"product_code": "SP012", "name": "Trà xanh đóng chai thùng 24", "group": "nuoc_giai_khat", "unit": "thung", "shelf_life_days": 365, "base": 36.0, "slope": 0.09},
    {"product_code": "SP013", "name": "Nước ngọt có ga thùng 24", "group": "nuoc_giai_khat", "unit": "thung", "shelf_life_days": 365, "base": 38.0, "slope": 0.05},
    {"product_code": "SP014", "name": "Nước tăng lực thùng 24", "group": "nuoc_giai_khat", "unit": "thung", "shelf_life_days": 365, "base": 25.0, "slope": 0.15},
    {"product_code": "SP015", "name": "Nước ép trái cây hộp 1L", "group": "nuoc_giai_khat", "unit": "thung", "shelf_life_days": 270, "base": 15.0, "slope": -0.06},
    # Nhóm bánh kẹo
    {"product_code": "SP016", "name": "Bánh quy bơ hộp thiếc", "group": "banh_keo", "unit": "thung", "shelf_life_days": 365, "base": 12.0, "slope": 0.04},
    {"product_code": "SP017", "name": "Bánh bông lan đóng gói thùng", "group": "banh_keo", "unit": "thung", "shelf_life_days": 180, "base": 21.0, "slope": 0.08},
    {"product_code": "SP018", "name": "Kẹo mềm trái cây gói", "group": "banh_keo", "unit": "thung", "shelf_life_days": 365, "base": 17.0, "slope": -0.08},
    {"product_code": "SP019", "name": "Snack khoai tây thùng", "group": "banh_keo", "unit": "thung", "shelf_life_days": 180, "base": 29.0, "slope": 0.11},
    {"product_code": "SP020", "name": "Bánh gạo giòn gói", "group": "banh_keo", "unit": "thung", "shelf_life_days": 270, "base": 13.0, "slope": -0.05},
)


def _yearly_factor(current_date: date, group: str) -> float:
    factor = 1.0

    # Cao điểm cận Tết âm lịch (20 ngày trước mùng 1) và thấp điểm 3 ngày nghỉ Tết
    for tet in TET_DATES:
        delta = (tet - current_date).days
        if 1 <= delta <= 20:
            tet_boost = {
                "banh_keo": 1.75,
                "nuoc_giai_khat": 1.60,
                "sua": 1.40,
                "sua_chua": 1.30,
            }[group]
            factor *= tet_boost
        elif -2 <= delta <= 0:
            factor *= 0.35

    # Mùa hè (tháng 5..8): nước giải khát tăng mạnh, sữa chua tăng nhẹ
    if 5 <= current_date.month <= 8:
        if group == "nuoc_giai_khat":
            factor *= 1.35
        elif group == "sua_chua":
            factor *= 1.15

    return factor


def build_products_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "product_code": p["product_code"],
                "name": p["name"],
                "group": p["group"],
                "unit": p["unit"],
                "shelf_life_days": p["shelf_life_days"],
            }
            for p in PRODUCTS
        ]
    )


def generate_sales(
    seed: int = 42,
    start_date: date = START_DATE,
    end_date: date = END_DATE,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Sinh dữ liệu xuất kho mô phỏng (số lượng đã xuất) theo ngày cho 20 sản phẩm."""
    rng = np.random.default_rng(seed)
    total_days = (end_date - start_date).days + 1
    dates = [start_date + timedelta(days=i) for i in range(total_days)]

    rows: list[dict[str, object]] = []
    for day_idx, current_date in enumerate(dates):
        progress = day_idx / max(1, total_days - 1)
        weekly = WEEKLY_FACTORS[current_date.weekday()]
        date_str = current_date.isoformat()

        for product in PRODUCTS:
            base = float(product["base"])
            slope = float(product["slope"])
            group = str(product["group"])

            trend = 1.0 + slope * progress
            yearly = _yearly_factor(current_date, group)

            # Khuyến mãi ngẫu nhiên (~5% số ngày)
            promo = float(rng.uniform(1.4, 1.8)) if rng.random() < 0.05 else 1.0

            # Ngày không phát sinh đơn xuất (~4%, trừ cao điểm Tết)
            is_pre_tet = any(1 <= (tet - current_date).days <= 20 for tet in TET_DATES)
            if not is_pre_tet and rng.random() < 0.04:
                qty = 0
            else:
                expected = base * trend * weekly * yearly * promo
                noisy = expected + rng.normal(0.0, max(1.0, expected * 0.15))
                qty = max(0, int(round(noisy)))

            rows.append(
                {
                    "date": date_str,
                    "product_code": product["product_code"],
                    "qty": qty,
                }
            )

    sales_df = pd.DataFrame(rows)
    sales_df = sales_df.sort_values(["date", "product_code"], kind="mergesort").reset_index(
        drop=True
    )
    return build_products_df(), sales_df


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sinh dữ liệu xuất kho mô phỏng cho KHO-AI ML."
    )
    parser.add_argument("--seed", type=int, default=42, help="Seed cố định để tái lập.")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/synthetic_sales.csv"),
        help="Đường dẫn file CSV xuất kho đầu ra.",
    )
    parser.add_argument(
        "--products-out",
        type=Path,
        default=None,
        help="Đường dẫn file products.csv (mặc định nằm cùng thư mục với --out).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    out_path: Path = args.out
    products_path: Path = (
        args.products_out
        if args.products_out is not None
        else out_path.parent / "products.csv"
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    products_path.parent.mkdir(parents=True, exist_ok=True)

    products_df, sales_df = generate_sales(seed=args.seed)
    products_df.to_csv(products_path, index=False, lineterminator="\n")
    sales_df.to_csv(out_path, index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
