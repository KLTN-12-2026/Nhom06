import fs from 'node:fs';
import path from 'node:path';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2eConfig } = require('../scripts/e2e-env.cjs') as {
  resolveE2eConfig: (env?: NodeJS.ProcessEnv, repoRoot?: string) => {
    apiBaseUrl: string;
    webUrl: string;
    demoPassword: string;
  };
};

export const E2E_CONFIG = resolveE2eConfig(process.env, path.resolve(__dirname, '../..'));
export const SCREENSHOT_DIR = path.resolve(__dirname, '../artifacts/screenshots');

export function ensureCleanScreenshotDir(): void {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

export async function waitForPageSettled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {
    // Bỏ qua nếu có kết nối nền; các assertion locator bên dưới đảm bảo dữ liệu đã sẵn sàng.
  });
  await page.evaluate(async () => {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }
  });
}

export async function captureScreenshot(
  page: Page,
  filename: string,
  options: { fullPage?: boolean } = {},
): Promise<string> {
  ensureCleanScreenshotDir();
  await waitForPageSettled(page);
  const targetPath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({
    path: targetPath,
    fullPage: options.fullPage ?? false,
    animations: 'disabled',
  });
  expect(fs.existsSync(targetPath)).toBe(true);
  expect(fs.statSync(targetPath).size).toBeGreaterThan(5_000);
  return targetPath;
}

export async function loginAs(
  page: Page,
  username: 'admin' | 'quanly' | 'nhanvien',
  password = E2E_CONFIG.demoPassword,
): Promise<void> {
  if (!page.url().includes('/login')) {
    await page.goto('/login');
  }
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.locator('aside button', { hasText: 'Đăng xuất' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  const desktopLogout = page.locator('aside button', { hasText: 'Đăng xuất' });
  if (await desktopLogout.isVisible()) {
    await desktopLogout.click();
  } else {
    await page.getByTestId('mobile-topbar').getByRole('button', { name: 'Đăng xuất' }).click();
  }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
}

export async function apiLogin(
  request: APIRequestContext,
  username: 'admin' | 'quanly' | 'nhanvien',
  password = E2E_CONFIG.demoPassword,
): Promise<string> {
  const response = await request.post(`${E2E_CONFIG.apiBaseUrl}/auth/login`, {
    data: { username, password },
  });
  expect(response.ok(), `API login thất bại cho ${username}: ${response.status()}`).toBe(true);
  const body = (await response.json()) as { accessToken?: string };
  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}

export async function getBrowserAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('kho_ai_access_token'));
  expect(token, 'Không tìm thấy kho_ai_access_token trong phiên đăng nhập hiện tại').toBeTruthy();
  return token as string;
}

export async function apiGet<T>(
  request: APIRequestContext,
  token: string,
  endpointPath: string,
): Promise<T> {
  const normalized = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const response = await request.get(`${E2E_CONFIG.apiBaseUrl}${normalized}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok(), `GET ${normalized} trả HTTP ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

export async function apiGetAsCurrentUser<T>(
  page: Page,
  request: APIRequestContext,
  endpointPath: string,
): Promise<T> {
  const token = await getBrowserAccessToken(page);
  return apiGet<T>(request, token, endpointPath);
}

/** Quy đổi số lượng thập phân (tối đa 3 chữ số) sang phần nghìn nguyên để tránh sai số float. */
export function toMilli(raw: string | number): number {
  const str = String(raw).trim();
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str.replace(/^\+/, '');
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const padded = fracPart.slice(0, 3).padEnd(3, '0');
  const milli = Number(intPart) * 1000 + Number(padded);
  return negative ? -milli : milli;
}

export function getVnTodayIso(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function getMonthStartIso(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}
