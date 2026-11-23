import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpiryBar } from './ExpiryBar';

describe('ExpiryBar (AC8)', () => {
  it('hiển thị "quá N ngày" cho lô đã hết hạn', () => {
    render(<ExpiryBar daysRemaining={-53} severity="expired" />);
    const label = screen.getByText('quá 53 ngày');
    expect(label).toBeInTheDocument();
    expect(label.className).toContain('var(--risk-expired-fg)');
  });

  it('hiển thị "còn N ngày" với màu tương ứng cho mức nguy cấp và trung bình', () => {
    const { rerender } = render(<ExpiryBar daysRemaining={5} severity="critical" maxDays={30} />);
    const critLabel = screen.getByText('còn 5 ngày');
    expect(critLabel).toBeInTheDocument();
    expect(critLabel.className).toContain('var(--risk-critical-fg)');

    rerender(<ExpiryBar daysRemaining={20} severity="warning" maxDays={30} />);
    const warnLabel = screen.getByText('còn 20 ngày');
    expect(warnLabel).toBeInTheDocument();
    expect(warnLabel.className).toContain('var(--risk-medium-fg)');
  });
});
