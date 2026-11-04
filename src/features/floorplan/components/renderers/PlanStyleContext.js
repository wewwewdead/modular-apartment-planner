import { createContext, createElement, useContext } from 'react';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';

/**
 * Which way the plan is drawn: as a drafting line drawing, or as a rendered
 * presentation plan (tinted zones, solid walls, shaded furniture).
 *
 * The default with no provider is drafting, and that is load-bearing: the
 * sheets, the SVG/PDF exports and every renderer unit test mount the leaf
 * renderers without a provider, so all of them keep drawing exactly what they
 * always drew. Only the interactive canvas provides a style, and only the
 * canvas defaults to presentation.
 *
 * Presentation may use filters, gradients and clip paths; drafting may not add
 * any — the hand-written vector PDF exporter cannot draw them.
 */
export const PLAN_STYLES = Object.freeze({
  DRAFTING: 'drafting',
  PRESENTATION: 'presentation',
});

export const PLAN_STYLE_STORAGE_KEY = 'floorplan.plan.style';
export const DEFAULT_CANVAS_PLAN_STYLE = PLAN_STYLES.PRESENTATION;

export function normalizePlanStyle(value) {
  return value === PLAN_STYLES.DRAFTING || value === PLAN_STYLES.PRESENTATION ? value : DEFAULT_CANVAS_PLAN_STYLE;
}

/** The editor's remembered choice. Never part of the project — a viewing preference like the grid. */
export function readPlanStylePreference() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CANVAS_PLAN_STYLE;
    return normalizePlanStyle(window.localStorage.getItem(PLAN_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_CANVAS_PLAN_STYLE;
  }
}

export function persistPlanStylePreference(style) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(PLAN_STYLE_STORAGE_KEY, normalizePlanStyle(style));
  } catch {
    // Private windows and locked-down profiles: the choice simply is not remembered.
  }
}

const PlanStyleContext = createContext(PLAN_STYLES.DRAFTING);

/**
 * Whether a drag is rewriting the walls right now. Separate from the style so a
 * pointer-down does not re-render every renderer that only wants the style.
 */
const PlanDragContext = createContext(false);

export function PlanStyleProvider({ value, dragging = false, children }) {
  return createElement(
    PlanStyleContext.Provider,
    { value: normalizePlanStyle(value) },
    createElement(PlanDragContext.Provider, { value: Boolean(dragging) }, children),
  );
}

export function usePlanStyle() {
  return useContext(PlanStyleContext);
}

export function usePlanDragActive() {
  return useContext(PlanDragContext);
}

export function isPresentationStyle(style) {
  return style === PLAN_STYLES.PRESENTATION;
}

/** The token table for a style. */
export function planGraphics(style) {
  return isPresentationStyle(style) ? PRESENTATION_GRAPHICS : DRAWING_GRAPHICS;
}
