import { createContext, useContext } from 'react';

/**
 * Current zoom of the interactive canvas, or null outside one (SVG exports,
 * sheet drawings render at plot scale and must not zoom-compensate).
 * BlueprintAnnotationLayer reads this to keep annotation text readable on
 * screen at any zoom, the same way non-scaling strokes keep lines readable.
 */
const CanvasZoomContext = createContext(null);

export const CanvasZoomProvider = CanvasZoomContext.Provider;

export function useCanvasZoom() {
  return useContext(CanvasZoomContext);
}
