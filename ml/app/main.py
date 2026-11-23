from fastapi import FastAPI

app = FastAPI(
    title="KHO-AI ML Service",
    description="Dịch vụ dự báo nhu cầu cho hệ thống quản lý kho KHO-AI.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml"}
