"""Đánh giá các phương pháp dự báo (baseline MA7/SN7 và Random Forest) theo thời gian.

Chạy từ thư mục `ml/`:
    python -m training.evaluate
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections.abc import Callable, Sequence
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from app.services.baseline import moving_average, normalize_history, seasonal_naive
from app.services.features import MIN_HISTORY_DAYS, build_feature_row
from app.services.model import (
    METADATA_FILENAME,
    MODEL_FILENAME,
    MODEL_VERSION,
    forecast_model,
    load_model_artifacts,
    save_model_artifacts,
    train_rf_model,
)


def compute_metrics(
    actual: Sequence[float],
    predicted: Sequence[float],
) -> dict[str, float]:
    if len(actual) != len(predicted) or not actual:
        raise ValueError("actual và predicted phải cùng độ dài và không rỗng.")

    n = len(actual)
    abs_errors = [abs(a - p) for a, p in zip(actual, predicted)]
    sq_errors = [(a - p) ** 2 for a, p in zip(actual, predicted)]
    mae = sum(abs_errors) / n
    rmse = math.sqrt(sum(sq_errors) / n)
    return {"mae": round(mae, 4), "rmse": round(rmse, 4)}


def rolling_forecast_1step(
    values: Sequence[float],
    test_days: int,
    predictor: Callable[[Sequence[float]], float],
) -> tuple[list[float], list[float]]:
    """Đánh giá rolling 1 bước: tại ngày test i, chỉ dùng lịch sử values[:i]."""
    if test_days < 1 or len(values) <= test_days:
        raise ValueError("Chuỗi lịch sử quá ngắn so với số ngày test.")

    split = len(values) - test_days
    actuals: list[float] = []
    preds: list[float] = []

    for idx in range(split, len(values)):
        past = list(values[:idx])
        preds.append(float(predictor(past)))
        actuals.append(float(values[idx]))

    return actuals, preds


def rolling_forecast_rf_1step(
    dates: Sequence[date],
    values: Sequence[float],
    test_days: int,
    model: RandomForestRegressor,
) -> tuple[list[float], list[float]]:
    """Đánh giá rolling 1 bước cho Random Forest: ngày i chỉ dùng values[:i], không huấn luyện lại."""
    if len(dates) != len(values):
        raise ValueError("dates và values phải cùng độ dài.")
    if test_days < 1 or len(values) - test_days < MIN_HISTORY_DAYS:
        raise ValueError("Chuỗi lịch sử quá ngắn so với ngưỡng đặc trưng và số ngày test.")

    split = len(values) - test_days
    feature_rows = [
        build_feature_row(dates[idx], values[:idx]) for idx in range(split, len(values))
    ]
    x_test = np.asarray(feature_rows, dtype=np.float64)
    raw_preds = model.predict(x_test)

    actuals = [float(values[idx]) for idx in range(split, len(values))]
    preds = [max(0.0, float(p)) for p in raw_preds]
    return actuals, preds


def _load_normalized_series(
    sales_path: Path,
) -> tuple[list[str], dict[str, tuple[list[date], list[float]]]]:
    df = pd.read_csv(sales_path)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    product_codes = sorted(df["product_code"].unique())

    series_by_product: dict[str, tuple[list[date], list[float]]] = {}
    for code in product_codes:
        sub = df[df["product_code"] == code]
        pairs = list(zip(sub["date"].tolist(), sub["qty"].astype(float).tolist()))
        series_by_product[code] = normalize_history(pairs)

    return product_codes, series_by_product


def _aggregate_method_metrics(
    per_product: dict[str, dict[str, float]],
    all_actuals: Sequence[float],
    all_preds: Sequence[float],
) -> dict[str, Any]:
    mean_mae = sum(m["mae"] for m in per_product.values()) / len(per_product)
    mean_rmse = sum(m["rmse"] for m in per_product.values()) / len(per_product)
    pooled = compute_metrics(all_actuals, all_preds)
    return {
        "overall": {
            "mean_mae": round(mean_mae, 4),
            "mean_rmse": round(mean_rmse, 4),
            "pooled_rmse": pooled["rmse"],
        },
        "per_product": per_product,
    }


def evaluate_dataset(
    sales_path: Path = Path("data/synthetic_sales.csv"),
    test_days: int = 60,
    output_path: Path | None = Path("reports/baseline_metrics.json"),
) -> dict[str, Any]:
    """Đánh giá riêng 2 phương pháp baseline (giữ tương thích ngược T-003)."""
    product_codes, series_by_product = _load_normalized_series(sales_path)

    first_dates = series_by_product[product_codes[0]][0]
    split = len(first_dates) - test_days

    methods: dict[str, Callable[[Sequence[float]], float]] = {
        "moving_average_7": lambda past: moving_average(past, window=7, horizon=1)[0],
        "seasonal_naive_7": lambda past: seasonal_naive(past, season=7, horizon=1)[0],
    }

    report: dict[str, Any] = {
        "dataset": str(sales_path),
        "test_days": test_days,
        "test_start": first_dates[split].isoformat(),
        "test_end": first_dates[-1].isoformat(),
        "methods": {},
    }

    for method_name, predictor in methods.items():
        per_product: dict[str, dict[str, float]] = {}
        all_actuals: list[float] = []
        all_preds: list[float] = []

        for code in product_codes:
            _, values = series_by_product[code]
            actuals, preds = rolling_forecast_1step(
                values, test_days=test_days, predictor=predictor
            )
            per_product[code] = compute_metrics(actuals, preds)
            all_actuals.extend(actuals)
            all_preds.extend(preds)

        report["methods"][method_name] = _aggregate_method_metrics(
            per_product, all_actuals, all_preds
        )

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return report


def evaluate_recursive_14d(
    product_codes: Sequence[str],
    series_by_product: dict[str, tuple[list[date], list[float]]],
    model: RandomForestRegressor,
    test_days: int = 60,
    horizon_days: int = 14,
) -> dict[str, Any]:
    """Đánh giá đệ quy `horizon_days` ngày tại điểm cắt cuối tập train (không dùng thực tế trong suốt kỳ dự báo)."""
    if horizon_days > test_days:
        raise ValueError("horizon_days không được lớn hơn test_days.")

    first_dates = series_by_product[product_codes[0]][0]
    split = len(first_dates) - test_days
    cutoff_date = first_dates[split - 1]
    forecast_start = first_dates[split]
    forecast_end = first_dates[split + horizon_days - 1]

    rec_methods: dict[str, Any] = {}

    for method_name in ("moving_average_7", "seasonal_naive_7", "random_forest"):
        per_product: dict[str, dict[str, float]] = {}
        all_actuals: list[float] = []
        all_preds: list[float] = []

        for code in product_codes:
            dates, values = series_by_product[code]
            prod_split = len(values) - test_days
            past_dates = dates[:prod_split]
            past_values = values[:prod_split]
            actuals = [float(v) for v in values[prod_split : prod_split + horizon_days]]

            if method_name == "moving_average_7":
                preds = moving_average(past_values, window=7, horizon=horizon_days)
            elif method_name == "seasonal_naive_7":
                preds = seasonal_naive(past_values, season=7, horizon=horizon_days)
            else:
                history_pairs = list(zip(past_dates, past_values))
                preds = [qty for _, qty in forecast_model(model, history_pairs, horizon_days)]

            per_product[code] = compute_metrics(actuals, preds)
            all_actuals.extend(actuals)
            all_preds.extend(preds)

        rec_methods[method_name] = _aggregate_method_metrics(
            per_product, all_actuals, all_preds
        )

    return {
        "cutoff_date": cutoff_date.isoformat(),
        "forecast_start": forecast_start.isoformat(),
        "forecast_end": forecast_end.isoformat(),
        "horizon_days": horizon_days,
        "methods": rec_methods,
    }


def evaluate_all(
    sales_path: Path = Path("data/synthetic_sales.csv"),
    model_dir: Path | None = None,
    test_days: int = 60,
    horizon_days: int = 14,
    output_path: Path | None = Path("reports/model_metrics.json"),
    train_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Đánh giá đầy đủ cả 3 phương pháp (MA7, SN7, Random Forest) và đệ quy 14 ngày."""
    target_dir = (
        model_dir
        if model_dir is not None
        else Path(os.getenv("MODEL_DIR", "models"))
    )

    if (target_dir / MODEL_FILENAME).exists() and (target_dir / METADATA_FILENAME).exists():
        model, metadata = load_model_artifacts(target_dir)
    else:
        model, metadata = train_rf_model(
            sales_path=sales_path,
            test_days=test_days,
            params=train_params,
        )
        save_model_artifacts(model, metadata, target_dir)

    product_codes, series_by_product = _load_normalized_series(sales_path)
    first_dates = series_by_product[product_codes[0]][0]
    split = len(first_dates) - test_days

    report: dict[str, Any] = {
        "dataset": str(sales_path),
        "model_version": str(metadata.get("model_version", MODEL_VERSION)),
        "test_days": test_days,
        "test_start": first_dates[split].isoformat(),
        "test_end": first_dates[-1].isoformat(),
        "methods": {},
    }

    baseline_predictors: dict[str, Callable[[Sequence[float]], float]] = {
        "moving_average_7": lambda past: moving_average(past, window=7, horizon=1)[0],
        "seasonal_naive_7": lambda past: seasonal_naive(past, season=7, horizon=1)[0],
    }

    for method_name, predictor in baseline_predictors.items():
        per_product: dict[str, dict[str, float]] = {}
        all_actuals: list[float] = []
        all_preds: list[float] = []

        for code in product_codes:
            _, values = series_by_product[code]
            actuals, preds = rolling_forecast_1step(
                values, test_days=test_days, predictor=predictor
            )
            per_product[code] = compute_metrics(actuals, preds)
            all_actuals.extend(actuals)
            all_preds.extend(preds)

        report["methods"][method_name] = _aggregate_method_metrics(
            per_product, all_actuals, all_preds
        )

    # Đánh giá Random Forest rolling 1 bước (không huấn luyện lại trong lúc test)
    rf_per_product: dict[str, dict[str, float]] = {}
    rf_all_actuals: list[float] = []
    rf_all_preds: list[float] = []
    for code in product_codes:
        dates, values = series_by_product[code]
        actuals, preds = rolling_forecast_rf_1step(
            dates, values, test_days=test_days, model=model
        )
        rf_per_product[code] = compute_metrics(actuals, preds)
        rf_all_actuals.extend(actuals)
        rf_all_preds.extend(preds)

    report["methods"]["random_forest"] = _aggregate_method_metrics(
        rf_per_product, rf_all_actuals, rf_all_preds
    )

    # Đánh giá đệ quy 14 ngày
    report["recursive_14d"] = evaluate_recursive_14d(
        product_codes=product_codes,
        series_by_product=series_by_product,
        model=model,
        test_days=test_days,
        horizon_days=horizon_days,
    )

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return report


def print_summary(report: dict[str, Any]) -> None:
    date_span = ""
    if "test_start" in report and "test_end" in report:
        date_span = f" [{report['test_start']} -> {report['test_end']}]"

    print(
        f"Đánh giá rolling 1 bước trên {report['test_days']} ngày cuối"
        f"{date_span} ({report['dataset']}):"
    )
    print(f"{'Phương pháp':<22} {'Mean MAE':>10} {'Mean RMSE':>11} {'Pooled RMSE':>13}")
    print("-" * 60)
    for method_name, block in report["methods"].items():
        overall = block["overall"]
        print(
            f"{method_name:<22} {overall['mean_mae']:>10.4f} "
            f"{overall['mean_rmse']:>11.4f} {overall['pooled_rmse']:>13.4f}"
        )

    if "recursive_14d" in report:
        rec = report["recursive_14d"]
        print()
        print(
            f"Đánh giá đệ quy {rec['horizon_days']} ngày "
            f"(cutoff {rec['cutoff_date']}, dự báo {rec['forecast_start']} -> {rec['forecast_end']}):"
        )
        print(f"{'Phương pháp':<22} {'Mean MAE':>10} {'Mean RMSE':>11} {'Pooled RMSE':>13}")
        print("-" * 60)
        for method_name, block in rec["methods"].items():
            overall = block["overall"]
            print(
                f"{method_name:<22} {overall['mean_mae']:>10.4f} "
                f"{overall['mean_rmse']:>11.4f} {overall['pooled_rmse']:>13.4f}"
            )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Đánh giá baseline và Random Forest trên dữ liệu xuất kho."
    )
    parser.add_argument(
        "--sales",
        type=Path,
        default=Path("data/synthetic_sales.csv"),
        help="Đường dẫn file CSV dữ liệu xuất kho.",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=None,
        help="Thư mục chứa rf_v1.joblib và rf_v1.json.",
    )
    parser.add_argument(
        "--test-days",
        type=int,
        default=60,
        help="Số ngày cuối dùng làm tập test.",
    )
    parser.add_argument(
        "--horizon-days",
        type=int,
        default=14,
        help="Số ngày cho đánh giá đệ quy.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Đường dẫn file JSON báo cáo đầu ra (mặc định reports/model_metrics.json).",
    )
    parser.add_argument(
        "--baseline-only",
        action="store_true",
        help="Chỉ chạy đánh giá 2 baseline (xuất reports/baseline_metrics.json).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    if args.baseline_only:
        out = args.out or Path("reports/baseline_metrics.json")
        report = evaluate_dataset(
            sales_path=args.sales,
            test_days=args.test_days,
            output_path=out,
        )
    else:
        out = args.out or Path("reports/model_metrics.json")
        report = evaluate_all(
            sales_path=args.sales,
            model_dir=args.model_dir,
            test_days=args.test_days,
            horizon_days=args.horizon_days,
            output_path=out,
        )
    print_summary(report)


if __name__ == "__main__":
    main()
