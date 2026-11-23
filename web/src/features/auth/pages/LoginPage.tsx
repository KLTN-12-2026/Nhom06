import { zodResolver } from '@hookform/resolvers/zod';
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
      navigate(fromPath && fromPath !== '/login' ? fromPath : '/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
      }
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Nửa trái navy bám mockup 01 */}
      <section className="flex flex-col justify-center bg-[var(--brand)] px-8 py-12 text-[var(--brand-fg)] lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
            Hàng cận hạn được phát hiện trước khi thành tổn thất
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-white/80">
            Quản lý nhập, xuất và tồn theo từng lô. Xuất hàng theo nguyên tắc FEFO. Dự báo nhu cầu
            để biết lô nào sẽ còn dư trước khi hết hạn, và đề xuất cách xử lý để người quản lý quyết
            định.
          </p>

          <hr className="my-8 border-white/15" />

          <p className="text-xs leading-relaxed text-white/80">
            Tài khoản dùng thử:{' '}
            <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-white">admin</code>,{' '}
            <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-white">quanly</code>{' '}
            hoặc{' '}
            <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-white">
              nhanvien
            </code>{' '}
            — mật khẩu{' '}
            <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-white">123456</code>
          </p>
        </div>
      </section>

      {/* Nửa phải form đăng nhập */}
      <section className="flex items-center justify-center bg-[var(--surface)] px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-[var(--text)]">Đăng nhập</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Hệ thống dành cho nhân sự nội bộ.
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
      </section>
    </div>
  );
}
