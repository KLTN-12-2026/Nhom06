from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.features import MIN_HISTORY_DAYS

SUPPORTED_METHODS = ("baseline", "model")


class HealthResponse(BaseModel):
    status: str
    service: str


class HistoryItem(BaseModel):
    date: date
    qty: float = Field(..., ge=0)


class ForecastRequest(BaseModel):
    product_code: str = Field(..., min_length=1)
    history: list[HistoryItem] = Field(..., min_length=7)
    horizon_days: int = Field(..., ge=1, le=90)
    method: str = Field(default="baseline")

    @field_validator("product_code")
    @classmethod
    def validate_product_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("product_code không được để trống.")
        return cleaned

    @field_validator("history")
    @classmethod
    def validate_unique_dates(cls, items: list[HistoryItem]) -> list[HistoryItem]:
        seen: set[date] = set()
        for item in items:
            if item.date in seen:
                raise ValueError(f"Ngày bị trùng trong history: {item.date.isoformat()}")
            seen.add(item.date)
        return items

    @field_validator("method")
    @classmethod
    def validate_method(cls, value: str) -> str:
        if value not in SUPPORTED_METHODS:
            raise ValueError(
                f"Phương thức '{value}' chưa hỗ trợ; chỉ hỗ trợ 'baseline' hoặc 'model'."
            )
        return value

    @model_validator(mode="after")
    def validate_history_span_for_model(self) -> ForecastRequest:
        if self.method == "model":
            dates = [item.date for item in self.history]
            normalized_days = (max(dates) - min(dates)).days + 1
            if normalized_days < MIN_HISTORY_DAYS:
                raise ValueError(
                    f"Không đủ dữ liệu lịch sử (cần ≥ {MIN_HISTORY_DAYS} ngày, "
                    f"sau chuẩn hóa hiện có {normalized_days} ngày)."
                )
        return self


class ForecastItem(BaseModel):
    date: date
    qty: float = Field(..., ge=0)


class ForecastResponse(BaseModel):
    product_code: str
    method: str
    model_version: str
    generated_at: str
    forecast: list[ForecastItem]


class ModelInfoResponse(BaseModel):
    model_version: str
    trained_at: str
    train_start: str
    train_end: str
    n_rows: int
    features: list[str]
    params: dict[str, Any]
    data_source: str
    metrics: dict[str, Any] | None = None
