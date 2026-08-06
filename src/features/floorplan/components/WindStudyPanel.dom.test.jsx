/* @vitest-environment jsdom */
/**
 * DOM half of the WindStudyPanel characterization suite (T18).
 *
 * `WindStudyPanel.test.jsx` runs in the default `node` environment and renders
 * through `renderToStaticMarkup`, so it can only see the first paint: local
 * `useState` never advances, click handlers never fire, and `onPatch` is never
 * called. Everything below is the half that needs a real DOM, and nothing here
 * duplicates a claim the node file already pins from source.
 *
 * The whitespace-collapsed source extraction is deliberately identical to the
 * node file's `disclaimerText()` so the two pins can be compared directly: the
 * node file proves the paragraph is IN THE SOURCE, this file proves the same
 * string is REACHABLE IN THE DOM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWindStudyState } from '@/analysis/windState';
// `import.meta.url` is an http:// URL under the jsdom environment, so the node
// suite's `fileURLToPath(new URL(...))` cannot be reused here. Vite's `?raw`
// import reads the same bytes and works in either environment.
import panelSource from './WindStudyPanel.jsx?raw';
import WindStudyPanel from './WindStudyPanel';

afterEach(cleanup);

/** Mirrors `disclaimerText()` in WindStudyPanel.test.jsx exactly. */
function disclaimerSourceText() {
  const match = panelSource.match(/<p className={styles\.disclaimer}>([\s\S]*?)<\/p>/);
  if (!match) throw new Error('WindStudyPanel no longer has a styles.disclaimer paragraph.');
  return match[1].replace(/\s+/g, ' ').trim();
}

function collapse(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function mount(overrides = {}) {
  const onPatch = vi.fn();
  const onToggle = vi.fn();
  const props = {
    windStudy: createWindStudyState({ enabled: true }),
    study: null,
    status: 'idle',
    progress: null,
    error: null,
    stale: false,
    climate: null,
    onPatch,
    onToggle,
    ...overrides,
  };
  const utils = render(<WindStudyPanel {...props} />);
  return { ...utils, onPatch, onToggle, props };
}

function advancedToggle() {
  return screen.getByRole('button', { name: /Solver & wind rose/ });
}

function openAdvanced() {
  fireEvent.click(advancedToggle());
}

describe('WindStudyPanel disclaimer reachability (characterization)', () => {
  it('does not render the disclaimer on first paint', () => {
    mount();
    expect(screen.queryByText(/Screening model only/)).toBeNull();
  });

  it('renders the disclaimer paragraph once the advanced section is opened', () => {
    mount();
    openAdvanced();
    const paragraph = screen.getByText(/^Screening model only/);
    expect(paragraph.tagName).toBe('P');
    expect(paragraph.isConnected).toBe(true);
  });

  it('renders exactly the string the node suite pins from source', () => {
    mount();
    openAdvanced();
    expect(collapse(screen.getByText(/^Screening model only/).textContent)).toBe(disclaimerSourceText());
  });

  it('renders the disclaimer in comfort mode too, not only in direction mode', () => {
    mount({ windStudy: createWindStudyState({ enabled: true, mode: 'comfort' }) });
    openAdvanced();
    expect(collapse(screen.getByText(/^Screening model only/).textContent)).toBe(disclaimerSourceText());
  });

  it('drives the disclaimer purely from the toggle: open, close, open again', () => {
    mount();
    expect(advancedToggle().getAttribute('aria-expanded')).toBe('false');

    openAdvanced();
    expect(advancedToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText(/^Screening model only/)).not.toBeNull();

    openAdvanced();
    expect(advancedToggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/^Screening model only/)).toBeNull();

    openAdvanced();
    expect(screen.queryByText(/^Screening model only/)).not.toBeNull();
  });

  it('hides the whole advanced section — toggle included — while the study is off', () => {
    // characterization: pins current behaviour. With the panel off there is no
    // route to any caveat at all, not even a collapsed one.
    mount({ windStudy: createWindStudyState({ enabled: false }) });
    expect(screen.queryByRole('button', { name: /Solver & wind rose/ })).toBeNull();
    expect(screen.queryByText(/Screening model only/)).toBeNull();
  });
});

describe('WindStudyPanel toggle and mode handlers (characterization)', () => {
  it('calls onToggle once per click on the On/Off button, with no arguments of its own', () => {
    const { onToggle, onPatch } = mount();
    const button = screen.getByRole('button', { name: 'On' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // The handler is passed straight through, so it receives the click event.
    expect(onToggle.mock.calls[0][0]?.type).toBe('click');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('reports Off and aria-pressed=false while disabled, and still calls onToggle', () => {
    const { onToggle } = mount({ windStudy: createWindStudyState({ enabled: false }) });
    const button = screen.getByRole('button', { name: 'Off' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('patches the mode from the segmented control', () => {
    const { onPatch } = mount();
    const group = screen.getByRole('group', { name: 'Wind study mode' });
    fireEvent.click(within(group).getByRole('button', { name: 'Comfort' }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ mode: 'comfort' });
  });

  it('re-patches the mode even when that mode is already active', () => {
    // characterization: the segment is not guarded, so clicking the active
    // segment still fires a no-op patch through the reducer.
    const { onPatch } = mount();
    const group = screen.getByRole('group', { name: 'Wind study mode' });
    fireEvent.click(within(group).getByRole('button', { name: 'Direction' }));
    expect(onPatch).toHaveBeenCalledWith({ mode: 'direction' });
  });
});

describe('WindStudyPanel field payloads (characterization)', () => {
  it('sends the direction as a Number', () => {
    const { onPatch } = mount();
    fireEvent.change(screen.getByLabelText('Wind from'), { target: { value: '90' } });
    expect(onPatch).toHaveBeenCalledWith({ directionDeg: 90 });
  });

  it('sends the reference speed as the RAW STRING from the input', () => {
    // characterization: pins current behaviour; see T2. Unlike the direction
    // select, the numeric inputs are not coerced here — `applyWindStudyPatch`
    // in windState.js is what turns the string into a number.
    const { onPatch } = mount();
    fireEvent.change(screen.getByLabelText('Reference speed'), { target: { value: '7.5' } });
    expect(onPatch).toHaveBeenCalledWith({ referenceSpeed: '7.5' });
    expect(typeof onPatch.mock.calls[0][0].referenceSpeed).toBe('string');
  });

  it('sends an empty string when a numeric input is cleared', () => {
    // characterization: the panel forwards the empty value; the reducer's
    // finiteInRange fallback is the only thing keeping the state valid.
    const { onPatch } = mount();
    fireEvent.change(screen.getByLabelText('Reference speed'), { target: { value: '' } });
    expect(onPatch).toHaveBeenCalledWith({ referenceSpeed: '' });
  });

  it('hides the direction fields in comfort mode', () => {
    mount({ windStudy: createWindStudyState({ enabled: true, mode: 'comfort' }) });
    expect(screen.queryByLabelText('Wind from')).toBeNull();
    expect(screen.queryByLabelText('Reference speed')).toBeNull();
  });

  it('sends the advanced solver fields as raw strings, except the resolution select', () => {
    const { onPatch } = mount();
    openAdvanced();

    fireEvent.change(screen.getByLabelText('Slice height (mm)'), { target: { value: '1800' } });
    expect(onPatch).toHaveBeenLastCalledWith({ sliceHeight: '1800' });

    fireEvent.change(screen.getByLabelText('Iterations'), { target: { value: '900' } });
    expect(onPatch).toHaveBeenLastCalledWith({ iterations: '900' });

    fireEvent.change(screen.getByLabelText('Domain padding (mm)'), { target: { value: '45000' } });
    expect(onPatch).toHaveBeenLastCalledWith({ domainPadding: '45000' });

    fireEvent.change(screen.getByLabelText('Grid resolution'), { target: { value: '128' } });
    expect(onPatch).toHaveBeenLastCalledWith({ resolution: 128 });

    expect(onPatch).toHaveBeenCalledTimes(4);
  });
});

describe('WindStudyPanel wind-rose editor (characterization)', () => {
  function openRoseEditor() {
    const utils = mount({ windStudy: createWindStudyState({ enabled: true, mode: 'comfort' }) });
    openAdvanced();
    return utils;
  }

  it('is only reachable in comfort mode with the advanced section open', () => {
    const { container } = mount();
    openAdvanced();
    expect(container.querySelector('textarea')).toBeNull();
    cleanup();

    const comfort = mount({ windStudy: createWindStudyState({ enabled: true, mode: 'comfort' }) });
    expect(comfort.container.querySelector('textarea')).toBeNull();
    openAdvanced();
    expect(comfort.container.querySelector('textarea')).not.toBeNull();
  });

  it('seeds the textarea with the current 16-sector illustrative rose', () => {
    const { container } = openRoseEditor();
    const lines = container.querySelector('textarea').value.trim().split('\n');
    expect(lines).toHaveLength(16);
    expect(lines[0]).toBe('0, 6.25, 2, 5');
  });

  it('keeps edited text in the textarea without patching anything', () => {
    const { container, onPatch } = openRoseEditor();
    const textarea = container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '0, 60, 2, 5\n180, 40, 1.8, 6' } });
    expect(container.querySelector('textarea').value).toBe('0, 60, 2, 5\n180, 40, 1.8, 6');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('applies a valid rose as a user override that clears the stored climate', () => {
    const { container, onPatch } = openRoseEditor();
    fireEvent.change(container.querySelector('textarea'), { target: { value: '0, 60, 2, 5\n180, 40, 1.8, 6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply wind rose' }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({
      windRose: [
        { directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 5 },
        { directionDeg: 180, frequency: 0.4, weibullK: 1.8, weibullC: 6 },
      ],
      windRoseSource: 'user',
      windClimate: null,
    });
    expect(screen.queryByText(/one sector per line/)).toBeNull();
  });

  it('shows the parse error and patches nothing when the rose is unreadable', () => {
    const { container, onPatch } = openRoseEditor();
    fireEvent.change(container.querySelector('textarea'), { target: { value: 'north, often, 0, 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply wind rose' }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText(/one sector per line/).textContent).toBe(
      'Use direction, frequency %, Weibull k, Weibull c — one sector per line.',
    );
  });

  it('clears a previous parse error once a valid rose is applied', () => {
    const { container, onPatch } = openRoseEditor();
    const textarea = () => container.querySelector('textarea');
    fireEvent.change(textarea(), { target: { value: 'nonsense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply wind rose' }));
    expect(screen.queryByText(/one sector per line/)).not.toBeNull();

    fireEvent.change(textarea(), { target: { value: '0, 100, 2, 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply wind rose' }));
    expect(screen.queryByText(/one sector per line/)).toBeNull();
    expect(onPatch).toHaveBeenCalledTimes(1);
  });

  it('resets to the illustrative rose and rewrites the textarea in one click', () => {
    const { container, onPatch } = openRoseEditor();
    fireEvent.change(container.querySelector('textarea'), { target: { value: '0, 100, 2, 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset illustrative' }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0][0];
    expect(patch.windRoseSource).toBe('illustrative');
    expect(patch.windClimate).toBeNull();
    expect(patch.windRose).toHaveLength(16);
    expect(container.querySelector('textarea').value.trim().split('\n')).toHaveLength(16);
  });
});

describe('WindStudyPanel climate card actions (characterization)', () => {
  const site = { latitude: 10.32, longitude: 123.89 };

  it('offers Load site climate and calls climate.activate', () => {
    const climate = { status: 'ready', site, sourceUrl: 'https://open-meteo.com', activate: vi.fn(), refresh: vi.fn() };
    mount({ climate });
    fireEvent.click(screen.getByRole('button', { name: 'Load site climate' }));
    expect(climate.activate).toHaveBeenCalledTimes(1);
    expect(climate.refresh).not.toHaveBeenCalled();
  });

  it('offers Use saved site climate when an offline copy exists', () => {
    const climate = {
      status: 'ready',
      site,
      sourceUrl: 'https://open-meteo.com',
      offlineReady: true,
      activate: vi.fn(),
      refresh: vi.fn(),
    };
    mount({ climate });
    fireEvent.click(screen.getByRole('button', { name: 'Use saved site climate' }));
    expect(climate.activate).toHaveBeenCalledTimes(1);
  });

  it('switches the same button to climate.refresh once the rose is site-backed', () => {
    const climate = { status: 'ready', site, sourceUrl: 'https://open-meteo.com', activate: vi.fn(), refresh: vi.fn() };
    mount({
      climate,
      windStudy: createWindStudyState({
        enabled: true,
        windRoseSource: 'site-climate',
        windClimate: { period: '2021–2025', sampleCount: 43824 },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh online' }));
    expect(climate.refresh).toHaveBeenCalledTimes(1);
    expect(climate.activate).not.toHaveBeenCalled();
  });

  it('hides both climate actions while the history is still loading', () => {
    mount({
      climate: { status: 'loading', site, period: { label: '2021–2025' }, activate: vi.fn(), refresh: vi.fn() },
    });
    expect(screen.queryByRole('button', { name: /site climate/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh online' })).toBeNull();
    expect(screen.getByText(/Loading 2021–2025 hourly 10 m wind history/)).not.toBeNull();
  });

  it('keeps the actions available after a failed fetch so the fallback can be retried', () => {
    const climate = {
      status: 'error',
      site,
      error: 'Wind history is unavailable.',
      sourceUrl: 'https://open-meteo.com',
      activate: vi.fn(),
      refresh: vi.fn(),
    };
    mount({ climate });
    expect(screen.getByText(/current rose remains available as a fallback/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load site climate' }));
    expect(climate.activate).toHaveBeenCalledTimes(1);
  });

  it('marks the climate card with the climate status, defaulting to unavailable', () => {
    const { container } = mount();
    expect(container.querySelector('[data-status="unavailable"]')).not.toBeNull();
  });
});

describe('WindStudyPanel status line (characterization)', () => {
  it('reports the solver sector while a comfort run is in progress', () => {
    mount({
      status: 'running',
      progress: { stage: 'sector', sector: 3, sectors: 16, directionDeg: 90 },
    });
    const line = screen.getByText(/Solving 3\/16/);
    expect(line.getAttribute('data-status')).toBe('running');
    expect(collapse(line.textContent)).toBe('Solving 3/16 · E');
  });

  it('reports the iteration while a direction run is in progress', () => {
    mount({ status: 'running', progress: { stage: 'solve', iteration: 120, iterations: 450 } });
    expect(collapse(screen.getByText(/iteration 120\/450/).textContent)).toBe('Solving · iteration 120/450');
  });

  it('falls back to a preparing message when there is no progress yet', () => {
    mount({ status: 'running' });
    expect(screen.getByText('Preparing wind domain…').getAttribute('data-status')).toBe('running');
  });

  it('shows the hook error verbatim for both error and unavailable', () => {
    mount({ status: 'unavailable', error: 'This browser cannot run the wind solver in the background.' });
    expect(
      screen.getByText('This browser cannot run the wind solver in the background.').getAttribute('data-status'),
    ).toBe('unavailable');
  });

  it('explains an empty ready result rather than showing nothing', () => {
    mount({ status: 'ready', study: null });
    expect(screen.getByText(/No solid massing crosses/)).not.toBeNull();
  });

  it('dims the summary block while a stale result is on screen', () => {
    const { container } = mount({
      status: 'running',
      stale: true,
      study: {
        mode: 'direction',
        summary: { peakAmplification: 1.5, peakSpeed: 7, acceleratedFraction: 0.1, shelteredFraction: 0.4 },
      },
    });
    expect(container.querySelector('[data-stale="true"]')).not.toBeNull();
  });

  it('never shows the stale sentence in the state the hook actually produces', () => {
    // characterization: pins current behaviour; see T2. `useWindStudy` only ever
    // reports `stale: true` together with `status: 'running'` (useWindStudy.js
    // :83-94 — stale requires !settled, and !settled forces 'running'), and the
    // running branch of `statusText` returns first. The stale sentence is
    // therefore unreachable in production; a running study with no progress
    // message says "Preparing wind domain…" instead.
    mount({
      status: 'running',
      stale: true,
      study: {
        mode: 'direction',
        summary: { peakAmplification: 1.5, peakSpeed: 7, acceleratedFraction: 0.1, shelteredFraction: 0.4 },
      },
    });
    expect(screen.queryByText('Showing the previous result while the new run completes.')).toBeNull();
    expect(screen.getByText('Preparing wind domain…')).not.toBeNull();
  });

  it('only reaches the stale sentence through a status the hook cannot emit', () => {
    // The dead branch is still live code: it renders if `stale` is paired with
    // a settled status. Pinned so a rewrite that deletes it is a visible choice.
    mount({
      status: 'ready',
      stale: true,
      study: {
        mode: 'direction',
        summary: { peakAmplification: 1.5, peakSpeed: 7, acceleratedFraction: 0.1, shelteredFraction: 0.4 },
      },
    });
    expect(screen.getByText('Showing the previous result while the new run completes.')).not.toBeNull();
  });
});
