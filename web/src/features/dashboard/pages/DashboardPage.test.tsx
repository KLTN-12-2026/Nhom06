import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hiển thị trạng thái db và ml từ API health', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', db: 'up', ml: 'up' }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Ổn định (ok)')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Hoạt động (up)')).toHaveLength(2);
  });

  it('hiển thị thông báo lỗi thân thiện khi API không phản hồi', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Không thể kết nối tới dịch vụ API/)).toBeInTheDocument();
    });
  });
});
