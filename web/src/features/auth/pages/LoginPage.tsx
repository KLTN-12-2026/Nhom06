import { zodResolver } from '@hookform/resolvers/zod';
import { Warehouse } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '../hooks';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setApiError(null);
    try {
      await login(values);
      const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(fromPath && fromPath !== '/login' ? fromPath : '/', {
        replace: true,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      {/* Thanh nhận diện trên cùng, cùng tên với sidebar sau khi đăng nhập */}
      <header className="bg-[var(--brand)] text-[var(--brand-fg)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-white/10">
            <Warehouse className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Quản lý kho</div>
            <div className="text-xs text-white/60">Kho trung tâm Đà Nẵng</div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16">
        <div className="w-full max-w-[400px]">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-semibold text-[var(--text)]">Đăng nhập hệ thống</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Dùng tài khoản do quản trị viên cấp.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="Nhập tên đăng nhập"
                  aria-invalid={Boolean(errors.username)}
                  {...register('username')}
                />
                {errors.username && (
                  <p role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  aria-invalid={Boolean(errors.password)}
                  {...register('password')}
                />
                {errors.password && (
                  <p role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
              >
                {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>

              {apiError && (
                <div
                  role="alert"
                  className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-3.5 py-2.5 text-sm text-[var(--risk-critical-fg)]"
                >
                  {apiError}
                </div>
              )}
            </form>
          </div>

          {/* Gợi ý tài khoản demo, chỉ để trình bày khóa luận */}
          <div className="mt-4 rounded-md border border-dashed border-[var(--border)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Tài khoản dùng thử: <span className="font-medium text-[var(--text)]">admin</span>,{' '}
            <span className="font-medium text-[var(--text)]">quanly</span>,{' '}
            <span className="font-medium text-[var(--text)]">nhanvien</span>. Mật khẩu{' '}
            <span className="font-medium text-[var(--text)]">123456</span>.
          </div>
        </div>
      </main>

      <footer className="px-4 py-5 text-center text-xs text-[var(--text-muted)]">
        Khóa luận tốt nghiệp · Nhóm 06 · Trường Đại học Duy Tân
      </footer>
    </div>
  );
}
