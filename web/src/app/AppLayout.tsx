import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog';
import { useAuth } from '@/features/auth/hooks';
import { useExpiryAlertsSummaryQuery } from '@/features/expiry/hooks';
import { useProposalsSummaryQuery } from '@/features/proposals/hooks';
import { cn } from '@/lib/utils';
import { ALL_NAV_ITEMS, filterNavGroups } from './navigation';
import { type PageHeaderConfig, PageHeaderContext } from './page-header-context';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();
  const [headerOverride, setHeaderOverride] = useState<PageHeaderConfig | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const canReadExpiry = Boolean(user) && hasPermission('expiry.read');
  const expirySummaryQuery = useExpiryAlertsSummaryQuery(undefined, {
    enabled: canReadExpiry,
    retry: false,
    staleTime: 60_000,
  });
  const expiryAlertCount = expirySummaryQuery.data?.totalAlertLots ?? 0;

  const canReadProposals = Boolean(user) && hasPermission('proposals.read');
  const proposalsSummaryQuery = useProposalsSummaryQuery({
    enabled: canReadProposals,
    retry: false,
    staleTime: 60_000,
  });
  const pendingProposalCount = proposalsSummaryQuery.data?.pending ?? 0;

  const visibleGroups = filterNavGroups(hasPermission);
  const visibleItems = visibleGroups.flatMap((group) => group.items);

  const currentNav =
    ALL_NAV_ITEMS.find((item) => item.path === location.pathname) ??
    ALL_NAV_ITEMS.find(
      (item) => item.path !== '/' && location.pathname.startsWith(`${item.path}/`),
    );
  const pageTitle =
    headerOverride?.title ?? currentNav?.pageTitle ?? currentNav?.label ?? 'Bảng điều khiển';
  const pageDescription =
    headerOverride?.description ??
    currentNav?.pageDescription ??
    'Quản lý kho trung tâm KHO-AI';
  const pageActions = headerOverride?.actions;

  const headerContextValue = useMemo(
    () => ({ hasLayoutHeader: true, setHeader: setHeaderOverride }),
    [],
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[var(--bg)] text-[var(--text)] lg:flex">
      {/* Sidebar desktop (256px, cố định trái theo DESIGN.md mục 4 & mockup 02) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:bg-[var(--brand)] lg:text-[var(--brand-fg)]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-lg font-semibold leading-tight">Quản lý kho</div>
          <div className="mt-0.5 text-xs text-white/60">Kho trung tâm Đà Nẵng</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4" aria-label="Điều hướng chính">
          {visibleGroups.map((group) => (
            <div key={group.title} className="mb-4">
              <div className="px-5 pb-1.5 text-xs font-medium text-white/60">{group.title}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between gap-2 border-l-[3px] py-2 pl-[17px] pr-5 text-sm transition-colors',
                          isActive
                            ? 'border-white bg-[var(--brand-active)] font-medium text-white'
                            : 'border-transparent text-white/85 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <span>{item.label}</span>
                      {item.path === '/expiry-alerts' && expiryAlertCount > 0 && (
                        <span
                          aria-label={`${expiryAlertCount} lô cảnh báo cận hạn`}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--risk-critical-fg)] px-1.5 text-xs font-semibold tabular-nums text-white"
                        >
                          {expiryAlertCount}
                        </span>
                      )}
                      {item.path === '/proposals' && pendingProposalCount > 0 && (
                        <span
                          aria-label={`${pendingProposalCount} đề xuất chờ quyết định`}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--risk-critical-fg)] px-1.5 text-xs font-semibold tabular-nums text-white"
                        >
                          {pendingProposalCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="truncate text-sm font-medium">{user?.fullName ?? 'Chưa đăng nhập'}</div>
          <div className="mt-0.5 truncate text-xs text-white/60">{user?.role?.name ?? ''}</div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="flex-1 rounded border border-white/30 px-2 py-1 text-xs text-white/90 transition-colors hover:bg-white/10"
            >
              Đổi mật khẩu
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="shrink-0 rounded border border-white/30 px-2.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/10"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Thanh điều hướng trên cùng cho màn hẹp (< 1024px, 3 băng theo mockup 30) */}
      <div
        data-testid="mobile-topbar"
        className="bg-[var(--brand)] text-[var(--brand-fg)] lg:hidden"
      >
        <div className="px-4 py-3">
          <div className="text-base font-semibold leading-tight">Quản lý kho</div>
          <div className="mt-0.5 text-xs text-white/60">Kho trung tâm Đà Nẵng</div>
        </div>

        <nav
          className="flex overflow-x-auto border-y border-white/10"
          aria-label="Điều hướng di động"
        >
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-white bg-[var(--brand-active)] font-medium text-white'
                    : 'border-transparent text-white/80 hover:text-white',
                )
              }
            >
              <span>{item.label}</span>
              {item.path === '/expiry-alerts' && expiryAlertCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--risk-critical-fg)] px-1.5 text-xs font-semibold tabular-nums text-white">
                  {expiryAlertCount}
                </span>
              )}
              {item.path === '/proposals' && pendingProposalCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--risk-critical-fg)] px-1.5 text-xs font-semibold tabular-nums text-white">
                  {pendingProposalCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {user?.fullName ?? 'Chưa đăng nhập'}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="shrink-0 rounded border border-white/30 px-2.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/10"
            >
              Đổi mật khẩu
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="shrink-0 rounded border border-white/30 px-2.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/10"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      {/* Vùng nội dung chính */}
      <PageHeaderContext.Provider value={headerContextValue}>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-[var(--surface)] px-4 py-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-[var(--text)]">{pageTitle}</h1>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{pageDescription}</p>
            </div>
            {pageActions && <div className="flex flex-wrap items-center gap-2">{pageActions}</div>}
          </header>

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </PageHeaderContext.Provider>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
}
