from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta

BASELINE_MODEL_VERSION = "baseline-ma7-v1"


def normalize_history(
    history: Sequence[tuple[date, float]],
) -> tuple[list[date], list[float]]:
    """Sắp xếp lịch sử theo ngày tăng dần và điền 0 cho các ngày bị thiếu."""
    if not history:
        raise ValueError("Lịch sử không được rỗng.")

    by_date: dict[date, float] = {}
    for d, qty in history:
        if d in by_date:
            raise ValueError(f"Ngày bị trùng trong lịch sử: {d.isoformat()}")
        if qty < 0:
            raise ValueError(f"Số lượng không được âm tại ngày {d.isoformat()}")
        by_date[d] = float(qty)

    start = min(by_date)
    end = max(by_date)
    total_days = (end - start).days + 1

    dates: list[date] = []
    values: list[float] = []
    for offset in range(total_days):
        current = start + timedelta(days=offset)
        dates.append(current)
        values.append(by_date.get(current, 0.0))

    return dates, values


def moving_average(
    history: Sequence[float],
    window: int = 7,
    horizon: int = 1,
) -> list[float]:
    """Dự báo mỗi ngày tương lai bằng trung bình cộng `window` ngày cuối."""
    if not history:
        raise ValueError("Chuỗi lịch sử không được rỗng.")
    if window < 1:
        raise ValueError("window phải >= 1.")
    if horizon < 1:
        raise ValueError("horizon phải >= 1.")

    tail = history[-window:]
    avg = max(0.0, float(sum(tail)) / len(tail))
    return [avg] * horizon


def seasonal_naive(
    history: Sequence[float],
    season: int = 7,
    horizon: int = 1,
) -> list[float]:
    """Dự báo bằng giá trị cùng vị trí chu kỳ `season` (mặc định cùng thứ tuần trước)."""
    if not history:
        raise ValueError("Chuỗi lịch sử không được rỗng.")
    if season < 1:
        raise ValueError("season phải >= 1.")
    if horizon < 1:
        raise ValueError("horizon phải >= 1.")

    cycle = history[-season:] if len(history) >= season else history
    cycle_len = len(cycle)
    return [max(0.0, float(cycle[step % cycle_len])) for step in range(horizon)]


def forecast_baseline(
    history: Sequence[tuple[date, float]],
    horizon_days: int,
    window: int = 7,
) -> list[tuple[date, float]]:
    """Chuẩn hóa lịch sử và dự báo MA(window) cho `horizon_days` ngày nối tiếp."""
    dates, values = normalize_history(history)
    preds = moving_average(values, window=window, horizon=horizon_days)
    last_date = dates[-1]
    return [
        (last_date + timedelta(days=step + 1), round(max(0.0, qty), 2))
        for step, qty in enumerate(preds)
    ]
