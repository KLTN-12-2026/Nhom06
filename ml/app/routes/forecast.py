from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.schemas import ForecastItem, ForecastRequest, ForecastResponse
from app.services.baseline import BASELINE_MODEL_VERSION, forecast_baseline
from app.services.model import ModelManager

router = APIRouter(tags=["forecast"])


@router.post("/forecast", response_model=ForecastResponse)
def post_forecast(payload: ForecastRequest, request: Request) -> ForecastResponse:
    history_pairs = [(item.date, item.qty) for item in payload.history]

    if payload.method == "model":
        manager: ModelManager = request.app.state.model_manager
        model_version, predictions = manager.forecast(
            history=history_pairs,
            horizon_days=payload.horizon_days,
        )
    else:
        predictions = forecast_baseline(
            history=history_pairs,
            horizon_days=payload.horizon_days,
            window=7,
        )
        model_version = BASELINE_MODEL_VERSION

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return ForecastResponse(
        product_code=payload.product_code,
        method=payload.method,
        model_version=model_version,
        generated_at=generated_at,
        forecast=[ForecastItem(date=d, qty=qty) for d, qty in predictions],
    )
