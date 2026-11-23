import math
from datetime import date, timedelta

import numpy as np
import pytest

from app.services.features import (
    FEATURE_NAMES,
    MIN_HISTORY_DAYS,
    build_feature_row,
    build_supervised_dataset,
)


def test_build_feature_row_hand_calculated() -> None:
    # 30 ngày lịch sử: giá trị 1..30, ngày cuối lịch sử là 2026-10-30 (Thứ 6)
    # Ngày mục tiêu t = 2026-10-31 (Thứ 7: dow=5, month=10, is_weekend=1)
    past_values = [float(i) for i in range(1, 31)]
    target_date = date(2026, 10, 31)

    row = build_feature_row(target_date, past_values)
    assert len(row) == len(FEATURE_NAMES)
    by_name = dict(zip(FEATURE_NAMES, row))

    # Giá trị cuối là 30 (t-1), t-7 là 24, t-14 là 17, t-28 là 3
    assert by_name["lag_1"] == 30.0
    assert by_name["lag_7"] == 24.0
    assert by_name["lag_14"] == 17.0
    assert by_name["lag_28"] == 3.0

    # 7 ngày cuối: [24, 25, 26, 27, 28, 29, 30] -> mean = 27.0, var(ddof=0) = 28/7 = 4.0 -> std = 2.0
    assert by_name["roll_mean_7"] == pytest.approx(27.0)
    assert by_name["roll_std_7"] == pytest.approx(2.0)

    # 28 ngày cuối: [3..30] -> mean = (3 + 30) / 2 = 16.5
    assert by_name["roll_mean_28"] == pytest.approx(16.5)
    assert by_name["level_28"] == pytest.approx(16.5)

    # 2026-10-31 là Thứ 7
    assert by_name["dow"] == 5.0
    assert by_name["month"] == 10.0
    assert by_name["is_weekend"] == 1.0

    # Kiểm tra ngày thường (Thứ 2: 2026-11-02) và neo level_28 tùy chỉnh
    weekday_row = dict(
        zip(
            FEATURE_NAMES,
            build_feature_row(date(2026, 11, 2), past_values, level_28=20.0),
        )
    )
    assert weekday_row["dow"] == 0.0
    assert weekday_row["month"] == 11.0
    assert weekday_row["is_weekend"] == 0.0
    assert weekday_row["level_28"] == 20.0


def test_build_supervised_dataset_has_no_future_leakage() -> None:
    start = date(2026, 1, 1)
    n_days = 45
    dates = [start + timedelta(days=i) for i in range(n_days)]
    values = [float(10 + (i % 7) * 2) for i in range(n_days)]

    X_clean, y_clean, target_dates = build_supervised_dataset(dates, values)
    assert X_clean.shape == (n_days - MIN_HISTORY_DAYS, len(FEATURE_NAMES))
    assert len(y_clean) == n_days - MIN_HISTORY_DAYS
    assert target_dates[0] == dates[MIN_HISTORY_DAYS]

    # Đột biến giá trị tại vị trí t_idx và mọi ngày sau t_idx
    t_idx = 35
    row_pos = t_idx - MIN_HISTORY_DAYS
    mutated = list(values)
    mutated[t_idx] = 9999.0
    for j in range(t_idx + 1, n_days):
        mutated[j] = 8888.0

    X_mutated, _, _ = build_supervised_dataset(dates, mutated)

    # Mọi đặc trưng từ dòng 0 đến dòng ứng với t_idx (bao gồm chính ngày t_idx) không được đổi
    np.testing.assert_array_equal(X_clean[: row_pos + 1], X_mutated[: row_pos + 1])


def test_build_feature_row_rejects_short_history() -> None:
    with pytest.raises(ValueError, match="28"):
        build_feature_row(date(2026, 11, 1), [10.0] * (MIN_HISTORY_DAYS - 1))


def test_build_feature_row_roll_std_matches_population_formula() -> None:
    past = [10.0] * 21 + [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0]
    row = dict(zip(FEATURE_NAMES, build_feature_row(date(2026, 5, 6), past)))
    # mean([2,4,4,4,5,5,7]) = 31/7
    tail = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0]
    mean = sum(tail) / 7.0
    expected_std = math.sqrt(sum((v - mean) ** 2 for v in tail) / 7.0)
    assert row["roll_std_7"] == pytest.approx(expected_std)
