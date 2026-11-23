import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AgenciesPage } from '@/features/agencies/pages/AgenciesPage';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { SuppliersPage } from '@/features/suppliers/pages/SuppliersPage';
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

const IMPLEMENTED_PATHS = new Set(['/', '/products', '/suppliers', '/agencies', '/users']);

const placeholderRoutes = ALL_NAV_ITEMS.filter((item) => !IMPLEMENTED_PATHS.has(item.path)).map(
  (item) => ({
    path: item.path.replace(/^\//, ''),
    element: (
      <ProtectedRoute requiredPermission={item.requiredPermission}>
        <DevelopingPage title={item.label} />
      </ProtectedRoute>
    ),
  }),
);

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
        path: 'products',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            <ProductsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            <SuppliersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'agencies',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            <AgenciesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredPermission="users.read">
            <UsersPage />
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
