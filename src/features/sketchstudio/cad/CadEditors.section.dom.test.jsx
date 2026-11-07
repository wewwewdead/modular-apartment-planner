// @vitest-environment jsdom
// Phase P (docs/sketch-studio-angle-bar.md §2.9–2.10): the member section
// fieldset for an angle (leg labels, both radii, Standard size) and the Cut
// side names on an angle member. Phase P.1 (§8.2): the member's Length, the
// folded End points / Ends & gaps, and radii that follow a custom size.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { CutLocationFields, FeatureForm } from './CadEditors.jsx';
import { ParameterContext } from './ExpressionInput.jsx';
import { LIVE_DEBOUNCE_MS } from './liveField.js';
import { createPart, emptyModel, resolveSection } from './model.js';
import { createCutFeature } from './cutPlacement.js';
import { angleRadiiFor } from './stockSections.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const L50 = { type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 };
const member = (section) => ({ ...createPart('angle').part.features[0], id: 'member', section });
// A member form whose feature follows its commits, like the Properties panel.
function Controlled({ initial, spy, values = {} }) {
  const [feature, setFeature] = useState(initial);
  return (
    <ParameterContext.Provider value={{ names: Object.keys(values), values }}>
      <FeatureForm
        feature={feature}
        model={emptyModel()}
        onChange={(next) => {
          spy(next);
          setFeature(next);
        }}
      />
    </ParameterContext.Provider>
  );
}
const setup = (section, overrides = {}, values) => {
  const spy = vi.fn();
  render(<Controlled initial={{ ...member(section), ...overrides }} spy={spy} values={values} />);
  return {
    spy,
    section: () => spy.mock.calls.at(-1)?.[0].section,
    feature: () => spy.mock.calls.at(-1)?.[0],
  };
};
const typeSelect = () => document.querySelector('.cad-section-fields select');
const size = () => screen.queryByLabelText('Standard size');
const field = (label) => screen.getByLabelText(label);
const commit = (label, text) => {
  const input = field(label);
  act(() => input.focus());
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
  act(() => input.blur());
};

it('labels an angle by its legs, shows both radii and the matching Standard size', () => {
  setup(L50);
  expect(size().value).toBe('L 50×50×5');
  expect([...size().options].map((o) => o.textContent)).toEqual([
    'Custom',
    'L 20×20×3',
    'L 25×25×3',
    'L 30×30×3',
    'L 40×40×4',
    'L 40×40×5',
    'L 50×50×5',
    'L 50×50×6',
    'L 60×60×6',
    'L 80×80×8',
    'L 100×100×10',
  ]);
  expect(
    [...document.querySelectorAll('.cad-section-fields .cad-field > span:first-child')].map((span) => span.textContent),
  ).toEqual(['Leg A (width)', 'Leg B (height)', 'Thickness', 'Root radius', 'Toe radius']);
  expect(field('Leg A (width)').value).toBe('50');
  expect(field('Root radius').value).toBe('7');
  expect(field('Toe radius').value).toBe('3.5');
});

it('a Standard size writes all five numbers in one update', () => {
  const { spy, section } = setup(L50);
  fireEvent.change(size(), { target: { value: 'L 100×100×10' } });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(section()).toEqual({ type: 'angle', width: 100, height: 100, wall: 10, rootRadius: 12, toeRadius: 6 });
  expect(size().value).toBe('L 100×100×10');
  expect(field('Leg B (height)').value).toBe('100');
  expect(field('Thickness').value).toBe('10');
  expect(field('Root radius').value).toBe('12');
  expect(field('Toe radius').value).toBe('6');
  // Custom changes nothing.
  fireEvent.change(size(), { target: { value: 'custom' } });
  expect(spy).toHaveBeenCalledTimes(1);
});

it('reads Custom once any value differs from the size or is an expression', () => {
  const { section } = setup(L50);
  commit('Toe radius', '3');
  expect(section().toeRadius).toBe(3);
  expect(size().value).toBe('custom');
  commit('Toe radius', '3.5');
  expect(size().value).toBe('L 50×50×5');
  commit('Leg A (width)', '=50');
  expect(section().width).toBe('=50');
  expect(size().value).toBe('custom');
});

it('an old radius-free angle shows both radii as 0 and writes nothing until one is edited', () => {
  const { spy, section } = setup({ type: 'angle', width: 50, height: 50, wall: 5 });
  expect(size().value).toBe('custom');
  expect(field('Root radius').value).toBe('0');
  expect(field('Toe radius').value).toBe('0');
  expect(spy).not.toHaveBeenCalled();
  commit('Root radius', '4');
  expect(section()).toEqual({ type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 4 });
});

it('switching to an angle adds the automatic radii (on a size match, its radii); switching away drops them', () => {
  const { section } = setup({ type: 'tube', width: 40, height: 40, wall: 4 });
  // A tube keeps its raw labels and has no Standard size.
  expect(size()).toBeNull();
  expect(
    [...document.querySelectorAll('.cad-section-fields .cad-field > span:first-child')].map((span) => span.textContent),
  ).toEqual(['width', 'height', 'Wall thickness']);
  fireEvent.change(typeSelect(), { target: { value: 'angle' } });
  expect(section()).toEqual({ type: 'angle', width: 40, height: 40, wall: 4, rootRadius: 6, toeRadius: 3 });
  expect(size().value).toBe('L 40×40×4');
  fireEvent.change(typeSelect(), { target: { value: 'tube' } });
  expect(section()).toEqual({ type: 'tube', width: 40, height: 40, wall: 4 });
  commit('Wall thickness', '2');
  fireEvent.change(typeSelect(), { target: { value: 'angle' } });
  // Phase P.1: off the catalogue, the automatic radii (angleRadiiFor): the
  // nearest thickness's (L 20×20×3, r3.5 / r2) scaled to r2 ≤ t / 2.
  expect(section()).toEqual({ type: 'angle', width: 40, height: 40, wall: 2, rootRadius: 1.7, toeRadius: 1 });
  expect(size().value).toBe('custom');
  fireEvent.change(typeSelect(), { target: { value: 'bar' } });
  expect(section()).toEqual({ type: 'bar', width: 40, height: 40 });
});

it('names the Cut sides of an angle member by leg face; a tube keeps Front / Rear / Left / Right', () => {
  const sides = (section) => {
    const created = createPart('angle');
    created.part.features[0].section = section;
    const cut = createCutFeature('hole', created.part);
    created.part.features.push(cut);
    const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    render(<CutLocationFields feature={cut} model={model} onChange={() => {}} />);
    const select = screen.getByLabelText('Cut side');
    const result = [...select.options].map((o) => [o.value, o.textContent]);
    cleanup();
    return result;
  };
  expect(sides(L50)).toEqual([
    ['front', 'Front — outside of leg A'],
    ['rear', 'Rear — inside of leg A'],
    ['left', 'Left — outside of leg B'],
    ['right', 'Right — inside of leg B'],
  ]);
  expect(sides({ type: 'tube', width: 40, height: 40, wall: 2 })).toEqual([
    ['front', 'Front'],
    ['rear', 'Rear'],
    ['left', 'Left'],
    ['right', 'Right'],
  ]);
});

// Phase P.1 (§8.2): a member's size first.
const typeLive = (label, text) => {
  const input = field(label);
  if (document.activeElement !== input) act(() => input.focus());
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
  act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
};

it('a member shows Length, then the stock section, then the folded End points and Ends & gaps', () => {
  setup(L50);
  const form = document.querySelector('.cad-form');
  const order = [...form.children].map(
    (child) =>
      child.querySelector(':scope > span')?.textContent ||
      child.querySelector(':scope > legend, :scope > summary')?.textContent ||
      child.textContent,
  );
  expect(order).toEqual([
    'Length (mm)',
    'Start to end along the axis; gaps and mitres trim from this.',
    'Stock section (mm)',
    'End points (part mm)',
    'Ends & gaps',
  ]);
  expect(field('Length (mm)').value).toBe('700');
  const [points, ends] = document.querySelectorAll('.cad-form > details');
  expect(points.open).toBe(false);
  expect(ends.open).toBe(false);
  expect([...points.querySelectorAll('legend')].map((l) => l.textContent)).toEqual(['Start', 'End']);
  expect([...ends.querySelectorAll('.cad-field > span:first-child')].map((s) => s.textContent)).toEqual([
    'Gap at start (mm)',
    'Gap at end (mm)',
    'Mitre at start (degrees)',
    'Mitre at end (degrees)',
  ]);
  expect(field('Mitre at end (degrees)').value).toBe('0');
});

it('an old member without gap / mitre keys reads 0 and writes nothing until edited', () => {
  const spy = vi.fn();
  const bare = member(L50);
  for (const key of ['gapStart', 'gapEnd', 'angleStart', 'angleEnd']) delete bare[key];
  render(<Controlled initial={bare} spy={spy} />);
  expect(field('Gap at start (mm)').value).toBe('0');
  expect(spy).not.toHaveBeenCalled();
  commit('Gap at end (mm)', '3');
  expect(spy.mock.calls.at(-1)[0]).toEqual({ ...bare, gapEnd: 3 });
});

it('Length keeps start and moves end along the axis, as numbers', () => {
  const { feature } = setup(L50);
  commit('Length (mm)', '1200');
  expect(feature().start).toEqual([0, 0, 0]);
  expect(feature().end).toEqual([0, 0, 1200]);
  expect(field('Length (mm)').value).toBe('1200');
  // Off the Z axis, from a start away from the origin; an expression resolves to a number.
  cleanup();
  const tilted = setup(L50, { start: [10, 20, 30], end: [310, 420, 30] }, { len: 1000 });
  expect(field('Length (mm)').value).toBe('500');
  commit('Length (mm)', '=len');
  expect(tilted.feature().start).toEqual([10, 20, 30]);
  expect(tilted.feature().end).toEqual([610, 820, 30]);
  expect(field('Length (mm)').value).toBe('1000');
});

it('a zero-length member grows along +Z; Length must be more than 0', () => {
  const { spy, feature } = setup(L50, { start: [5, 5, 5], end: [5, 5, 5] });
  expect(field('Length (mm)').value).toBe('0');
  commit('Length (mm)', '-20');
  expect(spy).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe('Length must be more than 0.');
  commit('Length (mm)', '250');
  expect(feature().end).toEqual([5, 5, 255]);
  expect(screen.queryByRole('alert')).toBeNull();
  commit('Length (mm)', '0');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toBe('Length must be more than 0.');
});

it('Length applies live and Esc restores the exact end the edit began with', () => {
  vi.useFakeTimers();
  const end = [0.1, 0.2, 700.0004];
  const { feature } = setup(L50, { end });
  expect(field('Length (mm)').value).toBe('700');
  typeLive('Length (mm)', '1250');
  const length = Math.hypot(...end);
  feature().end.forEach((v, i) => expect(v).toBeCloseTo((end[i] / length) * 1250, 9));
  typeLive('Length (mm)', '1300');
  fireEvent.keyDown(field('Length (mm)'), { key: 'Escape' });
  expect(feature().end).toEqual(end);
  expect(field('Length (mm)').value).toBe('700');
});

it('Length is read-only while an end point holds an expression', () => {
  const { spy } = setup(L50, { end: [0, 0, '=len'] }, { len: 900 });
  const input = field('Length (mm)');
  expect(input.readOnly).toBe(true);
  expect(input.value).toBe('900');
  expect(screen.getByText('End points use expressions — edit them under End points.')).toBeTruthy();
  fireEvent.change(input, { target: { value: '100' } });
  expect(spy).not.toHaveBeenCalled();
});

it('Leg A 63 then Thickness 3 on the default angle: automatic radii, a valid section, Custom', () => {
  const { section } = setup(L50);
  commit('Leg A (width)', '63');
  expect(section()).toEqual({ ...L50, width: 63, ...angleRadiiFor({ width: 63, height: 50, wall: 5 }) });
  commit('Thickness', '3');
  expect(section()).toEqual({ type: 'angle', width: 63, height: 50, wall: 3, rootRadius: 2.6, toeRadius: 1.5 });
  expect(() => resolveSection(section())).not.toThrow();
  expect(size().value).toBe('custom');
  expect(field('Root radius').value).toBe('2.6');
  expect(field('Toe radius').value).toBe('1.5');
  // Leg B 10: r1 + r2 must fit on the shorter leg.
  commit('Leg B (height)', '10');
  expect(section()).toMatchObject(angleRadiiFor({ width: 63, height: 10, wall: 3 }));
  expect(() => resolveSection(section())).not.toThrow();
  // Back to 50×50×5: the catalogue radii again.
  commit('Leg A (width)', '50');
  commit('Leg B (height)', '50');
  commit('Thickness', '5');
  expect(section()).toEqual(L50);
  expect(size().value).toBe('L 50×50×5');
});

it('typing "6" then "60" live in Leg A ends with the radii of 60', () => {
  vi.useFakeTimers();
  const { section } = setup(L50);
  typeLive('Leg A (width)', '6');
  expect(section()).toEqual({ ...L50, width: 6, ...angleRadiiFor({ width: 6, height: 50, wall: 5 }) });
  typeLive('Leg A (width)', '60');
  expect(section()).toEqual({ ...L50, width: 60, rootRadius: 5, toeRadius: 2.5 });
  act(() => field('Leg A (width)').blur());
  expect(section()).toEqual({ ...L50, width: 60, rootRadius: 5, toeRadius: 2.5 });
});

it('a leg given as an =expression counts by its value', () => {
  const { section } = setup(L50, {}, { leg: 60 });
  commit('Leg A (width)', '=leg');
  expect(section()).toEqual({ ...L50, width: '=leg', rootRadius: 5, toeRadius: 2.5 });
});

it('radii the user set stay when a leg or the thickness changes; so does a radius-free angle', () => {
  const { section } = setup(L50);
  commit('Toe radius', '3');
  commit('Leg A (width)', '80');
  expect(section()).toEqual({ ...L50, width: 80, toeRadius: 3 });
  commit('Thickness', '6');
  expect(section()).toEqual({ ...L50, width: 80, wall: 6, toeRadius: 3 });
  // An invalid combination shows the resolver message as before.
  commit('Thickness', '3');
  expect(() => resolveSection(section())).toThrow('Toe radius must be less than the thickness.');
  cleanup();
  const old = setup({ type: 'angle', width: 50, height: 50, wall: 5 });
  commit('Leg A (width)', '60');
  expect(old.section()).toEqual({ type: 'angle', width: 60, height: 50, wall: 5 });
});

it('a Standard size still fills all five values after a custom size', () => {
  const { section } = setup(L50);
  commit('Leg A (width)', '63');
  commit('Thickness', '3');
  fireEvent.change(size(), { target: { value: 'L 40×40×4' } });
  expect(section()).toEqual({ type: 'angle', width: 40, height: 40, wall: 4, rootRadius: 6, toeRadius: 3 });
  expect(size().value).toBe('L 40×40×4');
  expect(field('Leg B (height)').value).toBe('40');
});
