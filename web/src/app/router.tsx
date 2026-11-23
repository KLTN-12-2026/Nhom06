import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ForecastPage } from '@/features/forecast/pages/ForecastPage';
import { UsersPage } from '@/features/users/pages/UsersPage';
import { AppLayout } from './AppLayout';
import { ALL_NAV_ITEMS } from './navigation';

function DevelopingPage({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Chức năng đang trong quá trình phát triển.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--text-muted)]">
          Màn hình này sẽ được hoàn thiện ở các phiếu công việc tiếp theo.
        </p>
      </CardContent>
    </Card>
  );
}

const placeholderRoutes = ALL_NAV_ITEMS.filter(
  (item) => item.path !== '/' && item.path !== '/users' && item.path !== '/forecast',
).map((item) => ({
  path: item.path.replace(/^\//, ''),
  element: (
    <ProtectedRoute requiredPermission={item.requiredPermission}>
      <DevelopingPage title={item.label} />
    </ProtectedRoute>
  ),
}));

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredPermission="users.read">
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'forecast',
        element: (
          <ProtectedRoute requiredPermission="forecast.read">
            <ForecastPage />
          </ProtectedRoute>
        ),
      },
      ...placeholderRoutes,
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
