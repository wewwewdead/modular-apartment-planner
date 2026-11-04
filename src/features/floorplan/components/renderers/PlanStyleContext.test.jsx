/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PLAN_STYLES,
  PLAN_STYLE_STORAGE_KEY,
  PlanStyleProvider,
  normalizePlanStyle,
  persistPlanStylePreference,
  planGraphics,
  readPlanStylePreference,
  usePlanDragActive,
  usePlanStyle,
} from './PlanStyleContext';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';

function Probe() {
  return <span data-style={usePlanStyle()} data-dragging={String(usePlanDragActive())} />;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('PlanStyleContext', () => {
  it('is drafting with no provider — sheets, exports and tests draw what they always drew', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('data-style="drafting"');
    expect(renderToStaticMarkup(<Probe />)).toContain('data-dragging="false"');
  });

  it('hands the provided style and drag state down', () => {
    const html = renderToStaticMarkup(
      <PlanStyleProvider value={PLAN_STYLES.PRESENTATION} dragging>
        <Probe />
      </PlanStyleProvider>,
    );
    expect(html).toContain('data-style="presentation"');
    expect(html).toContain('data-dragging="true"');
  });

  it('defaults the canvas preference to presentation and round-trips it through storage', () => {
    expect(readPlanStylePreference()).toBe(PLAN_STYLES.PRESENTATION);
    persistPlanStylePreference(PLAN_STYLES.DRAFTING);
    expect(window.localStorage.getItem(PLAN_STYLE_STORAGE_KEY)).toBe('drafting');
    expect(readPlanStylePreference()).toBe(PLAN_STYLES.DRAFTING);
    persistPlanStylePreference(PLAN_STYLES.PRESENTATION);
    expect(readPlanStylePreference()).toBe(PLAN_STYLES.PRESENTATION);
  });

  it('treats an unknown stored value as the default', () => {
    window.localStorage.setItem(PLAN_STYLE_STORAGE_KEY, 'watercolour');
    expect(readPlanStylePreference()).toBe(PLAN_STYLES.PRESENTATION);
    expect(normalizePlanStyle(undefined)).toBe(PLAN_STYLES.PRESENTATION);
  });

  it('picks the token table by style', () => {
    expect(planGraphics(PLAN_STYLES.DRAFTING)).toBe(DRAWING_GRAPHICS);
    expect(planGraphics(PLAN_STYLES.PRESENTATION)).toBe(PRESENTATION_GRAPHICS);
  });
});
