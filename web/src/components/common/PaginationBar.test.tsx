import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaginationBar } from './PaginationBar';

describe('PaginationBar', () => {
  it('ẩn khi tổng số dòng không lớn hơn kích thước trang', () => {
    const { rerender } = render(
      <PaginationBar page={1} pageSize={50} total={50} onPageChange={vi.fn()} />,
    );

    expect(screen.queryByText(/Trang 1/)).not.toBeInTheDocument();

    rerender(<PaginationBar page={1} pageSize={50} total={0} onPageChange={vi.fn()} />);
    expect(screen.queryByText(/Trang 1/)).not.toBeInTheDocument();
  });

  it('hiển thị số trang, tổng số dòng và vô hiệu nút trước ở trang đầu', () => {
    render(<PaginationBar page={1} pageSize={50} total={90} onPageChange={vi.fn()} />);

    expect(screen.getByText('Trang 1 / 2 (90 dòng)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled();
  });

  it('vô hiệu nút sau ở trang cuối', () => {
    render(<PaginationBar page={2} pageSize={50} total={90} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('gọi onPageChange với đúng trang khi bấm nút', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PaginationBar page={1} pageSize={50} total={150} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    rerender(
      <PaginationBar page={2} pageSize={50} total={150} onPageChange={onPageChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('đưa trang vượt quá tổng số trang về trang cuối hợp lệ', async () => {
    const onPageChange = vi.fn();

    render(<PaginationBar page={3} pageSize={50} total={90} onPageChange={onPageChange} />);

    await waitFor(() => {
      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });
});
