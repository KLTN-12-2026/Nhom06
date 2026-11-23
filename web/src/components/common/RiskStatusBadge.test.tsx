import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpirySeverityBadge, RiskLevelBadge } from './RiskStatusBadge';

describe('RiskStatusBadge (T-018 AC3)', () => {
  it('hiển thị đủ 4 mức rủi ro với nhãn và màu token đúng DESIGN.md mục 2', () => {
    const { rerender } = render(<RiskLevelBadge level="critical" />);
    const expired = screen.getByText('Hết hạn');
    expect(expired.className).toContain('var(--risk-expired-bg)');
    expect(expired.className).toContain('var(--risk-expired-fg)');

    rerender(<RiskLevelBadge level="high" />);
    const high = screen.getByText('Nguy cấp');
    expect(high.className).toContain('var(--risk-critical-bg)');
    expect(high.className).toContain('var(--risk-critical-fg)');

    rerender(<RiskLevelBadge level="medium" />);
    const medium = screen.getByText('Trung bình');
    expect(medium.className).toContain('var(--risk-medium-bg)');
    expect(medium.className).toContain('var(--risk-medium-fg)');

    rerender(<RiskLevelBadge level="low" />);
    const low = screen.getByText('Thấp');
    expect(low.className).toContain('var(--risk-low-bg)');
    expect(low.className).toContain('var(--risk-low-fg)');

    rerender(<RiskLevelBadge level="high" isExpired />);
    expect(screen.getByText('Hết hạn')).toBeInTheDocument();
  });

  it('hiển thị đúng badge hạn dùng cho chế độ cảnh báo (mockup 17) và tồn kho (mockup 11)', () => {
    const { rerender } = render(<ExpirySeverityBadge severity="critical" mode="alert" />);
    const alertCrit = screen.getByText('Nguy cấp');
    expect(alertCrit.className).toContain('var(--risk-critical-bg)');
    expect(alertCrit.className).toContain('var(--risk-critical-fg)');

    rerender(<ExpirySeverityBadge severity="warning" mode="alert" />);
    const alertWarn = screen.getByText('Trung bình');
    expect(alertWarn.className).toContain('var(--risk-medium-bg)');
    expect(alertWarn.className).toContain('var(--risk-medium-fg)');

    rerender(<ExpirySeverityBadge severity="critical" mode="inventory" />);
    const invNear = screen.getByText('Cận hạn');
    expect(invNear.className).toContain('var(--risk-medium-bg)');
    expect(invNear.className).toContain('var(--risk-medium-fg)');

    rerender(<ExpirySeverityBadge severity="normal" mode="inventory" />);
    const invNormal = screen.getByText('Bình thường');
    expect(invNormal.className).toContain('var(--risk-low-bg)');
    expect(invNormal.className).toContain('var(--risk-low-fg)');
  });
});
