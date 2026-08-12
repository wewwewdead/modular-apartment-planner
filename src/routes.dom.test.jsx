/* @vitest-environment jsdom */
/**
 * What a click on "Floorplan" looks like while its chunk is still arriving.
 *
 * The floorplan route is over a megabyte of JavaScript, so this gap is seconds
 * long on a first visit, and it used to be completely silent: React Router
 * commits navigation inside `React.startTransition`, and React will not replace
 * an on-screen page with a Suspense fallback for a transition. A `React.lazy`
 * route element therefore suspended invisibly — the home page stayed up, the
 * navigation reported `idle`, and nothing said the click had registered.
 *
 * The tests below pin the three properties that fix relies on. They use a
 * hand-held promise in place of a real `import()` so the pending window can be
 * held open and inspected.
 */
import { describe, expect, it } from 'vitest';
import { lazy, Suspense } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { RootLayout, routes } from './routes';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderWithPendingRoute(routeModule) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: RootLayout,
        children: [
          { index: true, element: <Link to="/heavy">Floorplan</Link> },
          { path: 'heavy', lazy: () => routeModule },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

async function clickThrough(label) {
  await act(async () => {
    screen.getByText(label).click();
    await Promise.resolve();
  });
}

describe('route navigation feedback', () => {
  it('shows a pending indicator as soon as a route module starts loading', async () => {
    const gate = deferred();
    const router = renderWithPendingRoute(gate.promise.then(() => ({ Component: () => <div>WORKSPACE</div> })));

    await clickThrough('Floorplan');

    expect(router.state.navigation.state).toBe('loading');
    expect(screen.getByRole('status').textContent).toContain('Opening workspace');
    // The page being left stays put underneath it.
    expect(screen.queryByText('Floorplan')).toBeTruthy();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });

    expect(screen.getByText('WORKSPACE')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
  });

  it('lets a lazy child inside a loaded route show its own fallback', async () => {
    // This is the 3D preview panel: three.js is a separate chunk that keeps
    // loading after the workspace itself has arrived. The 2D workspace must
    // paint immediately rather than waiting on it.
    const routeGate = deferred();
    const previewGate = deferred();
    const Preview = lazy(() => previewGate.promise.then(() => ({ default: () => <div>PREVIEW</div> })));

    renderWithPendingRoute(
      routeGate.promise.then(() => ({
        Component: () => (
          <div>
            <div>CANVAS</div>
            <Suspense fallback={<div>Loading 3D preview...</div>}>
              <Preview />
            </Suspense>
          </div>
        ),
      })),
    );

    await clickThrough('Floorplan');
    await act(async () => {
      routeGate.resolve();
      await routeGate.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('CANVAS')).toBeTruthy();
    expect(screen.getByText('Loading 3D preview...')).toBeTruthy();

    await act(async () => {
      previewGate.resolve();
      await previewGate.promise;
    });

    expect(screen.getByText('PREVIEW')).toBeTruthy();
    cleanup();
  });

  it('loads every page through the router rather than through React.lazy', () => {
    // A `React.lazy` element here would be invisible again: the router would
    // report the navigation finished while React quietly held the old screen.
    const [root] = routes;
    expect(root.HydrateFallback).toBeTypeOf('function');
    expect(root.children.length).toBeGreaterThan(0);
    for (const child of root.children) {
      expect(child.lazy).toBeTypeOf('function');
      expect(child.element).toBeUndefined();
    }
  });
});
