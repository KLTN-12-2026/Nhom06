import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.features import FEATURE_NAMES
from app.services.model import (
    METADATA_FILENAME,
    MODEL_FILENAME,
    MODEL_VERSION,
    ModelManager,
    forecast_model,
    save_model_artifacts,
    train_rf_model,
)
from training.train import train_and_save


def _write_synthetic_subset(path: Path, n_days: int = 120, start: date = date(2026, 1, 1)) -> None:
    rows = []
    for i in range(n_days):
        d = (start + timedelta(days=i)).isoformat()
        dow_boost = 5 if (start + timedelta(days=i)).weekday() >= 5 else 0
        rows.append({"date": d, "product_code": "SP001", "qty": 15 + (i % 7) + dow_boost})
        rows.append({"date": d, "product_code": "SP002", "qty": 30 + (i % 5) + dow_boost})
    pd.DataFrame(rows).to_csv(path, index=False, lineterminator="\n")


def test_train_creates_artifacts_metadata_and_is_deterministic(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    start = date(2026, 1, 1)
    n_days = 120
    test_days = 60
    _write_synthetic_subset(sales_csv, n_days=n_days, start=start)

    small_params = {
        "n_estimators": 20,
        "max_depth": None,
        "min_samples_leaf": 2,
        "random_state": 42,
        "n_jobs": -1,
    }

    dir1 = tmp_path / "run1"
    dir2 = tmp_path / "run2"

    model_path_1, meta_path_1, meta_1 = train_and_save(
        sales_path=sales_csv, model_dir=dir1, test_days=test_days, params=small_params
    )
    model_path_2, meta_path_2, _ = train_and_save(
        sales_path=sales_csv, model_dir=dir2, test_days=test_days, params=small_params
    )

    assert model_path_1.exists() and model_path_1.name == MODEL_FILENAME
    assert meta_path_1.exists() and meta_path_1.name == METADATA_FILENAME
    assert model_path_2.exists() and meta_path_2.exists()

    loaded_meta = json.loads(meta_path_1.read_text(encoding="utf-8"))
    assert loaded_meta == meta_1
    assert loaded_meta["model_version"] == MODEL_VERSION
    assert loaded_meta["trained_at"].endswith("Z")
    assert loaded_meta["train_start"] == start.isoformat()
    # train_end = ngày liền trước 60 ngày cuối
    expected_train_end = (start + timedelta(days=n_days - test_days - 1)).isoformat()
    assert loaded_meta["train_end"] == expected_train_end
    # 2 sản phẩm * (60 ngày train - 28 ngày lịch sử đầu) = 64 dòng
    assert loaded_meta["n_rows"] == 2 * (n_days - test_days - 28)
    assert loaded_meta["features"] == list(FEATURE_NAMES)
    assert loaded_meta["params"]["random_state"] == 42
    assert loaded_meta["data_source"] == "mô phỏng"

    # Cùng seed + cùng dữ liệu -> 2 lần huấn luyện cho cùng dự báo tuyệt đối
    m1 = ModelManager(model_dir=dir1, sales_path=sales_csv)
    m2 = ModelManager(model_dir=dir2, sales_path=sales_csv)
    m1.load_or_train()
    m2.load_or_train()

    sample_history = [
        (date(2026, 4, 1) + timedelta(days=i), float(15 + (i % 7))) for i in range(40)
    ]
    _, preds1 = m1.forecast(sample_history, horizon_days=14)
    _, preds2 = m2.forecast(sample_history, horizon_days=14)
    assert preds1 == preds2
    assert len(preds1) == 14
    assert all(qty >= 0 for _, qty in preds1)


def test_recursive_forecast_continuity_and_non_negative(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    _write_synthetic_subset(sales_csv, n_days=120)
    model, meta = train_rf_model(
        sales_path=sales_csv,
        test_days=60,
        params={"n_estimators": 15, "min_samples_leaf": 2, "random_state": 42, "n_jobs": -1},
    )
    save_model_artifacts(model, meta, tmp_path / "models")

    start = date(2026, 9, 1)
    history = [(start + timedelta(days=i), float(20 + (i % 7))) for i in range(35)]
    preds = forecast_model(model, history, horizon_days=14)

    assert len(preds) == 14
    expected_first = start + timedelta(days=35)
    for idx, (pred_date, qty) in enumerate(preds):
        assert pred_date == expected_first + timedelta(days=idx)
        assert qty >= 0.0
        assert round(qty, 2) == qty


def test_lifespan_auto_trains_when_joblib_missing(tmp_path: Path) -> None:
    sales_csv = tmp_path / "sales.csv"
    _write_synthetic_subset(sales_csv, n_days=120)
    model_dir = tmp_path / "models_empty"
    metrics_path = tmp_path / "missing_metrics.json"

    assert not (model_dir / MODEL_FILENAME).exists()

    manager = ModelManager(
        model_dir=model_dir,
        sales_path=sales_csv,
        metrics_path=metrics_path,
        test_days=60,
        train_params={
            "n_estimators": 10,
            "max_depth": 6,
            "min_samples_leaf": 2,
            "random_state": 42,
            "n_jobs": -1,
        },
    )
    test_app = create_app(model_manager=manager)

    with TestClient(test_app) as client:
        assert (model_dir / MODEL_FILENAME).exists()
        assert (model_dir / METADATA_FILENAME).exists()

        health_resp = client.get("/health")
        assert health_resp.status_code == 200
        assert health_resp.json() == {"status": "ok", "service": "ml"}

        history = [
            {"date": (date(2026, 9, 1) + timedelta(days=i)).isoformat(), "qty": 18 + (i % 7)}
            for i in range(40)
        ]
        fc_resp = client.post(
            "/forecast",
            json={
                "product_code": "SP001",
                "history": history,
                "horizon_days": 7,
                "method": "model",
            },
        )
        assert fc_resp.status_code == 200
        body = fc_resp.json()
        assert body["method"] == "model"
        assert body["model_version"] == MODEL_VERSION
        assert len(body["forecast"]) == 7
        assert all(item["qty"] >= 0 for item in body["forecast"])
