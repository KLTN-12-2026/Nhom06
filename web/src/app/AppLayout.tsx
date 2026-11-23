import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ALL_NAV_ITEMS, NAV_GROUPS } from './navigation';

export function AppLayout() {
  const location = useLocation();
  const currentNav = ALL_NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav?.label ?? 'Bảng điều khiển';

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex">
      {/* Sidebar desktop (256px, cố định trái theo DESIGN.md mục 4 & mockup 02) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:bg-[var(--brand)] lg:text-[var(--brand-fg)]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-lg font-semibold leading-tight">Quản lý kho</div>
          <div className="mt-0.5 text-xs text-white/60">Kho trung tâm Đà Nẵng</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4" aria-label="Điều hướng chính">
          {NAV_GROUPS.map((group) => (
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
          <div className="text-sm font-medium">Chưa đăng nhập</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-white/60">Khung nền tảng</span>
            <button
              type="button"
              disabled
              className="rounded border border-white/30 px-2.5 py-1 text-xs text-white/70 opacity-60"
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
            <div className="text-xs text-white/60">Kho trung tâm Đà Nẵng</div>
          </div>
          <button
            type="button"
            disabled
            className="rounded border border-white/30 px-2.5 py-1 text-xs text-white/70 opacity-60"
          >
            Đăng xuất
          </button>
        </div>

        <nav
          className="flex overflow-x-auto border-t border-white/10"
          aria-label="Điều hướng di động"
        >
          {ALL_NAV_ITEMS.map((item) => (
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
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Hệ thống quản lý kho trung tâm — KHO-AI
          </p>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
