const FEFO_STEPS = [
  { id: 1, label: '1. Lọc lô đủ điều kiện giao', state: 'done' as const },
  { id: 2, label: '2. Xếp theo hạn dùng tăng dần', state: 'done' as const },
  { id: 3, label: '3. Kiểm tra lượng xuất', state: 'active' as const },
  { id: 4, label: '4. Xác nhận và trừ tồn', state: 'upcoming' as const },
];

export function FefoStepBar() {
  return (
    <div
      aria-label="Các bước phân bổ FEFO"
      className="flex items-center gap-5 overflow-x-auto whitespace-nowrap border-b border-[var(--border)] text-sm sm:gap-6"
    >
      {FEFO_STEPS.map((step) => {
        const cls =
          step.state === 'active'
            ? 'shrink-0 border-b-2 border-[var(--brand)] pb-3 font-semibold text-[var(--text)]'
            : step.state === 'done'
              ? 'shrink-0 pb-3 font-medium text-[var(--risk-low-fg)]'
              : 'shrink-0 pb-3 text-[var(--text-muted)]';
        return (
          <div key={step.id} className={cls}>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
