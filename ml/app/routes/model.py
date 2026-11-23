from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas import ModelInfoResponse
from app.services.model import ModelManager

router = APIRouter(tags=["model"])


@router.get("/model/info", response_model=ModelInfoResponse)
def get_model_info(request: Request) -> ModelInfoResponse:
    manager: ModelManager = request.app.state.model_manager
    return ModelInfoResponse(**manager.get_info())
