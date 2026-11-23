const SENSITIVE_KEY_TOKENS = [
  'password',
  'token',
  'apikey',
  'secret',
  'privatekey',
  'authorization',
  'cookie',
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_TOKENS.some((token) => normalized.includes(token));
}

function sanitizeNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeNode);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (!isSensitiveKey(key) && nested !== undefined) {
        result[key] = sanitizeNode(nested);
      }
    }
    return result;
  }
  return value;
}

/**
 * Lọc lại toàn bộ khóa nhạy cảm (mật khẩu, hash, token, apiKey, secret...) trong dữ liệu audit log
 * trước khi trả qua API, phòng trường hợp bản ghi cũ trong DB còn lưu khóa nhạy cảm.
 */
export function sanitizeAuditDataForRead(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  return sanitizeNode(value);
}
