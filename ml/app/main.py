from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routes.forecast import router as forecast_router
from app.routes.model import router as model_router
from app.services.model import ModelManager


def create_app(model_manager: ModelManager | None = None) -> FastAPI:
    manager = model_manager or ModelManager()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        manager.load_or_train()
        yield

    application = FastAPI(
        title="KHO-AI ML Service",
        description="Dịch vụ dự báo nhu cầu cho hệ thống quản lý kho KHO-AI.",
        version="0.2.0",
        lifespan=lifespan,
    )
    application.state.model_manager = manager
    application.include_router(forecast_router)
    application.include_router(model_router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ml"}

    return application


app = create_app()
