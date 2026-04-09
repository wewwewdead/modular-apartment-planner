import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ErrorBoundary from '@/app/ErrorBoundary';

const HomePage = lazy(() => import('./pages/HomePage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'));
const FloorplanWorkspace = lazy(() => import('./pages/Floorplan'));
const SketchStudioPage = lazy(() => import('./pages/SketchStudio'));

function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#666',
      }}
    >
      Loading...
    </div>
  );
}

function RouteErrorBoundary({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RouteErrorBoundary>
        <HomePage />
      </RouteErrorBoundary>
    ),
  },
  {
    path: '/floorplan',
    element: (
      <RouteErrorBoundary>
        <FloorplanWorkspace />
      </RouteErrorBoundary>
    ),
  },
  {
    path: '/sketch',
    element: (
      <RouteErrorBoundary>
        <SketchStudioPage />
      </RouteErrorBoundary>
    ),
  },
  {
    path: '/playground',
    element: (
      <RouteErrorBoundary>
        <PlaygroundPage />
      </RouteErrorBoundary>
    ),
  },
  {
    path: '/docs',
    element: (
      <RouteErrorBoundary>
        <DocsPage />
      </RouteErrorBoundary>
    ),
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
