import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from app.services.baseline import moving_average, seasonal_naive
from training.evaluate import evaluate_dataset, rolling_forecast_1step


def _write_small_sales_csv(path: Path, n_days: int = 90) -> None:
    start = date(2026, 1, 1)
    rows = []
    for i in range(n_days):
        d = (start + timedelta(days=i)).isoformat()
        rows.append({"date": d, "product_code": "SP001", "qty": 10 + (i % 7)})
        rows.append({"date": d, "product_code": "SP002", "qty": 20 + (i % 5)})
    pd.DataFrame(rows).to_csv(path, index=False, lineterminator="\n")


def test_evaluate_generates_metrics_json(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    out_json = tmp_path / "reports" / "baseline_metrics.json"
    _write_small_sales_csv(sales_csv, n_days=90)

    report = evaluate_dataset(sales_csv, test_days=60, output_path=out_json)

    assert out_json.exists()
    loaded = json.loads(out_json.read_text(encoding="utf-8"))
    assert loaded == report
    assert loaded["test_days"] == 60

    for method_name in ("moving_average_7", "seasonal_naive_7"):
        method_block = loaded["methods"][method_name]
        assert method_block["overall"]["mean_mae"] >= 0
        assert method_block["overall"]["mean_rmse"] >= 0
        assert method_block["overall"]["pooled_rmse"] >= 0
        assert set(method_block["per_product"].keys()) == {"SP001", "SP002"}
        for prod_metrics in method_block["per_product"].values():
            assert prod_metrics["mae"] >= 0
            assert prod_metrics["rmse"] >= 0


def test_rolling_evaluate_has_no_future_leakage() -> None:
    series = [float(10 + (i % 7)) for i in range(100)]
    test_days = 60
    split = len(series) - test_days

    for name, predictor in (
        ("ma7", lambda past: moving_average(past, window=7, horizon=1)[0]),
        ("sn7", lambda past: seasonal_naive(past, season=7, horizon=1)[0]),
    ):
        _, preds_clean = rolling_forecast_1step(series, test_days, predictor)

        # Thay đổi mạnh giá trị tại ngày test thứ k = 15 (tức index = split + 15)
        k = 15
        mutated = list(series)
        mutated[split + k] = 10_000.0
        _, preds_mutated = rolling_forecast_1step(mutated, test_days, predictor)

        # Mọi dự báo từ ngày 0..k (bao gồm chính ngày k) không được phép thay đổi
        assert preds_clean[: k + 1] == preds_mutated[: k + 1], (
            f"Rò rỉ tương lai ở {name}"
        )
