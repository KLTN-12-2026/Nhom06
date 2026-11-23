from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, field_validator


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
        if value != "baseline":
            raise ValueError(
                f"Phương thức '{value}' chưa hỗ trợ; hiện chỉ hỗ trợ 'baseline'."
            )
        return value


class ForecastItem(BaseModel):
    date: date
    qty: float = Field(..., ge=0)


class ForecastResponse(BaseModel):
    product_code: str
    method: str
    model_version: str
    generated_at: str
    forecast: list[ForecastItem]
