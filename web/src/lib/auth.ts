const ACCESS_TOKEN_KEY = 'kho_ai_access_token';
const SESSION_EXPIRED_KEY = 'kho_ai_session_expired';

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Bỏ qua nếu môi trường không có localStorage
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Bỏ qua nếu môi trường không có localStorage
  }
}

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

// Cờ trong sessionStorage để trang đăng nhập biết người dùng bị đưa về do phiên hết hạn hoặc bị thu hồi,
// không phải do tự bấm đăng xuất
export function isSessionExpiredFlagged(): boolean {
  try {
    return sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSessionExpiredFlag(): void {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {
    // Bỏ qua nếu môi trường không có sessionStorage
  }
}

function flagSessionExpired(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
  } catch {
    // Bỏ qua nếu môi trường không có sessionStorage
  }
}

export function notifyUnauthorized(): void {
  clearAccessToken();
  flagSessionExpired();
  for (const listener of unauthorizedListeners) {
    listener();
  }
}
