import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';
import { ALL_NAV_ITEMS, filterNavGroups } from './navigation';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();

  const visibleGroups = filterNavGroups(hasPermission);
  const visibleItems = visibleGroups.flatMap((group) => group.items);

  const currentNav = ALL_NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav?.pageTitle ?? currentNav?.label ?? 'Bảng điều khiển';
  const pageDescription =
    currentNav?.pageDescription ?? 'Hệ thống quản lý kho trung tâm — KHO-AI';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex">
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
                          'block border-l-[3px] py-2 pl-[17px] pr-5 text-sm transition-colors',
                          isActive
                            ? 'border-white bg-[var(--brand-active)] font-medium text-white'
                            : 'border-transparent text-white/85 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="truncate text-sm font-medium">{user?.fullName ?? 'Chưa đăng nhập'}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-white/60">{user?.role?.name ?? ''}</span>
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

      {/* Thanh điều hướng trên cùng cho màn hẹp (< 1024px, theo mockup 30) */}
      <div className="bg-[var(--brand)] text-[var(--brand-fg)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-base font-semibold leading-tight">Quản lý kho</div>
            <div className="text-xs text-white/60">
              {user ? `${user.fullName} · ${user.role?.name ?? ''}` : 'Kho trung tâm Đà Nẵng'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded border border-white/30 px-2.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/10"
          >
            Đăng xuất
          </button>
        </div>

        <nav
          className="flex overflow-x-auto border-t border-white/10"
          aria-label="Điều hướng di động"
        >
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'shrink-0 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-white bg-[var(--brand-active)] font-medium text-white'
                    : 'border-transparent text-white/80 hover:text-white',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Vùng nội dung chính */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-[var(--surface)] px-6 py-4 lg:px-8">
          <h1 className="text-2xl font-semibold text-[var(--text)]">{pageTitle}</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{pageDescription}</p>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
