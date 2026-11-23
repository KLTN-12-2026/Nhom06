# KHO-AI

Hệ thống quản lý kho thông minh tích hợp AI đề xuất xử lý hàng cận hạn.
Khóa luận tốt nghiệp — Khoa CNTT, Đại học Duy Tân, 2026.

## Kiến trúc

| Thành phần | Thư mục | Công nghệ | Cổng |
|---|---|---|---|
| Giao diện | `web` | React, Vite, Tailwind, shadcn/ui | 5173 |
| Backend | `api` | NestJS, Prisma | 3000 (`/api/docs`) |
| Dịch vụ dự báo | `ml` | FastAPI, scikit-learn | 8000 (`/docs`) |
| Cơ sở dữ liệu | — | PostgreSQL 16 | 5432 |

Luồng AI: lịch sử xuất kho → **ML dự báo nhu cầu (số thô)** → NestJS tính tồn dư theo lô + bộ quy tắc sinh phương án hợp lệ → **LLM viết phân tích/đề xuất bằng tiếng Việt** → quản lý kho duyệt → thực hiện và theo dõi.

## Chạy nhanh

Yêu cầu: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up -d --build
```

- Web: http://localhost:5173
- API docs: http://localhost:3000/api/docs
- ML docs: http://localhost:8000/docs

## Tài liệu

Tài liệu dự án (đặc tả, thiết kế DB, DESIGN.md, mockup, phiếu task, luật cho AI agent) được quản lý **bên ngoài repo này**, trong workspace của nhóm. Repo chỉ chứa mã nguồn và cấu hình chạy.

## Nhóm thực hiện

GVHD: ThS. Trần Bàn Thạch · Trương Thành Lê (Scrum Master) · Nguyễn Văn Dương (Product Owner) · Phan Thanh Đức · Phan Nhật Tuyến · Lê Trương Hồng Long
