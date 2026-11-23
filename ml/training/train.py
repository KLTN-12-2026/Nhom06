"""Huấn luyện mô hình RandomForestRegressor chung cho mọi sản phẩm KHO-AI.

Chạy từ thư mục `ml/`:
    python -m training.train
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path
from typing import Any

from app.services.model import (
    DEFAULT_RF_PARAMS,
    save_model_artifacts,
    train_rf_model,
)


def train_and_save(
    sales_path: Path = Path("data/synthetic_sales.csv"),
    model_dir: Path | None = None,
    test_days: int = 60,
    params: dict[str, Any] | None = None,
) -> tuple[Path, Path, dict[str, Any]]:
    target_dir = (
        model_dir
        if model_dir is not None
        else Path(os.getenv("MODEL_DIR", "models"))
    )
    model, metadata = train_rf_model(
        sales_path=sales_path,
        test_days=test_days,
        params=params,
    )
    model_path, metadata_path = save_model_artifacts(model, metadata, target_dir)
    return model_path, metadata_path, metadata


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Huấn luyện mô hình RandomForestRegressor cho KHO-AI ML."
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
        help="Thư mục lưu rf_v1.joblib và rf_v1.json (mặc định MODEL_DIR hoặc models/).",
    )
    parser.add_argument(
        "--test-days",
        type=int,
        default=60,
        help="Số ngày cuối tách làm tập test (không dùng để huấn luyện).",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=DEFAULT_RF_PARAMS["n_estimators"],
        help="Số cây trong rừng ngẫu nhiên.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_RF_PARAMS["random_state"],
        help="Seed cố định để tái lập.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    started = time.perf_counter()
    params = {
        **DEFAULT_RF_PARAMS,
        "n_estimators": args.n_estimators,
        "random_state": args.seed,
    }
    model_path, metadata_path, metadata = train_and_save(
        sales_path=args.sales,
        model_dir=args.model_dir,
        test_days=args.test_days,
        params=params,
    )
    elapsed = time.perf_counter() - started
    print(
        f"Đã huấn luyện {metadata['model_version']} "
        f"({metadata['train_start']} -> {metadata['train_end']}, "
        f"{metadata['n_rows']} dòng) trong {elapsed:.2f}s"
    )
    print(f"  Model   : {model_path}")
    print(f"  Metadata: {metadata_path}")


if __name__ == "__main__":
    main()
