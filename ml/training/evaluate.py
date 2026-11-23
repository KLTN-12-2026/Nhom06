"""Đánh giá các phương pháp dự báo baseline theo thời gian (rolling 60 ngày cuối).

Chạy từ thư mục `ml/`:
    python -m training.evaluate
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Callable, Sequence
from datetime import date
from pathlib import Path

import pandas as pd

from app.services.baseline import moving_average, normalize_history, seasonal_naive


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


def evaluate_dataset(
    sales_path: Path = Path("data/synthetic_sales.csv"),
    test_days: int = 60,
    output_path: Path | None = Path("reports/baseline_metrics.json"),
) -> dict:
    df = pd.read_csv(sales_path)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    methods: dict[str, Callable[[Sequence[float]], float]] = {
        "moving_average_7": lambda past: moving_average(past, window=7, horizon=1)[0],
        "seasonal_naive_7": lambda past: seasonal_naive(past, season=7, horizon=1)[0],
    }

    report: dict = {
        "dataset": str(sales_path),
        "test_days": test_days,
        "methods": {},
    }

    product_codes = sorted(df["product_code"].unique())
    series_by_product: dict[str, list[float]] = {}
    for code in product_codes:
        sub = df[df["product_code"] == code]
        pairs = list(zip(sub["date"].tolist(), sub["qty"].astype(float).tolist()))
        _, values = normalize_history(pairs)
        series_by_product[code] = values

    for method_name, predictor in methods.items():
        per_product: dict[str, dict[str, float]] = {}
        all_actuals: list[float] = []
        all_preds: list[float] = []

        for code in product_codes:
            actuals, preds = rolling_forecast_1step(
                series_by_product[code], test_days=test_days, predictor=predictor
            )
            per_product[code] = compute_metrics(actuals, preds)
            all_actuals.extend(actuals)
            all_preds.extend(preds)

        mean_mae = sum(m["mae"] for m in per_product.values()) / len(per_product)
        mean_rmse = sum(m["rmse"] for m in per_product.values()) / len(per_product)
        pooled = compute_metrics(all_actuals, all_preds)

        report["methods"][method_name] = {
            "overall": {
                "mean_mae": round(mean_mae, 4),
                "mean_rmse": round(mean_rmse, 4),
                "pooled_rmse": pooled["rmse"],
            },
            "per_product": per_product,
        }

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return report


def print_summary(report: dict) -> None:
    print(f"Đánh giá baseline trên {report['test_days']} ngày cuối ({report['dataset']}):")
    print(f"{'Phương pháp':<22} {'Mean MAE':>10} {'Mean RMSE':>11} {'Pooled RMSE':>13}")
    print("-" * 60)
    for method_name, block in report["methods"].items():
        overall = block["overall"]
        print(
            f"{method_name:<22} {overall['mean_mae']:>10.4f} "
            f"{overall['mean_rmse']:>11.4f} {overall['pooled_rmse']:>13.4f}"
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Đánh giá baseline trên dữ liệu xuất kho.")
    parser.add_argument(
        "--sales",
        type=Path,
        default=Path("data/synthetic_sales.csv"),
        help="Đường dẫn file CSV dữ liệu xuất kho.",
    )
    parser.add_argument(
        "--test-days",
        type=int,
        default=60,
        help="Số ngày cuối dùng làm tập test.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("reports/baseline_metrics.json"),
        help="Đường dẫn file JSON báo cáo đầu ra.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    report = evaluate_dataset(
        sales_path=args.sales,
        test_days=args.test_days,
        output_path=args.out,
    )
    print_summary(report)


if __name__ == "__main__":
    main()
