# Nhom06 - Quản lý kho tích hợp AI

[![CI](https://github.com/KLTN-12-2026/Nhom06/actions/workflows/ci.yml/badge.svg)](https://github.com/KLTN-12-2026/Nhom06/actions/workflows/ci.yml)

Xây dựng hệ thống quản lý kho thông minh tích hợp AI đề xuất xử lý hàng cận hạn.
GVHD: ThS. Trần Bàn Thạch

## Công nghệ

- web: React, Vite, Tailwind, shadcn/ui
- api: NestJS, Prisma, PostgreSQL
- ml: FastAPI, scikit-learn

## Chạy dự án

Cần cài Docker.

    cp .env.example .env
    docker compose up -d --build

- Web: http://localhost:5173
- API: http://localhost:3000/api/docs
- ML: http://localhost:8000/docs

## Thành viên

Trương Thành Lê, Nguyễn Văn Dương, Phan Thanh Đức, Phan Nhật Tuyến, Lê Trương Hồng Long
