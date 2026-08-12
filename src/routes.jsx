import { Suspense } from 'react';
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
} from 'react-router-dom';
import ErrorBoundary, { ErrorScreen } from '@/app/ErrorBoundary';
import RouteProgress, { RouteHydrateFallback } from '@/app/RouteProgress';

/*
 * Routes load through the router's own `lazy`, not `React.lazy`.
 *
 * The difference is who does the waiting. React Router commits navigation state
 * inside `React.startTransition`, and React will not pull a screen that is
 * already on display down to a fallback for a transition — so a `React.lazy`
 * route element simply suspends, the *old* page stays up, and nothing anywhere
 * reports that anything is happening. Clicking "Floorplan" looked like a dead
 * click for as long as its (very large) chunk took to arrive.
 *
 * Handing the import to the router instead makes the module part of the
 * navigation: `useNavigation().state` reads `"loading"` for exactly as long as
 * the fetch takes, which is what `RouteProgress` renders from. By the time the
 * router commits, the module is in hand and the route renders in one go.
 */
const routeModule = (load) => () => load().then((module) => ({ Component: module.default }));

export function RootLayout() {
  const navigation = useNavigation();
  const location = useLocation();

  /*
   * `location` still points at the page being left while a navigation is
   * pending, so keying on it resets the error boundary only once the new route
   * actually arrives — and gives every route its own boundary, the way the
   * per-route wrapper this replaced used to.
   *
   * The `Suspense` sits outside that key so it stays mounted across
   * navigations. An already-mounted boundary is one React is willing to show a
   * fallback for, which makes it a working safety net for anything deeper in a
   * route that suspends after the route itself has loaded.
   */
  return (
    <>
      <RouteProgress active={navigation.state === 'loading'} />
      <Suspense fallback={<RouteHydrateFallback />}>
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Suspense>
    </>
  );
}

/**
 * A route module that never arrives — offline, or a stale chunk hash after a
 * deploy — is caught by the router, not by a React boundary, so it needs its
 * own way to reach the failure screen.
 */
function RouteErrorScreen() {
  const error = useRouteError();
  const navigate = useNavigate();
  return <ErrorScreen error={error} onRetry={() => navigate(0)} />;
}

export const routes = [
  {
    path: '/',
    Component: RootLayout,
    ErrorBoundary: RouteErrorScreen,
    // Rendered when the app is opened directly on a lazy route, before the
    // router has anything to put in the outlet.
    HydrateFallback: RouteHydrateFallback,
    children: [
      { index: true, lazy: routeModule(() => import('./pages/HomePage')) },
      { path: 'floorplan', lazy: routeModule(() => import('./pages/Floorplan')) },
      { path: 'sketch', lazy: routeModule(() => import('./pages/SketchStudio')) },
      { path: 'playground', lazy: routeModule(() => import('./pages/PlaygroundPage')) },
    ],
  },
];

export const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
