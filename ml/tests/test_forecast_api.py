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
        "method": "model",
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 422
    assert "chưa hỗ trợ" in response.text.lower()
