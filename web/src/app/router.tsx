import { lazy, type ReactNode, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { AppLayout } from './AppLayout';
import { ALL_NAV_ITEMS } from './navigation';

const AgenciesPage = lazy(() =>
  import('@/features/agencies/pages/AgenciesPage').then((m) => ({ default: m.AgenciesPage })),
);
const AuditLogsPage = lazy(() =>
  import('@/features/audit-logs/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ExecutionsPage = lazy(() =>
  import('@/features/executions/pages/ExecutionsPage').then((m) => ({ default: m.ExecutionsPage })),
);
const ExpiryAlertsPage = lazy(() =>
  import('@/features/expiry/pages/ExpiryAlertsPage').then((m) => ({
    default: m.ExpiryAlertsPage,
  })),
);
const ExpiryThresholdsPage = lazy(() =>
  import('@/features/expiry/pages/ExpiryThresholdsPage').then((m) => ({
    default: m.ExpiryThresholdsPage,
  })),
);
const ForecastPage = lazy(() =>
  import('@/features/forecast/pages/ForecastPage').then((m) => ({ default: m.ForecastPage })),
);
const InboundDetailPage = lazy(() =>
  import('@/features/inbound/pages/InboundDetailPage').then((m) => ({
    default: m.InboundDetailPage,
  })),
);
const InboundFormPage = lazy(() =>
  import('@/features/inbound/pages/InboundFormPage').then((m) => ({
    default: m.InboundFormPage,
  })),
);
const InboundListPage = lazy(() =>
  import('@/features/inbound/pages/InboundListPage').then((m) => ({
    default: m.InboundListPage,
  })),
);
const InventoryLotsPage = lazy(() =>
  import('@/features/inventory/pages/InventoryLotsPage').then((m) => ({
    default: m.InventoryLotsPage,
  })),
);
const StockCountDetailPage = lazy(() =>
  import('@/features/inventory/pages/StockCountDetailPage').then((m) => ({
    default: m.StockCountDetailPage,
  })),
);
const StockCountFormPage = lazy(() =>
  import('@/features/inventory/pages/StockCountFormPage').then((m) => ({
    default: m.StockCountFormPage,
  })),
);
const StockCountListPage = lazy(() =>
  import('@/features/inventory/pages/StockCountListPage').then((m) => ({
    default: m.StockCountListPage,
  })),
);
const StockMovementsPage = lazy(() =>
  import('@/features/inventory/pages/StockMovementsPage').then((m) => ({
    default: m.StockMovementsPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('@/features/orders/pages/OrderDetailPage').then((m) => ({
    default: m.OrderDetailPage,
  })),
);
const OrderFormPage = lazy(() =>
  import('@/features/orders/pages/OrderFormPage').then((m) => ({ default: m.OrderFormPage })),
);
const OrdersListPage = lazy(() =>
  import('@/features/orders/pages/OrdersListPage').then((m) => ({ default: m.OrdersListPage })),
);
const OrderFefoOutboundPage = lazy(() =>
  import('@/features/outbound/pages/OrderFefoOutboundPage').then((m) => ({
    default: m.OrderFefoOutboundPage,
  })),
);
const OutboundDetailPage = lazy(() =>
  import('@/features/outbound/pages/OutboundDetailPage').then((m) => ({
    default: m.OutboundDetailPage,
  })),
);
const OutboundListPage = lazy(() =>
  import('@/features/outbound/pages/OutboundListPage').then((m) => ({
    default: m.OutboundListPage,
  })),
);
const ProductsPage = lazy(() =>
  import('@/features/products/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
const ProposalDetailPage = lazy(() =>
  import('@/features/proposals/pages/ProposalDetailPage').then((m) => ({
    default: m.ProposalDetailPage,
  })),
);
const ProposalsListPage = lazy(() =>
  import('@/features/proposals/pages/ProposalsListPage').then((m) => ({
    default: m.ProposalsListPage,
  })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const RiskAnalysisPage = lazy(() =>
  import('@/features/risk/pages/RiskAnalysisPage').then((m) => ({
    default: m.RiskAnalysisPage,
  })),
);
const SuppliersPage = lazy(() =>
  import('@/features/suppliers/pages/SuppliersPage').then((m) => ({
    default: m.SuppliersPage,
  })),
);
const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((m) => ({ default: m.UsersPage })),
);

function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[200px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]"
    >
      Đang tải trang...
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

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
  '/audit-logs',
  '/forecast',
  '/risk',
  '/proposals',
  '/executions',
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
        element: withSuspense(<DashboardPage />),
      },
      {
        path: 'products',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            {withSuspense(<ProductsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            {withSuspense(<SuppliersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'agencies',
        element: (
          <ProtectedRoute requiredPermission="catalog.read">
            {withSuspense(<AgenciesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound',
        element: (
          <ProtectedRoute requiredPermission="inbound.read">
            {withSuspense(<InboundListPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/new',
        element: (
          <ProtectedRoute requiredPermission="inbound.create">
            {withSuspense(<InboundFormPage mode="create" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/:id',
        element: (
          <ProtectedRoute requiredPermission="inbound.read">
            {withSuspense(<InboundDetailPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inbound/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="inbound.create">
            {withSuspense(<InboundFormPage mode="edit" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            {withSuspense(<InventoryLotsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-movements',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            {withSuspense(<StockMovementsPage />)}
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
            {withSuspense(<StockCountListPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/new',
        element: (
          <ProtectedRoute requiredPermission="stock_count.create">
            {withSuspense(<StockCountFormPage mode="create" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/:id',
        element: (
          <ProtectedRoute requiredPermission="inventory.read">
            {withSuspense(<StockCountDetailPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock-counts/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="stock_count.create">
            {withSuspense(<StockCountFormPage mode="edit" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders',
        element: (
          <ProtectedRoute requiredPermission="orders.read">
            {withSuspense(<OrdersListPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/new',
        element: (
          <ProtectedRoute requiredPermission="orders.create">
            {withSuspense(<OrderFormPage mode="create" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id',
        element: (
          <ProtectedRoute requiredPermission="orders.read">
            {withSuspense(<OrderDetailPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id/edit',
        element: (
          <ProtectedRoute requiredPermission="orders.create">
            {withSuspense(<OrderFormPage mode="edit" />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:id/outbound',
        element: (
          <ProtectedRoute requiredPermission="outbound.create">
            {withSuspense(<OrderFefoOutboundPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'outbound',
        element: (
          <ProtectedRoute requiredPermission="outbound.read">
            {withSuspense(<OutboundListPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'outbound/:id',
        element: (
          <ProtectedRoute requiredPermission="outbound.read">
            {withSuspense(<OutboundDetailPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredPermission="users.read">
            {withSuspense(<UsersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit-logs',
        element: (
          <ProtectedRoute requiredPermission="audit.read">
            {withSuspense(<AuditLogsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'forecast',
        element: (
          <ProtectedRoute requiredPermission="forecast.read">
            {withSuspense(<ForecastPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'risk',
        element: (
          <ProtectedRoute requiredPermission="analysis.read">
            {withSuspense(<RiskAnalysisPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'proposals',
        element: (
          <ProtectedRoute requiredPermission="proposals.read">
            {withSuspense(<ProposalsListPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'proposals/:id',
        element: (
          <ProtectedRoute requiredPermission="proposals.read">
            {withSuspense(<ProposalDetailPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'executions',
        element: (
          <ProtectedRoute requiredPermission="executions.read">
            {withSuspense(<ExecutionsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'expiry-alerts',
        element: (
          <ProtectedRoute requiredPermission="expiry.read">
            {withSuspense(<ExpiryAlertsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'expiry-thresholds',
        element: (
          <ProtectedRoute requiredPermission="expiry.read">
            {withSuspense(<ExpiryThresholdsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute requiredPermission="reports.read">
            {withSuspense(<ReportsPage />)}
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
