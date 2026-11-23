import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AgenciesPage } from '@/features/agencies/pages/AgenciesPage';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ExpiryAlertsPage } from '@/features/expiry/pages/ExpiryAlertsPage';
import { ExpiryThresholdsPage } from '@/features/expiry/pages/ExpiryThresholdsPage';
import { ForecastPage } from '@/features/forecast/pages/ForecastPage';
import { InboundDetailPage } from '@/features/inbound/pages/InboundDetailPage';
import { InboundFormPage } from '@/features/inbound/pages/InboundFormPage';
import { InboundListPage } from '@/features/inbound/pages/InboundListPage';
import { InventoryLotsPage } from '@/features/inventory/pages/InventoryLotsPage';
import { StockCountDetailPage } from '@/features/inventory/pages/StockCountDetailPage';
import { StockCountFormPage } from '@/features/inventory/pages/StockCountFormPage';
import { StockCountListPage } from '@/features/inventory/pages/StockCountListPage';
import { StockMovementsPage } from '@/features/inventory/pages/StockMovementsPage';
import { OrderDetailPage } from '@/features/orders/pages/OrderDetailPage';
import { OrderFormPage } from '@/features/orders/pages/OrderFormPage';
import { OrdersListPage } from '@/features/orders/pages/OrdersListPage';
import { OrderFefoOutboundPage } from '@/features/outbound/pages/OrderFefoOutboundPage';
import { OutboundDetailPage } from '@/features/outbound/pages/OutboundDetailPage';
import { OutboundListPage } from '@/features/outbound/pages/OutboundListPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { RiskAnalysisPage } from '@/features/risk/pages/RiskAnalysisPage';
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

const IMPLEMENTED_PATHS = new Set([
  '/',
  '/products',
  '/suppliers',
  '/agencies',
  '/inbound',
  '/inventory',
  '/stock-movements',
  '/stock-counts',
  '/orders',
  '/outbound',
  '/users',
  '/forecast',
  '/risk',
  '/expiry-alerts',
  '/expiry-thresholds',
  '/reports',
]);

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
        path: 'inbound',
        element: (
          <ProtectedRoute requiredPermission="inbound.read">
            <InboundListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/new',
        element: (
          <ProtectedRoute requiredPermission="inbound.create">
            <InboundFormPage mode="create" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/:id',
        element: (
          <ProtectedRoute requiredPermission="inbound.read">
            <InboundDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="inbound.create">
            <InboundFormPage mode="edit" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            <InventoryLotsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-movements',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            <StockMovementsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'movements',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            <Navigate to="/stock-movements" replace />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            <StockCountListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/new',
        element: (
          <ProtectedRoute requiredPermission="stock_count.create">
            <StockCountFormPage mode="create" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/:id',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            <StockCountDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="stock_count.create">
            <StockCountFormPage mode="edit" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders',
        element: (
          <ProtectedRoute requiredPermission="orders.read">
            <OrdersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/new',
        element: (
          <ProtectedRoute requiredPermission="orders.create">
            <OrderFormPage mode="create" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id',
        element: (
          <ProtectedRoute requiredPermission="orders.read">
            <OrderDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="orders.create">
            <OrderFormPage mode="edit" />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id/outbound',
        element: (
          <ProtectedRoute requiredPermission="outbound.read">
            <OrderFefoOutboundPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'outbound',
        element: (
          <ProtectedRoute requiredPermission="outbound.read">
            <OutboundListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'outbound/:id',
        element: (
          <ProtectedRoute requiredPermission="outbound.read">
            <OutboundDetailPage />
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
      {
        path: 'forecast',
        element: (
          <ProtectedRoute requiredPermission="forecast.read">
            <ForecastPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'risk',
        element: (
          <ProtectedRoute requiredPermission="analysis.read">
            <RiskAnalysisPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'expiry-alerts',
        element: (
          <ProtectedRoute requiredPermission="expiry.read">
            <ExpiryAlertsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'expiry-thresholds',
        element: (
          <ProtectedRoute requiredPermission="expiry.read">
            <ExpiryThresholdsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute requiredPermission="reports.read">
            <ReportsPage />
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
