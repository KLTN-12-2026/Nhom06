import { getAccessToken, notifyUnauthorized } from './auth';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

async function handleErrorResponse(
  response: Response,
  normalizedPath: string,
  init?: ApiFetchOptions,
): Promise<never> {
  let message = `Yêu cầu thất bại (${response.status})`;
  let fieldErrors: ApiFieldError[] | undefined;

  try {
    const body = (await response.json()) as {
      message?: string | string[];
      errors?: ApiFieldError[];
    };
    if (Array.isArray(body.message)) {
      message = body.message.join(', ');
    } else if (typeof body.message === 'string') {
      message = body.message;
    }
    if (Array.isArray(body.errors)) {
      fieldErrors = body.errors;
    }
  } catch {
    // Giữ thông báo mặc định nếu body không phải JSON
  }

  const isLoginEndpoint = normalizedPath === '/auth/login';
  if (response.status === 401 && !isLoginEndpoint && !init?.skipAuthRedirect) {
    notifyUnauthorized();
  }

  throw new ApiError(response.status, message, fieldErrors);
}

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const token = getAccessToken();

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    return handleErrorResponse(response, normalizedPath, init);
  }

  if (response.status === 204 || response.headers?.get('content-length') === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiFetchBlob(
  path: string,
  init?: ApiFetchOptions,
): Promise<{ blob: Blob; filename: string | null }> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const token = getAccessToken();

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    return handleErrorResponse(response, normalizedPath, init);
  }

  const disposition = response.headers?.get('content-disposition') ?? '';
  const filenameMatch = /filename="?([^";\n]+)"?/i.exec(disposition);
  const filename = filenameMatch ? filenameMatch[1] : null;
  const blob = await response.blob();

  return { blob, filename };
}
