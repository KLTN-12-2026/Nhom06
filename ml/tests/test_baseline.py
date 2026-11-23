from datetime import date

import pytest

from app.services.baseline import (
    forecast_baseline,
    moving_average,
    normalize_history,
    seasonal_naive,
)


def test_moving_average_hand_calculated() -> None:
    history = [10, 12, 14, 16, 18, 20, 22]
    assert moving_average(history, window=7, horizon=3) == [16.0, 16.0, 16.0]

    # Chỉ lấy 3 ngày cuối: (18 + 20 + 22) / 3 = 20.0
    assert moving_average(history, window=3, horizon=2) == [20.0, 20.0]


def test_seasonal_naive_hand_calculated_and_horizon_gt_season() -> None:
    history = [10, 12, 14, 16, 18, 20, 22]
    # horizon = 10 > season = 7 -> lặp lại chu kỳ tuần trước
    expected = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 10.0, 12.0, 14.0]
    assert seasonal_naive(history, season=7, horizon=10) == expected


def test_normalize_history_fills_missing_dates_with_zero_and_sorts() -> None:
    raw = [
        (date(2026, 11, 4), 14.0),
        (date(2026, 11, 1), 7.0),
        # thiếu 2026-11-02 và 2026-11-03
    ]
    dates, values = normalize_history(raw)
    assert dates == [
        date(2026, 11, 1),
        date(2026, 11, 2),
        date(2026, 11, 3),
        date(2026, 11, 4),
    ]
    assert values == [7.0, 0.0, 0.0, 14.0]


def test_forecast_baseline_with_missing_dates_and_non_negative() -> None:
    # 7 ngày từ 01 -> 07 nhưng thiếu ngày 04 (coi là 0)
    raw = [
        (date(2026, 11, 1), 14.0),
        (date(2026, 11, 2), 14.0),
        (date(2026, 11, 3), 14.0),
        (date(2026, 11, 5), 14.0),
        (date(2026, 11, 6), 14.0),
        (date(2026, 11, 7), 14.0),
        (date(2026, 11, 8), 14.0),
    ]
    # 7 ngày cuối là 02..08: [14, 14, 0, 14, 14, 14, 14] -> tổng 84 / 7 = 12.0
    result = forecast_baseline(raw, horizon_days=2, window=7)
    assert result == [
        (date(2026, 11, 9), 12.0),
        (date(2026, 11, 10), 12.0),
    ]
    assert all(qty >= 0 for _, qty in result)


def test_normalize_history_rejects_duplicate_dates() -> None:
    with pytest.raises(ValueError, match="trùng"):
        normalize_history([(date(2026, 11, 1), 5.0), (date(2026, 11, 1), 6.0)])
