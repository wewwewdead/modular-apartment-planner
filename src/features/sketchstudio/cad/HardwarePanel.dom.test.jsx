// @vitest-environment jsdom
// Phase N (docs/sketch-studio-screw-library.md §7, §10): the Hardware library
// groups the 31 kinds, lists each kind's sizes, and shows Head style / Drive /
// Point only where the standard offers a choice.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HardwarePanel, { HardwareFields } from './HardwarePanel.jsx';
import { hardwareDefaults } from './hardware.js';

afterEach(cleanup);

const OLD_KINDS = ['bolt', 'nut', 'washer', 'standoff', 'clinch-nut', 'clinch-standoff', 'stud', 'rivet-nut', 'insert'];
const setup = () => {
  const onAdd = vi.fn();
  render(<HardwarePanel onAdd={onAdd} canAttach={false} />);
  return onAdd;
};
const select = (label, value) => act(() => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
const options = (label) => [...screen.getByLabelText(label).querySelectorAll('option')].map((o) => o.value);
// The value fields, in order: their labels.
const fieldLabels = () =>
  [...document.querySelectorAll('.cad-form input[aria-label]')].map((i) => i.getAttribute('aria-label'));
const type = (label, text) => {
  const input = screen.getByLabelText(label);
  act(() => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  });
  act(() => fireEvent.blur(input));
};

it('groups the hardware types, the nine Phase J kinds first', () => {
  setup();
  const kind = screen.getByLabelText('Hardware type');
  const groups = [...kind.querySelectorAll('optgroup')];
  expect(groups.map((g) => g.label)).toEqual([
    'Bolts, nuts & spacers',
    'Machine screws',
    'Socket screws',
    'Tapping & self-drilling',
    'Wood & construction',
    'Special',
    'Blind rivets',
    'Solid, tubular & special rivets',
    'Blind rivet nuts & studs',
  ]);
  expect(options('Hardware type')).toHaveLength(46);
  expect(options('Hardware type').slice(0, 9)).toEqual(OLD_KINDS);
  expect([...groups[0].querySelectorAll('option')].map((o) => o.value)).toEqual(OLD_KINDS);
  expect(within(groups[2]).getByRole('option', { name: 'Socket head cap screw' }).value).toBe('socket-cap');
  // Today's bolt: no screw selects.
  expect(screen.queryByLabelText('Head style')).toBeNull();
  expect(screen.queryByLabelText('Drive')).toBeNull();
  expect(screen.queryByLabelText('Point')).toBeNull();
});

it('shows each kind its sizes and only the choices its standard offers; the size survives or falls back', () => {
  setup();
  select('Metric size', 'M6');
  select('Hardware type', 'wood');
  expect(options('Metric size')).toEqual(['3.0', '3.5', '4.0', '4.5', '5.0', '6.0']);
  expect(screen.getByLabelText('Metric size').value).toBe('4.0');
  expect(options('Head style')).toEqual(['countersunk', 'raised-countersunk', 'round']);
  expect(screen.getByLabelText('Drive').value).toBe('pozidriv');
  expect(screen.queryByLabelText('Point')).toBeNull();

  select('Hardware type', 'set-screw');
  expect(screen.getByLabelText('Metric size').value).toBe('M6');
  expect(options('Point')).toEqual(['flat', 'cone', 'dog', 'cup']);
  expect(screen.queryByLabelText('Head style')).toBeNull();
  expect(screen.getByLabelText('Drive')).toBeTruthy();

  select('Hardware type', 'socket-cap');
  expect(screen.queryByLabelText('Head style')).toBeNull();
  expect(options('Drive')).toEqual(['hex-socket', 'torx', 'pin-torx']);
  expect(screen.queryByLabelText('Point')).toBeNull();
  expect(fieldLabels().slice(0, 6)).toEqual([
    'Shank length (mm)',
    'Thread diameter (mm)',
    'Head diameter (mm)',
    'Head height (mm)',
    'Drive size (mm)',
    'Thread pitch (mm)',
  ]);

  select('Hardware type', 'bolt');
  expect(screen.getByLabelText('Metric size').value).toBe('M6');
  expect(options('Metric size')).toEqual(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12']);
  expect(fieldLabels()).toEqual([
    'Shank length (mm)',
    'Shank diameter (mm)',
    'Head across flats (mm)',
    'Head / flange height (mm)',
    'Thread pitch (mm)',
    'Supplier part number',
    'Supplier installation hole (mm)',
    'Supplier minimum sheet thickness (mm)',
    'Installation / finish notes',
  ]);
  expect(screen.getByLabelText('Head across flats (mm)').value).toBe('13.8');
  expect(screen.queryByLabelText('Head style')).toBeNull();

  // Bolt M6 → wood (4.0) → bolt lands on M6 again (spec §5).
  select('Hardware type', 'wood');
  expect(screen.getByLabelText('Metric size').value).toBe('4.0');
  select('Hardware type', 'bolt');
  expect(screen.getByLabelText('Metric size').value).toBe('M6');
});

it('a head change re-derives the head sizes and keeps a typed length; Add passes head, drive and point', () => {
  const onAdd = setup();
  select('Hardware type', 'wood');
  expect(screen.getByLabelText('Head height (mm)').value).toBe('2.2');
  type('Overall length (mm)', '55');
  select('Head style', 'round');
  expect(screen.getByLabelText('Head height (mm)').value).toBe('2.6');
  // Round is a headed screw: the length is under the head now.
  expect(screen.getByLabelText('Shank length (mm)').value).toBe('55');
  select('Drive', 'torx');
  expect(screen.getByLabelText('Drive size (mm)').value).toBe('3.86');
  select('Metric size', '5.0');
  // A new size keeps the chosen head and drive.
  expect(screen.getByLabelText('Head style').value).toBe('round');
  expect(screen.getByLabelText('Drive').value).toBe('torx');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(onAdd).toHaveBeenCalledOnce();
  expect(onAdd.mock.calls[0][0]).toMatchObject({
    kind: 'wood',
    size: '5.0',
    head: 'round',
    drive: 'torx',
    driveSize: 4.43,
    point: 'sharp',
  });
});

it('a point change re-derives the point diameter; an invalid size blocks Add with the reason', () => {
  setup();
  select('Hardware type', 'set-screw');
  // From the bolt's M3 (valid for a set screw): 6 long.
  expect(screen.getByLabelText('Overall length (mm)').value).toBe('6');
  select('Metric size', 'M6');
  expect(screen.getByLabelText('Point diameter (mm)').value).toBe('4');
  select('Point', 'cup');
  expect(screen.getByLabelText('Point diameter (mm)').value).toBe('3');
  select('Point', 'dog');
  expect(screen.getByLabelText('Dog length (mm)').value).toBe('3.25');
  select('Point', 'cone');
  expect(screen.queryByLabelText('Point diameter (mm)')).toBeNull();
  select('Point', 'flat');
  type('Point diameter (mm)', '7');
  expect(screen.getByRole('alert').textContent).toBe('The point must be narrower than the thread.');
  expect(screen.getByRole('button', { name: 'Add hardware' }).disabled).toBe(true);
});

it('HardwareFields (tree editor, Place) shows the selects and applies them at once, keyed by field', () => {
  const onChange = vi.fn();
  const feature = hardwareDefaults('self-drilling', 'ST4.8');
  const { rerender } = render(<HardwareFields feature={feature} onChange={onChange} />);
  expect(options('Head style')).toEqual(['hex-washer', 'pan', 'countersunk']);
  // The hex washer head has no recess: no Drive select, no drive size.
  expect(screen.queryByLabelText('Drive')).toBeNull();
  expect(screen.queryByLabelText('Drive size (mm)')).toBeNull();
  const length = screen.getByLabelText('Shank length (mm)');
  select('Head style', 'pan');
  expect(onChange).toHaveBeenCalledOnce();
  const pan = onChange.mock.calls[0][0];
  expect(pan).toMatchObject({ id: feature.id, head: 'pan', drive: 'phillips', headDiameter: 9.5, headHeight: 3.7 });
  rerender(<HardwareFields feature={pan} onChange={onChange} />);
  expect(screen.getByLabelText('Drive').value).toBe('phillips');
  // The same field element: never keyed on its value (Phase L).
  expect(screen.getByLabelText('Shank length (mm)')).toBe(length);
});

// Phase O (docs/sketch-studio-rivet-library.md §7, §10): rivets add State and,
// for the rivet nut / stud, Body; never Drive or Point.
it('a blind rivet lists the blind sizes, Head style and State; no Drive, Point or Body', () => {
  setup();
  select('Hardware type', 'blind-open');
  expect(options('Metric size')).toEqual(['2.4', '3.0', '3.2', '4.0', '4.8', '5.0', '6.0', '6.4']);
  expect(screen.getByLabelText('Metric size').value).toBe('4.8');
  expect(options('Head style')).toEqual(['dome', 'countersunk-120', 'large-flange']);
  expect(options('State')).toEqual(['set', 'unset']);
  expect(screen.getByLabelText('State').value).toBe('set');
  expect(screen.queryByLabelText('Drive')).toBeNull();
  expect(screen.queryByLabelText('Point')).toBeNull();
  expect(screen.queryByLabelText('Body')).toBeNull();
  // A pop rivet comes in aluminium: the material follows the kind default.
  expect(screen.getByLabelText('Hardware material').value).toBe('Aluminum');
  expect(fieldLabels().slice(0, 8)).toEqual([
    'Body length (mm)',
    'Grip / clamped thickness (mm)',
    'Body diameter (mm)',
    'Head diameter (mm)',
    'Head height (mm)',
    'Mandrel diameter (mm)',
    'Bulb diameter (mm)',
    'Bulb height (mm)',
  ]);
  select('Head style', 'large-flange');
  expect(screen.getByLabelText('Flange diameter (mm)').value).toBe('16');
});

it('the rivet nut shows Head style, State, Body and a thread pitch', () => {
  setup();
  select('Hardware type', 'blind-rivet-nut');
  expect(screen.getByLabelText('Metric size').value).toBe('M3');
  select('Metric size', 'M6');
  expect(options('Head style')).toEqual(['flat', 'reduced', 'countersunk']);
  expect(options('State')).toEqual(['set', 'unset']);
  expect(options('Body')).toEqual(['round', 'hex']);
  expect(screen.getByLabelText('Thread pitch (mm)').value).toBe('1');
  expect(screen.getByLabelText('Body diameter (mm)').value).toBe('9');
  select('Body', 'hex');
  expect(screen.getByLabelText('Body across flats (mm)').value).toBe('9');
  // A size change keeps the head, state and body.
  select('Head style', 'countersunk');
  select('State', 'unset');
  select('Metric size', 'M8');
  expect(screen.getByLabelText('Head style').value).toBe('countersunk');
  expect(screen.getByLabelText('State').value).toBe('unset');
  expect(screen.getByLabelText('Body').value).toBe('hex');
  expect(screen.getByLabelText('Flange diameter (mm)').value).toBe('14.5');
});

it('As supplied swaps the bulb height for the mandrel protrusion and keeps a typed grip; bolt restores today', () => {
  const onAdd = setup();
  select('Hardware type', 'blind-open');
  type('Grip / clamped thickness (mm)', '4');
  expect(screen.getByLabelText('Bulb height (mm)')).toBeTruthy();
  expect(screen.queryByLabelText('Mandrel protrusion (mm)')).toBeNull();
  const grip = screen.getByLabelText('Grip / clamped thickness (mm)');
  select('State', 'unset');
  expect(screen.queryByLabelText('Bulb height (mm)')).toBeNull();
  expect(screen.getByLabelText('Mandrel protrusion (mm)').value).toBe('27');
  expect(screen.getByLabelText('Grip / clamped thickness (mm)').value).toBe('4');
  // The same field element: never keyed on its value (Phase L).
  expect(screen.getByLabelText('Grip / clamped thickness (mm)')).toBe(grip);
  select('State', 'set');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(onAdd.mock.calls[0][0]).toMatchObject({
    kind: 'blind-open',
    size: '4.8',
    head: 'dome',
    state: 'set',
    grip: 4,
    material: 'Aluminum',
  });
  select('Hardware type', 'bolt');
  expect(screen.getByLabelText('Metric size').value).toBe('M3');
  expect(screen.queryByLabelText('State')).toBeNull();
  expect(screen.getByLabelText('Hardware material').value).toBe('Steel');
  expect(fieldLabels()).toEqual([
    'Shank length (mm)',
    'Shank diameter (mm)',
    'Head across flats (mm)',
    'Head / flange height (mm)',
    'Thread pitch (mm)',
    'Supplier part number',
    'Supplier installation hole (mm)',
    'Supplier minimum sheet thickness (mm)',
    'Installation / finish notes',
  ]);
});

it('an impossible grip blocks Add with the reason', () => {
  setup();
  select('Hardware type', 'solid');
  expect(screen.getByLabelText('Metric size').value).toBe('4');
  type('Grip / clamped thickness (mm)', '12');
  expect(screen.getByRole('alert').textContent).toBe('The grip must be shorter than the rivet.');
  expect(screen.getByRole('button', { name: 'Add hardware' }).disabled).toBe(true);
});
