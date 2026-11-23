from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas import ForecastItem, ForecastRequest, ForecastResponse
from app.services.baseline import BASELINE_MODEL_VERSION, forecast_baseline

router = APIRouter(tags=["forecast"])


@router.post("/forecast", response_model=ForecastResponse)
def post_forecast(payload: ForecastRequest) -> ForecastResponse:
    history_pairs = [(item.date, item.qty) for item in payload.history]
    predictions = forecast_baseline(
        history=history_pairs,
        horizon_days=payload.horizon_days,
        window=7,
    )
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return ForecastResponse(
        product_code=payload.product_code,
        method=payload.method,
        model_version=BASELINE_MODEL_VERSION,
        generated_at=generated_at,
        forecast=[ForecastItem(date=d, qty=qty) for d, qty in predictions],
    )
