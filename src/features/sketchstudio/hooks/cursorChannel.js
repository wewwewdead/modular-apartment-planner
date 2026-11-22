/**
 * The cursor position, outside React state.
 *
 * It changes on every pointer move, and only two things show it: the status
 * bar's X / Y readout and the precision HUD's position. Keeping it in the
 * reducer made every move re-render the whole studio to move a few numbers, so
 * the pointer handlers publish it here and those two components write it
 * straight into their DOM nodes (the pattern the planner's `cursorChannelRef`
 * uses). A component that renders for some other reason reads the latest value
 * from here, so React and the direct writes never disagree.
 *
 * `world` is the point the status bar shows (a handle drag publishes the
 * snapped, Ortho-constrained point, as the reducer's `cursorWorld` held);
 * `screen` is the canvas-relative pixel point the HUD follows.
 */
export function createCursorChannel() {
  const listeners = new Set();

  const channel = {
    screen: { x: 0, y: 0 },
    world: { x: 0, y: 0 },
    publish(screen, world) {
      channel.screen = screen;
      channel.world = world;
      listeners.forEach((listener) => listener(channel));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return channel;
}
