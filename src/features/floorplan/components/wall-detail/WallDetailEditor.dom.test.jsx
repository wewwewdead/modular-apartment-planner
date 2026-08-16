/* @vitest-environment jsdom */
/**
 * Clicking a piece of the wall has to answer "what is this, and how big is it?"
 * on the drawing itself. These pin that answer end to end: pick a noggin, a
 * stud, or a board on the canvas and its name, face size, and material appear
 * as a tag on the piece and in the selection inspector.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createFloor, createWall } from '@/domain/models';
import { createWallDetailing, createWallDimension, deriveWallFasteners } from '@/domain/wallDetailing';
import WallDetailEditor from './WallDetailEditor';

const mocks = vi.hoisted(() => ({
  project: null,
  dispatch: vi.fn(),
  editorDispatch: vi.fn(),
  editor: null,
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

// The live 3D pane is lazy and pulls in three.js. Standing in for it keeps the
// suite out of WebGL while recording what the editor asks of it — the whole of
// the highlight contract between the elevation and the pane.
const previewProps = { current: null, pick: null };
vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({
  default: (props) => {
    previewProps.current = props;
    previewProps.pick = props.onAssemblyPick;
    return null;
  },
}));

const CANVAS_RECT = { left: 0, top: 0, width: 900, height: 810, right: 900, bottom: 810, x: 0, y: 0 };

let wallHeight = 0;

beforeEach(() => {
  const floor = createFloor('Ground', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
    assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
  });
  wall.assembly.detailing = createWallDetailing({ enabled: true, sides: { interior: { enabled: true } } });
  floor.walls = [wall];
  wallHeight = wall.height;
  mocks.project = { id: 'project', floors: [floor] };
  mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };
  mocks.dispatch.mockReset();
  mocks.editorDispatch.mockReset();
  // jsdom lays nothing out, so the canvas would report a zero-size box and every
  // pointer-to-wall conversion would come back NaN.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(CANVAS_RECT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every `<title>` on the canvas — the hover answer for each drawn piece. */
const canvasTitles = (container) => Array.from(container.querySelectorAll('title')).map((node) => node.textContent);

/** Every `<text>` on the canvas — where the standing size tag lands. */
const canvasTexts = (container) => Array.from(container.querySelectorAll('text')).map((node) => node.textContent);

function shapeWithTitle(container, startsWith) {
  const title = Array.from(container.querySelectorAll('title')).find((node) => node.textContent.startsWith(startsWith));
  return title?.parentElement || null;
}

function clickShape(shape) {
  const point = { button: 0, pointerId: 1, clientX: 400, clientY: 300 };
  fireEvent.pointerDown(shape, point);
  fireEvent.pointerUp(shape, point);
}

/**
 * Press on a shape, drag it across the canvas, and let go. The default drag is
 * 120 px to the left, which on this wall's inside face — drawn mirrored, as seen
 * standing in front of it — walks the piece 400 mm up the U axis.
 */
function dragShape(shape, { ctrlKey = false, from = { x: 400, y: 300 }, to = { x: 280, y: 300 } } = {}) {
  const base = { button: 0, pointerId: 1, ctrlKey };
  fireEvent.pointerDown(shape, { ...base, clientX: from.x, clientY: from.y });
  fireEvent.pointerMove(shape, { ...base, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(shape, { ...base, clientX: to.x, clientY: to.y });
}

/** The framing config carried by the last committed WALL_UPDATE. */
function committedFraming() {
  const updates = mocks.dispatch.mock.calls.map(([action]) => action);
  return updates.at(-1)?.wall?.assembly?.detailing?.framing || {};
}

const committedMembers = () => committedFraming().members || [];

/** The custom boards carried by the last committed WALL_UPDATE. */
function committedPanels(side = 'interior') {
  const updates = mocks.dispatch.mock.calls.map(([action]) => action);
  const last = updates.at(-1);
  return last?.wall?.assembly?.detailing?.sides?.[side]?.layout?.customPanels || [];
}

/** The hand-placed screws carried by the last committed WALL_UPDATE. */
function committedFasteners(side = 'interior') {
  const updates = mocks.dispatch.mock.calls.map(([action]) => action);
  const last = updates.at(-1);
  return last?.wall?.assembly?.detailing?.sides?.[side]?.fasteners?.manual || [];
}

/** The user's own measurements carried by the last committed WALL_UPDATE. */
function committedDimensions(side = 'interior') {
  const updates = mocks.dispatch.mock.calls.map(([action]) => action);
  const last = updates.at(-1);
  return last?.wall?.assembly?.detailing?.sides?.[side]?.dimensions?.manual || [];
}

/**
 * Switch the wall to timber and leave a custom stud behind that still carries
 * the steel it was created under — the state any moved or copied member is in
 * after the wall's framing material is changed.
 */
function giveWallTimberFramingAndASteelEraStud() {
  const wall = mocks.project.floors[0].walls[0];
  wall.assembly.framing = { ...wall.assembly.framing, material: 'timber' };
  wall.assembly.detailing = createWallDetailing({
    enabled: true,
    sides: { interior: { enabled: true } },
    framing: {
      mode: 'custom',
      members: [
        {
          id: 'legacy-stud',
          kind: 'stud',
          orientation: 'vertical',
          u0: 375,
          u1: 425,
          v0: 0,
          v1: 3000,
          depth: 75,
          material: 'light_gauge_steel',
        },
      ],
    },
  });
}

/** Put one of the user's own measurements on the wall before rendering. */
function giveWallAMeasurement() {
  const wall = mocks.project.floors[0].walls[0];
  wall.assembly.detailing = createWallDetailing({
    enabled: true,
    sides: {
      interior: {
        enabled: true,
        dimensions: {
          manual: [
            createWallDimension({
              mode: 'horizontal',
              start: { u: 200, v: 1000 },
              end: { u: 1200, v: 1000 },
            }),
          ],
        },
      },
    },
  });
}

describe('WallDetailEditor selection size readout', () => {
  it('tags a clicked noggin with its name, face size, and material', () => {
    const { container } = render(<WallDetailEditor />);

    const noggin = shapeWithTitle(container, 'Noggin ·');
    expect(noggin).not.toBeNull();
    // Nothing is selected yet, so no size tag is standing on the drawing.
    expect(canvasTexts(container)).not.toContain('Noggin');

    clickShape(noggin);

    const texts = canvasTexts(container);
    expect(texts).toContain('Noggin');
    // The single noggin row spans the full 3000 mm wall and is one stud wide.
    expect(texts).toContain('3000 × 50 mm');
    expect(texts).toContain('Light-gauge steel · 75 mm deep');

    // The tag is pinned to the piece: centred on the noggin's own mid-span.
    const sizeText = Array.from(container.querySelectorAll('text')).find((node) => node.textContent === '3000 × 50 mm');
    expect(Number(sizeText.getAttribute('x'))).toBeCloseTo(1500);
  });

  it('tags a clicked stud with its height up the wall', () => {
    const { container } = render(<WallDetailEditor />);

    clickShape(shapeWithTitle(container, 'Stud ·'));

    const texts = canvasTexts(container);
    expect(texts).toContain('Stud');
    expect(texts.some((text) => text.endsWith(`× ${wallHeight} mm`))).toBe(true);
  });

  it('tags a clicked board with its sheet size and what it is cut from', () => {
    const { container } = render(<WallDetailEditor />);

    const board = shapeWithTitle(container, 'P1 ·');
    expect(board).not.toBeNull();

    clickShape(board);

    const texts = canvasTexts(container);
    expect(texts).toContain('P1');
    expect(texts).toContain('Fiber cement · 6 mm');
  });

  it('repeats the size in the selection inspector and the status bar', () => {
    const { container } = render(<WallDetailEditor />);

    expect(container.textContent).toContain('Nothing selected');

    clickShape(shapeWithTitle(container, 'Noggin ·'));

    // Friendly kind name, not the raw `noggin` key.
    expect(container.textContent).toContain('Selected framing — Noggin');
    expect(container.textContent).toContain('Width across the wall × height up from the finished floor');
    expect(container.textContent).toContain('frame member selected · 3000 × 50 mm');
  });

  it('answers the same question on hover, before anything is selected', () => {
    const { container } = render(<WallDetailEditor />);

    const titles = canvasTitles(container);
    expect(titles.some((title) => title.startsWith('Noggin · 3000 × 50 mm · Light-gauge steel · 75 mm deep'))).toBe(
      true,
    );
    expect(titles.some((title) => title.startsWith('P1 · ') && title.endsWith('Fiber cement · 6 mm'))).toBe(true);
  });

  it('names the copy in the pointer readout during a Ctrl-drag', () => {
    const { container } = render(<WallDetailEditor />);
    const stud = shapeWithTitle(container, 'Stud ·');

    fireEvent.pointerDown(stud, { button: 0, pointerId: 1, ctrlKey: true, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(stud, { button: 0, pointerId: 1, ctrlKey: true, clientX: 520, clientY: 300 });

    expect(canvasTexts(container)).toContain('Copy of frame member');
    // Mid-drag the standing size tag steps aside for the live pointer readout.
    expect(canvasTexts(container)).not.toContain('Stud');
  });

  it('reports the wall’s current framing material, not the one a custom stud was built under', () => {
    giveWallTimberFramingAndASteelEraStud();
    const { container } = render(<WallDetailEditor />);

    const stud = shapeWithTitle(container, 'Stud ·');
    expect(stud.querySelector('title').textContent).toContain('Timber · 75 mm deep');

    clickShape(stud);

    expect(canvasTexts(container)).toContain('Timber · 75 mm deep');
    expect(canvasTexts(container)).not.toContain('Light-gauge steel · 75 mm deep');
    expect(container.textContent).toContain('Timber · 75 mm deep');
  });

  it('drops the tag when the layer holding the selected piece is hidden', () => {
    const { container, getByLabelText } = render(<WallDetailEditor />);

    clickShape(shapeWithTitle(container, 'Noggin ·'));
    expect(canvasTexts(container)).toContain('Noggin');

    fireEvent.click(getByLabelText('Framing'));

    expect(canvasTexts(container)).not.toContain('Noggin');
    // The inspector still holds the numbers for the piece that is now hidden.
    expect(container.textContent).toContain('Selected framing — Noggin');
  });
});

describe('WallDetailEditor remove all screws', () => {
  /** How many screws the wall would draw for the committed detailing. */
  const drawnScrewCount = () => {
    const floor = mocks.project.floors[0];
    const committed = mocks.dispatch.mock.calls.map(([action]) => action).at(-1);
    const wall = { ...floor.walls[0], assembly: committed.wall.assembly };
    return deriveWallFasteners(wall, floor, 'interior').length;
  };

  it('clears every screw on the face in one undoable step', () => {
    const { container, getByText } = render(<WallDetailEditor />);
    // The wall starts fully fixed off the generated pattern.
    expect(canvasTitles(container).filter((title) => title.startsWith('Screw ·')).length).toBeGreaterThan(100);

    fireEvent.click(getByText('Remove all screws'));

    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(drawnScrewCount()).toBe(0);
  });

  it('takes the pencil guides with it, so the screws cannot redraw themselves', () => {
    const { getByText } = render(<WallDetailEditor />);

    // Lay a measured screw row on every board, then clear the lot.
    fireEvent.click(getByText('Trace all panel perimeters'));
    const guided = mocks.dispatch.mock.calls.at(-1)[0].wall.assembly.detailing.sides.interior.fasteners;
    expect(guided.guides.length).toBeGreaterThan(0);
    mocks.project.floors[0].walls[0].assembly = mocks.dispatch.mock.calls.at(-1)[0].wall.assembly;
    cleanup();

    const second = render(<WallDetailEditor />);
    expect(canvasTitles(second.container).filter((title) => title.startsWith('Screw ·')).length).toBeGreaterThan(0);
    fireEvent.click(second.getByText('Remove all screws'));

    const cleared = mocks.dispatch.mock.calls.at(-1)[0].wall.assembly.detailing.sides.interior.fasteners;
    expect(cleared.guides).toEqual([]);
    expect(cleared.manual).toEqual([]);
    expect(drawnScrewCount()).toBe(0);
  });

  it('offers nothing to press once the face is bare', () => {
    const { getByText } = render(<WallDetailEditor />);

    fireEvent.click(getByText('Remove all screws'));
    mocks.project.floors[0].walls[0].assembly = mocks.dispatch.mock.calls.at(-1)[0].wall.assembly;
    cleanup();

    const second = render(<WallDetailEditor />);
    expect(second.getByText('Remove all screws').disabled).toBe(true);
  });
});

describe('WallDetailEditor Ctrl-drag copy', () => {
  it('leaves the original stud in place and adds the dragged copy', () => {
    const { container } = render(<WallDetailEditor />);
    const stud = shapeWithTitle(container, 'Stud · 50 × 3000 mm · Light-gauge steel · 75 mm deep · centre U 400');

    dragShape(stud, { ctrlKey: true });

    // The generated frame is left generated — the copy is one extra member on
    // top of it, so changing stud spacing still regenerates the rest.
    expect(committedFraming().mode).toBe('automatic');
    const members = committedMembers();
    expect(members).toHaveLength(1);
    // Same section, same full height, 400 mm further along the wall.
    const [copy] = members;
    expect(copy.kind).toBe('stud');
    expect(copy.u1 - copy.u0).toBe(50);
    expect(copy.v1 - copy.v0).toBe(3000);
    expect((copy.u0 + copy.u1) / 2).toBeCloseTo(800);
    expect(copy.custom).toBe(true);
  });

  it('moves rather than copies without the modifier', () => {
    const { container } = render(<WallDetailEditor />);
    const stud = shapeWithTitle(container, 'Stud · 50 × 3000 mm · Light-gauge steel · 75 mm deep · centre U 400');

    dragShape(stud);

    const members = committedMembers();
    expect(members).toHaveLength(12);
    expect(members.filter((member) => member.kind === 'stud' && (member.u0 + member.u1) / 2 === 400)).toHaveLength(0);
  });

  it('copies a guide-driven screw into a free hand-placed one', () => {
    const { container } = render(<WallDetailEditor />);
    const screw = shapeWithTitle(container, 'Screw · U 12 · V 50 mm');
    expect(screw).not.toBeNull();

    // Straight up the wall, into the gap between two guide stations.
    dragShape(screw, { ctrlKey: true, to: { x: 400, y: 270 } });

    const screws = committedFasteners();
    expect(screws).toHaveLength(1);
    // The copy answers to nothing but its own coordinates — the pencil guide
    // that placed the original does not own it.
    expect(screws[0].guideId).toBeNull();
    expect(screws[0].v).toBeCloseTo(150);
    // U snapped onto the end stud's centre line, as any dragged screw does.
    expect(screws[0].u).toBeCloseTo(12.5);
  });

  it('will not stack a copied screw on one that is already there', () => {
    const { container } = render(<WallDetailEditor />);

    // This drag lands the copy exactly on the field screw at the stud centre.
    dragShape(shapeWithTitle(container, 'Screw · U 12 · V 50 mm'), { ctrlKey: true });

    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('copies one of the user’s own measurements, cutting the copy loose from its snaps', () => {
    giveWallAMeasurement();
    const { container } = render(<WallDetailEditor />);

    dragShape(shapeWithTitle(container, 'User dimension · '), { ctrlKey: true, to: { x: 400, y: 240 } });

    const measurements = committedDimensions();
    expect(measurements).toHaveLength(2);
    const copy = measurements.at(-1);
    expect(copy.id).not.toBe(measurements[0].id);
    // Same run, moved up the wall, and no longer claiming the original's
    // associations to the geometry it was snapped to.
    expect(copy.end.u - copy.start.u).toBeCloseTo(1000);
    expect(copy.start.v).toBeGreaterThan(measurements[0].start.v);
    expect(copy.startRef).toBeNull();
    expect(copy.endRef).toBeNull();
  });

  it('copies a board and lets the copy take the next number rather than the original name', () => {
    const { container } = render(<WallDetailEditor />);
    const board = shapeWithTitle(container, 'P1 ·');

    dragShape(board, { ctrlKey: true });

    const boards = committedPanels();
    // Six generated boards materialised as custom, plus the copy.
    expect(boards).toHaveLength(7);
    expect(boards.filter((panel) => panel.label === 'P1')).toHaveLength(1);
    // Blank label, so the copy is numbered in sequence instead of a second P1.
    expect(boards.at(-1).label).toBe('');
    expect(boards.at(-1).width).toBe(boards[0].width);
    expect(boards.at(-1).height).toBe(boards[0].height);
    expect(boards.at(-1).u).not.toBe(boards[0].u);
  });
});

/**
 * The elevation and the live 3D pane are two views of one selection. A stud
 * picked on the drawing has to light up in the pane — in the editor's orange,
 * not the plan's green — and a board picked in the pane has to come back and
 * select itself on the drawing.
 */
describe('WallDetailEditor selection shared with the 3D pane', () => {
  it('hands the pane the piece picked on the elevation, with the face it is on', () => {
    const { container } = render(<WallDetailEditor />);

    expect(previewProps.current.selectionAccent).toBe('assembly');
    expect(previewProps.current.assemblySelection).toBeNull();

    clickShape(shapeWithTitle(container, 'Stud ·'));

    expect(previewProps.current.assemblySelection).toMatchObject({ kind: 'framing', side: 'interior' });
    expect(typeof previewProps.current.assemblySelection.id).toBe('string');
  });

  it('takes a pick made in the pane back to the elevation, turning it around if need be', () => {
    render(<WallDetailEditor />);

    act(() => previewProps.pick({ kind: 'panel', id: 'P1', side: 'interior' }));
    expect(previewProps.current.assemblySelection).toEqual({ kind: 'panel', id: 'P1', side: 'interior' });

    // A board on the far face turns the drawing around rather than selecting
    // something it cannot show.
    act(() => previewProps.pick({ kind: 'panel', id: 'P2', side: 'exterior' }));
    expect(previewProps.current.assemblySelection).toEqual({ kind: 'panel', id: 'P2', side: 'exterior' });

    act(() => previewProps.pick(null));
    expect(previewProps.current.assemblySelection).toBeNull();
  });
});
