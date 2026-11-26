#!/bin/sh
set -eu

TEST_DB="${POSTGRES_TEST_DB:-kho_ai_test}"

if [ "$TEST_DB" = "$POSTGRES_DB" ]; then
  echo "[db-init] Bỏ qua tạo DB test vì POSTGRES_TEST_DB trùng POSTGRES_DB ($TEST_DB)"
  exit 0
fi

echo "[db-init] Đảm bảo database test '$TEST_DB' tồn tại..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v test_db="$TEST_DB" <<'EOSQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')
\gexec
EOSQL
