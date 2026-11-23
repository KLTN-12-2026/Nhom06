"""Hàm thuần dựng đặc trưng chuỗi thời gian cho mô hình dự báo nhu cầu.

Mọi đặc trưng cho ngày mục tiêu `t` CHỈ sử dụng dữ liệu trước `t` (không rò rỉ tương lai).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import date

import numpy as np

MIN_HISTORY_DAYS = 28

FEATURE_NAMES: tuple[str, ...] = (
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",
    "roll_mean_7",
    "roll_mean_28",
    "roll_std_7",
    "dow",
    "month",
    "is_weekend",
    "level_28",
)


def build_feature_row(
    target_date: date,
    past_values: Sequence[float],
    level_28: float | None = None,
) -> list[float]:
    """Dựng 1 vector đặc trưng cho `target_date` từ chuỗi giá trị quá khứ `past_values` (< t)."""
    if len(past_values) < MIN_HISTORY_DAYS:
        raise ValueError(
            f"Không đủ dữ liệu lịch sử (cần ≥ {MIN_HISTORY_DAYS} ngày, hiện có {len(past_values)})."
        )

    lag_1 = float(past_values[-1])
    lag_7 = float(past_values[-7])
    lag_14 = float(past_values[-14])
    lag_28 = float(past_values[-28])

    last_7 = [float(v) for v in past_values[-7:]]
    last_28 = [float(v) for v in past_values[-28:]]

    roll_mean_7 = sum(last_7) / 7.0
    roll_mean_28 = sum(last_28) / 28.0
    roll_var_7 = sum((v - roll_mean_7) ** 2 for v in last_7) / 7.0
    roll_std_7 = math.sqrt(roll_var_7)

    dow = float(target_date.weekday())
    month = float(target_date.month)
    is_weekend = 1.0 if target_date.weekday() >= 5 else 0.0
    level_val = roll_mean_28 if level_28 is None else float(level_28)

    return [
        lag_1,
        lag_7,
        lag_14,
        lag_28,
        roll_mean_7,
        roll_mean_28,
        roll_std_7,
        dow,
        month,
        is_weekend,
        level_val,
    ]


def build_supervised_dataset(
    dates: Sequence[date],
    values: Sequence[float],
) -> tuple[np.ndarray, np.ndarray, list[date]]:
    """Tạo tập (X, y, target_dates) cho một sản phẩm; dòng tại `idx` chỉ dùng `values[:idx]`."""
    if len(dates) != len(values):
        raise ValueError("dates và values phải cùng độ dài.")
    if len(values) <= MIN_HISTORY_DAYS:
        raise ValueError(
            f"Chuỗi cần nhiều hơn {MIN_HISTORY_DAYS} ngày để tạo mẫu huấn luyện."
        )

    rows: list[list[float]] = []
    targets: list[float] = []
    target_dates: list[date] = []

    for idx in range(MIN_HISTORY_DAYS, len(values)):
        rows.append(build_feature_row(dates[idx], values[:idx]))
        targets.append(float(values[idx]))
        target_dates.append(dates[idx])

    return (
        np.asarray(rows, dtype=np.float64),
        np.asarray(targets, dtype=np.float64),
        target_dates,
    )
