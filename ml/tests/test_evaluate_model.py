import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from app.services.model import save_model_artifacts, train_rf_model
from training.evaluate import evaluate_all, rolling_forecast_rf_1step


def _write_small_sales_csv(path: Path, n_days: int = 120, start: date = date(2026, 1, 1)) -> None:
    rows = []
    for i in range(n_days):
        d = (start + timedelta(days=i)).isoformat()
        rows.append({"date": d, "product_code": "SP001", "qty": 12 + (i % 7)})
        rows.append({"date": d, "product_code": "SP002", "qty": 25 + (i % 5)})
    pd.DataFrame(rows).to_csv(path, index=False, lineterminator="\n")


def test_evaluate_all_outputs_three_methods_and_recursive_14d(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    model_dir = tmp_path / "models"
    out_json = tmp_path / "reports" / "model_metrics.json"
    start = date(2026, 1, 1)
    n_days = 120
    test_days = 60
    _write_small_sales_csv(sales_csv, n_days=n_days, start=start)

    small_params = {
        "n_estimators": 15,
        "max_depth": 8,
        "min_samples_leaf": 2,
        "random_state": 42,
        "n_jobs": -1,
    }
    model, meta = train_rf_model(sales_path=sales_csv, test_days=test_days, params=small_params)
    save_model_artifacts(model, meta, model_dir)

    report = evaluate_all(
        sales_path=sales_csv,
        model_dir=model_dir,
        test_days=test_days,
        horizon_days=14,
        output_path=out_json,
    )

    assert out_json.exists()
    loaded = json.loads(out_json.read_text(encoding="utf-8"))
    assert loaded == report
    assert loaded["model_version"] == "rf-v1"
    assert loaded["test_days"] == 60
    assert loaded["test_start"] == (start + timedelta(days=n_days - test_days)).isoformat()
    assert loaded["test_end"] == (start + timedelta(days=n_days - 1)).isoformat()

    for method_name in ("moving_average_7", "seasonal_naive_7", "random_forest"):
        block = loaded["methods"][method_name]
        assert block["overall"]["mean_mae"] >= 0
        assert block["overall"]["mean_rmse"] >= 0
        assert block["overall"]["pooled_rmse"] >= 0
        assert set(block["per_product"].keys()) == {"SP001", "SP002"}

    rec = loaded["recursive_14d"]
    assert rec["horizon_days"] == 14
    assert rec["cutoff_date"] == (start + timedelta(days=n_days - test_days - 1)).isoformat()
    assert rec["forecast_start"] == loaded["test_start"]
    for method_name in ("moving_average_7", "random_forest"):
        assert rec["methods"][method_name]["overall"]["mean_mae"] >= 0
        assert rec["methods"][method_name]["overall"]["mean_rmse"] >= 0


def test_rolling_rf_1step_has_no_future_leakage(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    start = date(2026, 1, 1)
    n_days = 120
    test_days = 60
    _write_small_sales_csv(sales_csv, n_days=n_days, start=start)

    model, _ = train_rf_model(
        sales_path=sales_csv,
        test_days=test_days,
        params={"n_estimators": 15, "min_samples_leaf": 2, "random_state": 42, "n_jobs": -1},
    )

    dates = [start + timedelta(days=i) for i in range(n_days)]
    values = [float(12 + (i % 7)) for i in range(n_days)]
    split = n_days - test_days

    _, preds_clean = rolling_forecast_rf_1step(dates, values, test_days, model)

    k = 15
    mutated = list(values)
    mutated[split + k] = 10_000.0
    _, preds_mutated = rolling_forecast_rf_1step(dates, mutated, test_days, model)

    assert preds_clean[: k + 1] == preds_mutated[: k + 1]


def test_committed_model_metrics_matches_baseline_report() -> None:
    ml_root = Path(__file__).resolve().parents[1]
    baseline_path = ml_root / "reports" / "baseline_metrics.json"
    model_metrics_path = ml_root / "reports" / "model_metrics.json"

    assert model_metrics_path.exists()
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    model_report = json.loads(model_metrics_path.read_text(encoding="utf-8"))

    assert model_report["test_days"] == baseline["test_days"] == 60
    assert model_report["test_start"] == "2026-09-24"
    assert model_report["test_end"] == "2026-11-22"
    assert model_report["model_version"] == "rf-v1"
    assert set(model_report["methods"].keys()) == {
        "moving_average_7",
        "seasonal_naive_7",
        "random_forest",
    }
    assert (
        model_report["methods"]["moving_average_7"]["overall"]
        == baseline["methods"]["moving_average_7"]["overall"]
    )
    assert (
        model_report["methods"]["seasonal_naive_7"]["overall"]
        == baseline["methods"]["seasonal_naive_7"]["overall"]
    )
    assert model_report["recursive_14d"]["horizon_days"] == 14

