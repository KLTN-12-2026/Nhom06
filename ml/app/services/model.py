"""Huấn luyện, lưu/nạp và dự báo đệ quy với mô hình RandomForestRegressor.

Đặt trong `app/services/` để cả API (`app/`) và script huấn luyện/đánh giá (`training/`) dùng chung.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from app.services.baseline import normalize_history
from app.services.features import (
    FEATURE_NAMES,
    MIN_HISTORY_DAYS,
    build_feature_row,
    build_supervised_dataset,
)

logger = logging.getLogger(__name__)

ML_ROOT = Path(__file__).resolve().parents[2]
MODEL_VERSION = "rf-v1"
MODEL_FILENAME = "rf_v1.joblib"
METADATA_FILENAME = "rf_v1.json"
DATA_SOURCE = "mô phỏng"

DEFAULT_RF_PARAMS: dict[str, Any] = {
    "n_estimators": 200,
    "max_depth": None,
    "min_samples_leaf": 2,
    "random_state": 42,
    "n_jobs": -1,
}


def train_rf_model(
    sales_path: Path = ML_ROOT / "data" / "synthetic_sales.csv",
    test_days: int = 60,
    params: dict[str, Any] | None = None,
) -> tuple[RandomForestRegressor, dict[str, Any]]:
    """Huấn luyện một mô hình RandomForestRegressor chung cho mọi sản phẩm trên phần train (trừ `test_days` ngày cuối)."""
    rf_params = {**DEFAULT_RF_PARAMS, **(params or {})}

    df = pd.read_csv(sales_path)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    product_codes = sorted(df["product_code"].unique())
    if not product_codes:
        raise ValueError("File dữ liệu không có sản phẩm nào.")

    x_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []
    train_starts: list[date] = []
    train_ends: list[date] = []

    for code in product_codes:
        sub = df[df["product_code"] == code]
        pairs = list(zip(sub["date"].tolist(), sub["qty"].astype(float).tolist()))
        dates, values = normalize_history(pairs)

        split = len(values) - test_days
        if split <= MIN_HISTORY_DAYS:
            raise ValueError(
                f"Sản phẩm {code} không đủ dữ liệu train (sau khi chừa {test_days} ngày test chỉ còn {split} ngày)."
            )

        train_dates = dates[:split]
        train_values = values[:split]
        train_starts.append(train_dates[0])
        train_ends.append(train_dates[-1])

        x_prod, y_prod, _ = build_supervised_dataset(train_dates, train_values)
        x_parts.append(x_prod)
        y_parts.append(y_prod)

    x_train = np.vstack(x_parts)
    y_train = np.concatenate(y_parts)

    model = RandomForestRegressor(**rf_params)
    model.fit(x_train, y_train)
    # Tắt đa luồng khi suy luận đơn lẻ để tránh chi phí điều phối thread mỗi bước đệ quy
    model.n_jobs = 1

    metadata: dict[str, Any] = {
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "train_start": min(train_starts).isoformat(),
        "train_end": max(train_ends).isoformat(),
        "n_rows": int(x_train.shape[0]),
        "features": list(FEATURE_NAMES),
        "params": {
            "n_estimators": rf_params["n_estimators"],
            "max_depth": rf_params["max_depth"],
            "min_samples_leaf": rf_params["min_samples_leaf"],
            "random_state": rf_params["random_state"],
        },
        "data_source": DATA_SOURCE,
    }
    return model, metadata


def save_model_artifacts(
    model: RandomForestRegressor,
    metadata: dict[str, Any],
    model_dir: Path,
) -> tuple[Path, Path]:
    """Lưu mô hình `.joblib` và file metadata `.json`."""
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / MODEL_FILENAME
    metadata_path = model_dir / METADATA_FILENAME

    joblib.dump(model, model_path)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return model_path, metadata_path


def load_model_artifacts(model_dir: Path) -> tuple[RandomForestRegressor, dict[str, Any]]:
    """Nạp mô hình `.joblib` và metadata `.json` từ `model_dir`."""
    model_path = model_dir / MODEL_FILENAME
    metadata_path = model_dir / METADATA_FILENAME

    model: RandomForestRegressor = joblib.load(model_path)
    model.n_jobs = 1
    metadata: dict[str, Any] = json.loads(metadata_path.read_text(encoding="utf-8"))
    return model, metadata


def forecast_model(
    model: RandomForestRegressor,
    history: Sequence[tuple[date, float]],
    horizon_days: int,
) -> list[tuple[date, float]]:
    """Chuẩn hóa lịch sử và dự báo đệ quy `horizon_days` ngày nối tiếp."""
    if horizon_days < 1:
        raise ValueError("horizon_days phải >= 1.")

    dates, values = normalize_history(history)
    if len(values) < MIN_HISTORY_DAYS:
        raise ValueError(
            f"Không đủ dữ liệu lịch sử (cần ≥ {MIN_HISTORY_DAYS} ngày, hiện có {len(values)})."
        )

    # Neo level_28 theo 28 ngày thực tế cuối cùng để giảm trôi mức nền khi dự báo nhiều bước
    anchor_level_28 = sum(values[-MIN_HISTORY_DAYS:]) / float(MIN_HISTORY_DAYS)
    series = list(values)
    last_date = dates[-1]
    predictions: list[tuple[date, float]] = []

    for step in range(1, horizon_days + 1):
        target_date = last_date + timedelta(days=step)
        feat_row = build_feature_row(target_date, series, level_28=anchor_level_28)
        x_step = np.asarray([feat_row], dtype=np.float64)
        raw_pred = float(model.predict(x_step)[0])
        clamped = max(0.0, raw_pred)
        series.append(clamped)
        predictions.append((target_date, round(clamped, 2)))

    return predictions


def load_metrics_summary(metrics_path: Path) -> dict[str, Any] | None:
    """Đọc chỉ số tổng hợp MAE/RMSE từ `reports/model_metrics.json` nếu tồn tại."""
    if not metrics_path.exists():
        return None

    data = json.loads(metrics_path.read_text(encoding="utf-8"))
    methods_overall = {
        name: block["overall"]
        for name, block in data.get("methods", {}).items()
        if "overall" in block
    }
    summary: dict[str, Any] = {
        "test_days": data.get("test_days"),
        "test_start": data.get("test_start"),
        "test_end": data.get("test_end"),
        "methods": methods_overall,
    }
    if "recursive_14d" in data:
        rec = data["recursive_14d"]
        summary["recursive_14d"] = {
            "cutoff_date": rec.get("cutoff_date"),
            "forecast_start": rec.get("forecast_start"),
            "forecast_end": rec.get("forecast_end"),
            "horizon_days": rec.get("horizon_days"),
            "methods": {
                name: block["overall"]
                for name, block in rec.get("methods", {}).items()
                if "overall" in block
            },
        }
    return summary


class ModelManager:
    """Quản lý vòng đời nạp / tự huấn luyện mô hình cho dịch vụ FastAPI."""

    def __init__(
        self,
        model_dir: Path | None = None,
        sales_path: Path | None = None,
        metrics_path: Path | None = None,
        test_days: int = 60,
        train_params: dict[str, Any] | None = None,
    ) -> None:
        env_model_dir = os.getenv("MODEL_DIR")
        if model_dir is not None:
            self.model_dir = Path(model_dir)
        elif env_model_dir:
            self.model_dir = Path(env_model_dir)
        else:
            self.model_dir = ML_ROOT / "models"

        self.sales_path = (
            Path(sales_path)
            if sales_path is not None
            else ML_ROOT / "data" / "synthetic_sales.csv"
        )
        self.metrics_path = (
            Path(metrics_path)
            if metrics_path is not None
            else ML_ROOT / "reports" / "model_metrics.json"
        )
        self.test_days = test_days
        self.train_params = train_params
        self._model: RandomForestRegressor | None = None
        self._metadata: dict[str, Any] | None = None

    def load_or_train(self) -> None:
        model_path = self.model_dir / MODEL_FILENAME
        metadata_path = self.model_dir / METADATA_FILENAME

        if model_path.exists() and metadata_path.exists():
            logger.info("Đang nạp mô hình %s từ %s", MODEL_VERSION, model_path)
            self._model, self._metadata = load_model_artifacts(self.model_dir)
            return

        logger.warning(
            "Không tìm thấy mô hình tại %s; bắt đầu tự huấn luyện từ %s",
            model_path,
            self.sales_path,
        )
        started = time.perf_counter()
        model, metadata = train_rf_model(
            sales_path=self.sales_path,
            test_days=self.test_days,
            params=self.train_params,
        )
        save_model_artifacts(model, metadata, self.model_dir)
        elapsed = time.perf_counter() - started
        logger.info(
            "Đã tự huấn luyện và lưu %s (%d dòng) trong %.2f giây.",
            metadata["model_version"],
            metadata["n_rows"],
            elapsed,
        )
        self._model = model
        self._metadata = metadata

    def ensure_loaded(self) -> None:
        if self._model is None or self._metadata is None:
            self.load_or_train()

    def forecast(
        self,
        history: Sequence[tuple[date, float]],
        horizon_days: int,
    ) -> tuple[str, list[tuple[date, float]]]:
        self.ensure_loaded()
        assert self._model is not None and self._metadata is not None
        preds = forecast_model(self._model, history, horizon_days=horizon_days)
        return str(self._metadata.get("model_version", MODEL_VERSION)), preds

    def get_info(self) -> dict[str, Any]:
        self.ensure_loaded()
        assert self._metadata is not None
        return {
            **self._metadata,
            "metrics": load_metrics_summary(self.metrics_path),
        }
