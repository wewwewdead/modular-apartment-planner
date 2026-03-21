import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ErrorBoundary from '@/app/ErrorBoundary';

const HomePage = lazy(() => import('./pages/HomePage'));
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'));
const FloorplanWorkspace = lazy(() => import('./modules/floorplan'));
const SketchStudioPage = lazy(() => import('./pages/SketchStudio'));

function RouteErrorBoundary({ children }) {
  return (
    <ErrorBoundary>
      <Suspense>{children}</Suspense>
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <RouteErrorBoundary><HomePage /></RouteErrorBoundary> },
  { path: '/floorplan', element: <RouteErrorBoundary><FloorplanWorkspace /></RouteErrorBoundary> },
  { path: '/sketch', element: <RouteErrorBoundary><SketchStudioPage /></RouteErrorBoundary> },
  { path: '/playground', element: <RouteErrorBoundary><PlaygroundPage /></RouteErrorBoundary> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
