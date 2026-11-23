from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _sample_history(days: int = 7, start: date = date(2026, 11, 1)) -> list[dict]:
    qtys = [14, 11, 9, 12, 13, 18, 20]
    return [
        {
            "date": (start + timedelta(days=i)).isoformat(),
            "qty": qtys[i % len(qtys)],
        }
        for i in range(days)
    ]


def test_forecast_baseline_contract_horizon_14() -> None:
    payload = {
        "product_code": "SP002",
        "history": _sample_history(7),
        "horizon_days": 14,
        "method": "baseline",
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["product_code"] == "SP002"
    assert body["method"] == "baseline"
    assert body["model_version"] == "baseline-ma7-v1"
    # generated_at phải hợp lệ định dạng ISO-8601 UTC
    assert body["generated_at"].endswith("Z")
    datetime.fromisoformat(body["generated_at"].replace("Z", "+00:00"))

    forecast = body["forecast"]
    assert len(forecast) == 14
    # Trung bình 7 ngày mẫu: (14+11+9+12+13+18+20)/7 = 97/7 = 13.8571... -> 13.86
    expected_start = date(2026, 11, 8)
    for idx, item in enumerate(forecast):
        assert item["date"] == (expected_start + timedelta(days=idx)).isoformat()
        assert item["qty"] == 13.86


def test_forecast_handles_unsorted_and_missing_dates() -> None:
    # 7 điểm lịch sử từ 01..08 (thiếu ngày 04 -> 0), gửi ngược thứ tự
    history = [
        {"date": "2026-11-08", "qty": 14},
        {"date": "2026-11-07", "qty": 14},
        {"date": "2026-11-06", "qty": 14},
        {"date": "2026-11-05", "qty": 14},
        {"date": "2026-11-03", "qty": 14},
        {"date": "2026-11-02", "qty": 14},
        {"date": "2026-11-01", "qty": 14},
    ]
    response = client.post(
        "/forecast",
        json={
            "product_code": "SP001",
            "history": history,
            "horizon_days": 2,
            "method": "baseline",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # 7 ngày cuối 02..08 có 1 ngày thiếu (04=0) -> 84/7 = 12.0
    assert body["forecast"] == [
        {"date": "2026-11-09", "qty": 12.0},
        {"date": "2026-11-10", "qty": 12.0},
    ]


@pytest.mark.parametrize(
    "override",
    [
        {"horizon_days": 0},
        {"horizon_days": 91},
        {"history": _sample_history(6)},
        {
            "history": [
                *_sample_history(6),
                {"date": "2026-11-07", "qty": -1},
            ]
        },
        {
            "history": [
                *_sample_history(6),
                {"date": "2026-11-01", "qty": 10},
            ]
        },
        {"product_code": "   "},
    ],
)
def test_forecast_validation_errors_return_422(override: dict) -> None:
    payload = {
        "product_code": "SP002",
        "history": _sample_history(7),
        "horizon_days": 14,
        "method": "baseline",
        **override,
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 422


def test_forecast_unsupported_method_returns_422_with_message() -> None:
    payload = {
        "product_code": "SP002",
        "history": _sample_history(7),
        "horizon_days": 7,
        "method": "xgboost",
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 422
    assert "chưa hỗ trợ" in response.text.lower()


@pytest.fixture()
def model_client(tmp_path):
    """TestClient với mô hình RF nhỏ trong tmp_path để kiểm thử API nhanh và độc lập."""
    import json
    import pandas as pd
    from app.main import create_app
    from app.services.model import ModelManager

    sales_csv = tmp_path / "sales.csv"
    start = date(2026, 1, 1)
    rows = []
    for i in range(120):
        d = (start + timedelta(days=i)).isoformat()
        rows.append({"date": d, "product_code": "SP001", "qty": 15 + (i % 7)})
        rows.append({"date": d, "product_code": "SP002", "qty": 25 + (i % 5)})
    pd.DataFrame(rows).to_csv(sales_csv, index=False, lineterminator="\n")

    metrics_file = tmp_path / "model_metrics.json"
    metrics_file.write_text(
        json.dumps(
            {
                "dataset": str(sales_csv),
                "model_version": "rf-v1",
                "test_days": 60,
                "test_start": "2026-03-02",
                "test_end": "2026-04-30",
                "methods": {
                    "moving_average_7": {
                        "overall": {"mean_mae": 2.5, "mean_rmse": 3.1, "pooled_rmse": 3.2},
                        "per_product": {},
                    },
                    "seasonal_naive_7": {
                        "overall": {"mean_mae": 2.8, "mean_rmse": 3.4, "pooled_rmse": 3.5},
                        "per_product": {},
                    },
                    "random_forest": {
                        "overall": {"mean_mae": 1.9, "mean_rmse": 2.4, "pooled_rmse": 2.5},
                        "per_product": {},
                    },
                },
                "recursive_14d": {
                    "cutoff_date": "2026-03-01",
                    "forecast_start": "2026-03-02",
                    "forecast_end": "2026-03-15",
                    "horizon_days": 14,
                    "methods": {
                        "moving_average_7": {
                            "overall": {"mean_mae": 2.7, "mean_rmse": 3.3, "pooled_rmse": 3.4}
                        },
                        "random_forest": {
                            "overall": {"mean_mae": 2.1, "mean_rmse": 2.6, "pooled_rmse": 2.7}
                        },
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    manager = ModelManager(
        model_dir=tmp_path / "models",
        sales_path=sales_csv,
        metrics_path=metrics_file,
        test_days=60,
        train_params={
            "n_estimators": 15,
            "max_depth": 8,
            "min_samples_leaf": 2,
            "random_state": 42,
            "n_jobs": -1,
        },
    )
    test_app = create_app(model_manager=manager)
    with TestClient(test_app) as test_client:
        yield test_client


def test_forecast_model_contract_horizon_14(model_client: TestClient) -> None:
    start = date(2026, 9, 1)
    payload = {
        "product_code": "SP002",
        "history": _sample_history(60, start=start),
        "horizon_days": 14,
        "method": "model",
    }
    response = model_client.post("/forecast", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["product_code"] == "SP002"
    assert body["method"] == "model"
    assert body["model_version"] == "rf-v1"
    assert body["generated_at"].endswith("Z")
    datetime.fromisoformat(body["generated_at"].replace("Z", "+00:00"))

    forecast = body["forecast"]
    assert len(forecast) == 14
    expected_start = start + timedelta(days=60)
    for idx, item in enumerate(forecast):
        assert item["date"] == (expected_start + timedelta(days=idx)).isoformat()
        assert item["qty"] >= 0


def test_forecast_model_rejects_history_shorter_than_28_days(model_client: TestClient) -> None:
    payload = {
        "product_code": "SP002",
        "history": _sample_history(20, start=date(2026, 10, 1)),
        "horizon_days": 7,
        "method": "model",
    }
    response = model_client.post("/forecast", json=payload)
    assert response.status_code == 422
    assert "không đủ dữ liệu" in response.text.lower()


def test_forecast_model_accepts_sparse_history_spanning_at_least_28_days(
    model_client: TestClient,
) -> None:
    # 15 điểm dữ liệu nhưng trải dài 35 ngày -> sau chuẩn hóa điền 0 có đủ 35 >= 28 ngày
    start = date(2026, 9, 1)
    sparse_history = [
        {"date": (start + timedelta(days=i * 2)).isoformat(), "qty": 15} for i in range(15)
    ]
    sparse_history.append({"date": (start + timedelta(days=34)).isoformat(), "qty": 15})
    response = model_client.post(
        "/forecast",
        json={
            "product_code": "SP001",
            "history": sparse_history,
            "horizon_days": 5,
            "method": "model",
        },
    )
    assert response.status_code == 200
    assert len(response.json()["forecast"]) == 5


def test_get_model_info_returns_metadata_and_metrics(model_client: TestClient) -> None:
    response = model_client.get("/model/info")
    assert response.status_code == 200

    body = response.json()
    assert body["model_version"] == "rf-v1"
    assert body["trained_at"].endswith("Z")
    assert body["data_source"] == "mô phỏng"
    assert body["n_rows"] > 0
    assert isinstance(body["features"], list) and len(body["features"]) == 11

    metrics = body["metrics"]
    assert metrics is not None
    assert metrics["test_days"] == 60
    assert metrics["methods"]["random_forest"]["mean_mae"] == 1.9
    assert metrics["methods"]["random_forest"]["mean_rmse"] == 2.4
    assert metrics["methods"]["moving_average_7"]["mean_mae"] == 2.5
    assert metrics["recursive_14d"]["horizon_days"] == 14


def test_get_model_info_handles_missing_metrics_file(tmp_path) -> None:
    import pandas as pd
    from app.main import create_app
    from app.services.model import ModelManager

    sales_csv = tmp_path / "sales.csv"
    start = date(2026, 1, 1)
    rows = [
        {"date": (start + timedelta(days=i)).isoformat(), "product_code": "SP001", "qty": 15 + (i % 7)}
        for i in range(120)
    ]
    pd.DataFrame(rows).to_csv(sales_csv, index=False, lineterminator="\n")

    manager = ModelManager(
        model_dir=tmp_path / "models",
        sales_path=sales_csv,
        metrics_path=tmp_path / "no_metrics.json",
        test_days=60,
        train_params={"n_estimators": 10, "min_samples_leaf": 2, "random_state": 42, "n_jobs": -1},
    )
    with TestClient(create_app(model_manager=manager)) as c:
        resp = c.get("/model/info")
        assert resp.status_code == 200
        body = resp.json()
        assert body["model_version"] == "rf-v1"
        assert body["metrics"] is None
