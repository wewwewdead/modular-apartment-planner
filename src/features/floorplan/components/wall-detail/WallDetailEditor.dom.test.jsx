/* @vitest-environment jsdom */
/**
 * Clicking a piece of the wall has to answer "what is this, and how big is it?"
 * on the drawing itself. These pin that answer end to end: pick a noggin, a
 * stud, or a board on the canvas and its name, face size, and material appear
 * as a tag on the piece and in the selection inspector.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { createFloor, createSlab, createWall } from '@/domain/models';
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
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
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

describe('WallDetailEditor over a storey line', () => {
  it('draws the deck a bypass wall runs past and frames the whole resolved span', () => {
    const floor = mocks.project.floors[0];
    floor.elevation = 3000;
    floor.floorToFloorHeight = 3000;
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: -500, y: -500 },
          { x: 3500, y: -500 },
          { x: 3500, y: 500 },
          { x: -500, y: 500 },
        ],
        250,
        3000,
        { name: 'Level 2 deck' },
      ),
    ];
    floor.walls = [{ ...floor.walls[0], framingMode: 'bypass' }];

    const { container } = render(<WallDetailEditor />);

    // The deck reads on the drawing as a named datum band, which is the only
    // thing that explains why the studs carry on past the floor line.
    expect(canvasTexts(container).some((text) => text.startsWith('Level 2 deck'))).toBe(true);
    expect(canvasTitles(container).some((title) => title.startsWith('Level 2 deck ·'))).toBe(true);
    expect(canvasTitles(container).some((title) => title.startsWith('Ledger ·'))).toBe(true);

    // 250 of drop under a 3000 storey: one frame 3250 tall, not the wall's own
    // stored height.
    expect(wallHeight).not.toBe(3250);
    expect(canvasTitles(container).some((title) => title.startsWith('Stud · 50 × 3250 mm'))).toBe(true);
  });
});

/**
 * The corner detail inside the wall editor.
 *
 * The same two stored numbers the wall properties panel writes, editable here
 * and drawn here — and the drawing has to make the overhang read as PAST the
 * end of the wall rather than as a longer wall, or the number means nothing.
 */
describe('board overhang in the wall detail editor', () => {
  /** The number input under a given field label in the side panel. */
  function fieldInput(container, label) {
    const field = [...container.querySelectorAll('label')].find(
      (node) => node.firstElementChild?.textContent?.trim() === label,
    );
    return field?.querySelector('input') || null;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

  // Typed and then blurred, which is what the signed field commits on: a lone
  // minus is not a number, so a per-keystroke commit would write zero back over
  // the box before the digits arrived.
  function type(input, text) {
    fireEvent.focus(input);
    for (let index = 1; index <= text.length; index += 1) {
      fireEvent.keyDown(input, { key: text[index - 1] });
      nativeSetter.call(input, text.slice(0, index));
      fireEvent.input(input, { inputType: 'insertText' });
    }
    fireEvent.blur(input);
  }

  /** The assembly carried by the last committed WALL_UPDATE. */
  const committedAssembly = () => mocks.dispatch.mock.calls.map(([action]) => action).at(-1)?.wall?.assembly;

  function lapTheWall(overhang) {
    const wall = mocks.project.floors[0].walls[0];
    wall.assembly = { ...wall.assembly, interior: { material: 'fiber_cement', thickness: 6, ...overhang } };
  }

  it('writes the same assembly fields the properties panel writes', () => {
    const { container } = render(<WallDetailEditor />);

    type(fieldInput(container, 'Overhang end'), '137');

    expect(committedAssembly().interior).toMatchObject({ overhangEnd: 137, overhangStart: 0 });
    // Cladding only: a board that runs further leaves the wall the same thickness.
    expect(mocks.dispatch.mock.calls.at(-1)[0].wall.thickness).toBe(87);
  });

  it('takes a setback, which a per-keystroke field could not accept at all', () => {
    const { container } = render(<WallDetailEditor />);

    type(fieldInput(container, 'Overhang start'), '-90');

    expect(committedAssembly().interior.overhangStart).toBe(-90);
  });

  it('reads back what is stored, for the face being edited', () => {
    lapTheWall({ overhangStart: 40, overhangEnd: -25 });
    const { container } = render(<WallDetailEditor />);

    expect(fieldInput(container, 'Overhang start').value).toBe('40');
    expect(fieldInput(container, 'Overhang end').value).toBe('-25');
  });

  it('draws nothing extra for a board that stops where its wall does', () => {
    const { container } = render(<WallDetailEditor />);

    expect(container.querySelector('[data-testid="board-overhang"]')).toBeNull();
    // The canvas is exactly the wall: 3000 × its height, starting at zero.
    expect(container.querySelector('svg[data-tool]').getAttribute('viewBox')).toBe(`0 0 3000 ${wallHeight}`);
  });

  it('widens the canvas over the overhang and marks where the wall stops', () => {
    lapTheWall({ overhangEnd: 200 });
    const { container } = render(<WallDetailEditor />);

    const marker = container.querySelector('[data-testid="board-overhang"]');
    expect(marker).not.toBeNull();
    expect(marker.querySelector('[data-edge="end"][data-kind="overhang"]')).not.toBeNull();
    // The board reaches 200 past u = 3000. This face is drawn mirrored — seen
    // from in front of it — so the extra 200 lands on the LEFT of the drawing,
    // and the viewBox has to start there or the overhang is off the page.
    expect(container.querySelector('svg[data-tool]').getAttribute('viewBox')).toBe(`-200 0 3200 ${wallHeight}`);
    expect(canvasTitles(container).some((title) => title.startsWith('Wall end · Board over 200'))).toBe(true);
  });

  /*
   * The face the bug report was about: boards drawn by hand, THEN an overhang.
   * The drawing has to put cladding in the strip it just widened over — a band
   * with nothing in it is exactly the "nothing was added" the user saw — and the
   * numbers it stores have to stay on the wall's own run, so the lap is still
   * derived and still follows the overhang the next time it changes.
   */
  it('fills the lap with the boards the user drew, and stores them without it', () => {
    lapTheWall({ overhangEnd: 200 });
    const face = mocks.project.floors[0].walls[0].assembly.detailing.sides.interior;
    face.layout = {
      ...face.layout,
      mode: 'custom',
      customPanels: [
        { id: 'left', u: 0, v: 0, width: 1500, height: 2400 },
        { id: 'right', u: 1500, v: 0, width: 1500, height: 2400 },
      ],
    };
    const { container } = render(<WallDetailEditor />);

    const right = shapeWithTitle(container, 'P2 ·');
    expect(Number(right.getAttribute('x')) + Number(right.getAttribute('width'))).toBe(3200);
    // The board that reaches neither end is where it was drawn.
    const left = shapeWithTitle(container, 'P1 ·');
    expect(Number(left.getAttribute('x')) + Number(left.getAttribute('width'))).toBe(1500);

    fireEvent.click(
      [...container.querySelectorAll('button')].find(
        (node) => node.title === 'Turn the generated grid into editable panels',
      ),
    );

    expect(Math.max(...committedPanels().map((panel) => panel.u + panel.width))).toBe(3000);
  });

  it('reads a setback as wall with no board on it rather than as an overhang', () => {
    lapTheWall({ overhangStart: -150 });
    const { container } = render(<WallDetailEditor />);

    const marker = container.querySelector('[data-testid="board-overhang"]');
    expect(marker.querySelector('[data-edge="start"][data-kind="setback"]')).not.toBeNull();
    // Nothing runs past the wall, so the canvas is still just the wall.
    expect(container.querySelector('svg[data-tool]').getAttribute('viewBox')).toBe(`0 0 3000 ${wallHeight}`);
    expect(canvasTitles(container).some((title) => title.startsWith('Wall start · Board set back 150'))).toBe(true);
  });
});

/**
 * At fit zoom one pixel of this canvas is about 3.3 mm of wall, so a hand that
 * drifts a pixel between press and release has moved the piece by more than a
 * millimetre. Committing that as a move rewrites a generated board, stud or
 * screw layout as custom and freezes the whole pattern — so whether the pointer
 * moved is judged on screen, not in millimetres.
 */
describe('WallDetailEditor clicking a piece on the elevation', () => {
  const at = { button: 0, pointerId: 1, clientX: 400, clientY: 300 };

  it('selects the board and commits nothing, though the pointer drifts a pixel', () => {
    const { container } = render(<WallDetailEditor />);
    const board = shapeWithTitle(container, 'P1 ·');

    fireEvent.pointerDown(board, at);
    fireEvent.pointerUp(board, { ...at, clientX: 401 });

    expect(container.textContent).toContain('board panel selected');
    // Any dispatch here is a move nobody made: the only edit a click can make is
    // to the selection, which the editor holds itself.
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('ignores a drag too small to see, and still commits one that is not', () => {
    const { container } = render(<WallDetailEditor />);
    const stud = shapeWithTitle(container, 'Stud · 50 × 3000 mm · Light-gauge steel · 75 mm deep · centre U 400');

    fireEvent.pointerDown(stud, at);
    fireEvent.pointerUp(stud, { ...at, clientX: 400.5 });
    expect(mocks.dispatch).not.toHaveBeenCalled();

    dragShape(stud);
    expect(committedFraming().mode).toBe('custom');
  });

  it('leaves a measurement where it was when the pointer drifts a pixel', () => {
    giveWallAMeasurement();
    const { container } = render(<WallDetailEditor />);
    const measurement = shapeWithTitle(container, 'User dimension · ');

    fireEvent.pointerDown(measurement, at);
    fireEvent.pointerUp(measurement, { ...at, clientY: 301 });
    expect(container.textContent).toContain('measurement selected');
    expect(mocks.dispatch).not.toHaveBeenCalled();

    dragShape(measurement, { to: { x: 400, y: 240 } });
    expect(committedDimensions()[0].start.v).toBeGreaterThan(1000);
  });
});

/**
 * A trace or a measurement is drawn on one face. Turning the elevation to the
 * other face — from the face buttons or by picking a board in the 3D pane — has
 * to drop it, or its next click lands on a face it was never started on.
 */
describe('WallDetailEditor turning to the other face mid-drawing', () => {
  const canvas = (container) => container.querySelector('svg[data-tool]');
  const tracePreview = (container) => container.querySelector('svg[data-tool] polyline[data-preview="trace"]');
  const acquisitionMarker = (container) => container.querySelector('svg[data-tool] g[data-snapped]');
  const outsideButton = (container) =>
    [...container.querySelectorAll('button')].find((node) => node.textContent === 'Outside face');

  function startTrace(container) {
    fireEvent.click(container.querySelector('button[title^="Trace cut panel"]'));
    fireEvent.pointerDown(canvas(container), { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(canvas(container), { button: 0, pointerId: 1, clientX: 500, clientY: 300 });
    expect(tracePreview(container)).not.toBeNull();
  }

  it('drops a half-drawn trace when the other face is chosen', () => {
    const { container } = render(<WallDetailEditor />);
    startTrace(container);

    fireEvent.click(outsideButton(container));

    expect(tracePreview(container)).toBeNull();
  });

  it('drops a measurement waiting for its second click when the other face is chosen', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.click(container.querySelector('button[title^="Draw measurement"]'));
    const press = { button: 0, pointerId: 1, clientX: 300, clientY: 300 };
    fireEvent.pointerDown(canvas(container), press);
    fireEvent.pointerUp(canvas(container), press);
    expect(acquisitionMarker(container)).not.toBeNull();

    fireEvent.click(outsideButton(container));

    expect(acquisitionMarker(container)).toBeNull();
  });

  it('drops a half-drawn trace when a pick in the 3D pane turns the elevation around', () => {
    const { container } = render(<WallDetailEditor />);
    startTrace(container);

    act(() => previewProps.pick({ kind: 'panel', id: 'P2', side: 'exterior' }));

    expect(previewProps.current.assemblySelection).toEqual({ kind: 'panel', id: 'P2', side: 'exterior' });
    expect(tracePreview(container)).toBeNull();
  });

  it('keeps the trace for a pick on the face already in front of you', () => {
    const { container } = render(<WallDetailEditor />);
    startTrace(container);

    act(() => previewProps.pick({ kind: 'panel', id: 'P1', side: 'interior' }));

    expect(tracePreview(container)).not.toBeNull();
  });
});

/**
 * Escape in a number field belongs to the field — it throws the typed draft
 * away — and must not also cancel the trace open on the drawing.
 */
describe('WallDetailEditor Escape while a trace is open', () => {
  it('leaves the trace alone when Escape is pressed in a field, and cancels it otherwise', () => {
    const { container } = render(<WallDetailEditor />);
    const svg = container.querySelector('svg[data-tool]');
    fireEvent.click(container.querySelector('button[title^="Trace cut panel"]'));
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    const tracePreview = () => container.querySelector('svg[data-tool] polyline[data-preview="trace"]');
    expect(tracePreview()).not.toBeNull();

    const field = container.querySelector('input[type="number"]');
    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(tracePreview()).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tracePreview()).toBeNull();
  });
});

describe('a finished face in the wall detail editor (docs/wall-cladding-finishes.md §5.5)', () => {
  it('fills the boards with the finish knocked back for the drawing, and keeps the stock tint otherwise', () => {
    const stock = render(<WallDetailEditor />);
    expect(shapeWithTitle(stock.container, 'P1 ·').getAttribute('fill')).toBe('#dedbd1');
    cleanup();

    const wall = mocks.project.floors[0].walls[0];
    wall.assembly = {
      ...wall.assembly,
      interior: {
        ...wall.assembly.interior,
        finish: {
          kind: 'paint',
          colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
          sheen: 'matte',
        },
      },
    };
    const { container } = render(<WallDetailEditor />);
    expect(shapeWithTitle(container, 'P1 ·').getAttribute('fill')).toBe('#ECBD99');
  });
});

describe('a siding face in the wall detail editor (spec §6.1)', () => {
  function sideTheWall(course) {
    const wall = mocks.project.floors[0].walls[0];
    wall.assembly = {
      ...wall.assembly,
      interior: { material: 'siding', thickness: 19, layerCount: 1, ...(course ? { course } : {}) },
    };
    return wall;
  }

  it('draws one field, its course lines from the set-out, clipped to the boards', () => {
    sideTheWall();
    const { container } = render(<WallDetailEditor />);
    const group = container.querySelector('[data-siding-courses="interior"]');
    expect(group).not.toBeNull();
    const path = group.querySelector('path[clip-path]');
    // 146 mm courses on a wall standing at elevation 0, wallHeight tall: a line
    // at every 146 up to the top.
    const lines = path.getAttribute('d').match(/M /g).length;
    expect(lines).toBe(Math.floor(wallHeight / 146) + 1);
    expect(path.getAttribute('d').startsWith('M 0 0 H 3000')).toBe(true);
    // The clip is the panel field, so the openings cut the lines too.
    expect(group.querySelectorAll('path[clip-rule="evenodd"]').length).toBeGreaterThan(0);
    expect(shapeWithTitle(container, 'P1 ·')).not.toBeNull();
    expect(shapeWithTitle(container, 'P2 ·')).toBeNull();
  });

  it('runs vertical boards as full-height lines along the wall', () => {
    sideTheWall({ orientation: 'vertical', exposure: 140, joint: 6 });
    const { container } = render(<WallDetailEditor />);
    const d = container.querySelector('[data-siding-courses="interior"] path[clip-path]').getAttribute('d');
    expect(d).toMatch(new RegExp(`^M 0 0 V ${wallHeight}`));
    expect(d.match(/M /g).length).toBe(Math.floor(3000 / 146) + 1);
  });

  it('draws no course lines on a sheet face', () => {
    const { container } = render(<WallDetailEditor />);
    expect(container.querySelector('[data-siding-courses]')).toBeNull();
  });
});

describe('accent panels in the wall detail editor (spec §7.1)', () => {
  const ORANGE = {
    kind: 'paint',
    colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
    sheen: 'matte',
  };
  const canvas = (container) => container.querySelector('svg[data-tool]');
  const lastAction = () => mocks.dispatch.mock.calls.at(-1)?.[0];
  const committedAccents = () => lastAction()?.wall?.assembly?.interior?.accents;

  function seed(accents, { windows = [] } = {}) {
    const floor = mocks.project.floors[0];
    const wall = floor.walls[0];
    wall.assembly = { ...wall.assembly, interior: { ...wall.assembly.interior, accents } };
    floor.windows = windows;
    return wall;
  }

  it('draws a new accent with the Accent tool, in Signal Orange, as an assembly-only edit', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.click(container.querySelector('button[title^="Draw accent panel"]'));
    expect(canvas(container).getAttribute('data-tool')).toBe('draw_accent');
    const svg = canvas(container);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(svg, { button: 0, pointerId: 1, clientX: 450, clientY: 450 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: 450, clientY: 450 });

    expect(lastAction().type).toBe('WALL_UPDATE');
    expect(Object.keys(lastAction().wall)).toEqual(['id', 'assembly']);
    const [accent] = committedAccents();
    expect(accent.finish).toEqual(ORANGE);
    expect(accent.width).toBeGreaterThan(100);
    expect(accent.height).toBeGreaterThan(100);
    expect(accent.anchor).toBeNull();
  });

  it('takes the A key for the tool', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(canvas(container).getAttribute('data-tool')).toBe('draw_accent');
  });

  it('draws a stored accent in its drawing tint, selects it, and deletes it with the Delete key', () => {
    seed([{ id: 'acc', label: 'Beside', u: 400, v: 900, width: 600, height: 800, finish: ORANGE }]);
    const { container } = render(<WallDetailEditor />);
    const rect = container.querySelector('[data-accent-id="acc"]');
    expect(rect.getAttribute('fill')).toBe('#ECBD99');
    expect(rect.getAttribute('width')).toBe('600');

    fireEvent.pointerDown(rect, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(rect, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    expect(container.querySelector('[data-selected-accent="acc"]')).not.toBeNull();
    expect(container.querySelector('[data-accent-id="acc"]').getAttribute('data-selected')).toBe('true');
    // A click is not a move.
    expect(mocks.dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(lastAction().wall.assembly.interior).not.toHaveProperty('accents');
  });

  it('moves an accent with one edit on release', () => {
    seed([{ id: 'acc', u: 400, v: 900, width: 600, height: 800, finish: ORANGE }]);
    const { container } = render(<WallDetailEditor />);
    const rect = container.querySelector('[data-accent-id="acc"]');
    fireEvent.pointerDown(rect, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(rect, { button: 0, pointerId: 1, clientX: 280, clientY: 300 });
    // The drag is local until it lands: nothing is committed while it moves.
    expect(mocks.dispatch).not.toHaveBeenCalled();
    fireEvent.pointerUp(rect, { button: 0, pointerId: 1, clientX: 280, clientY: 300 });
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    // The inside face is drawn mirrored: 120 px left is 400 mm up the wall.
    expect(committedAccents()[0]).toMatchObject({ u: 800, v: 900, width: 600, height: 800 });
  });

  it('edits the exact fields: colour, and attaching to an opening', () => {
    seed([{ id: 'acc', u: 400, v: 900, width: 600, height: 800, finish: ORANGE }], {
      windows: [
        {
          id: 'win',
          wallId: mocks.project.floors[0].walls[0].id,
          offset: 1800,
          width: 900,
          height: 1200,
          sillHeight: 900,
        },
      ],
    });
    const { container } = render(<WallDetailEditor />);
    const rect = container.querySelector('[data-accent-id="acc"]');
    fireEvent.pointerDown(rect, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(rect, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    const card = container.querySelector('[data-selected-accent="acc"]');
    const select = (label) =>
      [...card.querySelectorAll('label')]
        .find((node) => node.firstElementChild?.textContent === label)
        .querySelector('select');

    fireEvent.change(select('Colour'), { target: { value: 'facade:Slate Blue' } });
    expect(committedAccents()[0].finish.colour).toEqual({ hex: '#6F8597', name: 'Slate Blue', catalogue: 'facade' });

    fireEvent.change(select('Attach to'), { target: { value: 'win' } });
    // Attached where it stands: the window is 1350 → 2250 along, 900 up.
    expect(committedAccents()[0]).toMatchObject({ u: 400, v: 900, anchor: { openingId: 'win', du: -950, dv: 0 } });
  });

  it('adds an anchored accent beside an opening', () => {
    seed(undefined, {
      windows: [
        {
          id: 'win',
          wallId: mocks.project.floors[0].walls[0].id,
          offset: 1800,
          width: 900,
          height: 1200,
          sillHeight: 900,
        },
      ],
    });
    const { container } = render(<WallDetailEditor />);
    const section = container.querySelector('[data-accent-at-opening="true"]');
    const field = (label) =>
      [...section.querySelectorAll('label')].find((node) => node.firstElementChild?.textContent === label);
    fireEvent.change(field('Placement').querySelector('select'), { target: { value: 'right' } });
    fireEvent.click(
      [...section.querySelectorAll('button')].find((node) => node.textContent === 'Add accent at opening'),
    );
    expect(committedAccents()).toEqual([
      expect.objectContaining({
        u: 2250,
        v: 900,
        width: 600,
        height: 1200,
        anchor: { openingId: 'win', du: 900, dv: 0 },
      }),
    ]);
  });

  it('offers no accents on a face with no board, and says so', () => {
    const wall = mocks.project.floors[0].walls[0];
    wall.assembly = { ...wall.assembly, interior: { material: 'none', thickness: 0, layerCount: 0 } };
    const { container } = render(<WallDetailEditor />);
    expect(container.querySelector('button[title^="Draw accent panel"]').disabled).toBe(true);
    expect(container.textContent).toContain('No accents on this face');
    fireEvent.keyDown(window, { key: 'a' });
    expect(canvas(container).getAttribute('data-tool')).not.toBe('draw_accent');
  });
});

/**
 * The left panel is the workflow (docs/assembly-editor-ui.md §2.3): one step
 * open at a time, every body still mounted (hidden) so nothing is lost, and a
 * Next button walking to the following required step. The right panel's
 * sections stay independent, and Selection is always open.
 */
describe('WallDetailEditor workflow steps', () => {
  const header = (container, id) => container.querySelector(`button[aria-controls="wall-detail-${id}"]`);
  const body = (container, id) => container.querySelector(`#wall-detail-${id}`);
  const LEFT_STEPS = ['face', 'assembly', 'panels', 'accents', 'framing', 'fasteners', 'dimensions'];
  const openSteps = (container) =>
    LEFT_STEPS.filter((id) => header(container, id).getAttribute('aria-expanded') === 'true');

  it('opens one step at a time and keeps every body mounted', () => {
    const { container } = render(<WallDetailEditor />);
    expect(openSteps(container)).toEqual(['face']);

    fireEvent.click(header(container, 'framing'));
    expect(openSteps(container)).toEqual(['framing']);
    expect(body(container, 'face').hidden).toBe(true);
    expect(body(container, 'framing').hidden).toBe(false);
    // Closed bodies are hidden, not unmounted: their controls are still there.
    expect(body(container, 'panels').querySelector('select')).not.toBeNull();

    fireEvent.click(header(container, 'framing'));
    expect(openSteps(container)).toEqual([]);
  });

  it('walks to the next required step, skipping the optional one', () => {
    const { container, getByText } = render(<WallDetailEditor />);
    fireEvent.click(getByText('Next: Complete wall assembly'));
    expect(openSteps(container)).toEqual(['assembly']);

    fireEvent.click(header(container, 'panels'));
    fireEvent.click(within(body(container, 'panels')).getByText('Next: Framing'));
    expect(openSteps(container)).toEqual(['framing']);
    // The last step has nowhere to go.
    expect(body(container, 'dimensions').textContent).not.toContain('Next:');
  });

  it('leaves the right panel alone, and never folds Selection away', () => {
    const { container } = render(<WallDetailEditor />);
    const takeoffOpen = () => header(container, 'takeoff').getAttribute('aria-expanded');
    expect(takeoffOpen()).toBe('true');

    fireEvent.click(header(container, 'framing'));
    expect(takeoffOpen()).toBe('true');
    fireEvent.click(header(container, 'takeoff'));
    expect(takeoffOpen()).toBe('false');
    expect(openSteps(container)).toEqual(['framing']);

    expect(header(container, 'selection')).toBeNull();
    expect(body(container, 'selection').hidden).toBe(false);
  });
});

/**
 * The Layers / Export / "?" popovers and the editor both want Escape
 * (docs/assembly-editor-ui.md §2.6). An open popover takes it — it closes and
 * the armed tool stays armed — and a closed one never swallows it.
 */
describe('WallDetailEditor popovers and Escape', () => {
  const canvas = (container) => container.querySelector('svg[data-tool]');
  const layersTrigger = (container) =>
    [...container.querySelectorAll('button[aria-haspopup]')].find((node) => node.textContent.startsWith('Layers'));

  it('closes an open popover on Escape without returning the tool to Select', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.click(container.querySelector('button[title^="Draw stud"]'));
    expect(canvas(container).getAttribute('data-tool')).toBe('draw_stud');

    const trigger = layersTrigger(container);
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(trigger.getAttribute('aria-controls'));
    expect(panel.hidden).toBe(false);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(canvas(container).getAttribute('data-tool')).toBe('draw_stud');

    // Closed, it lets Escape through: the editor returns to Select.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(canvas(container).getAttribute('data-tool')).toBe('select');
  });

  it('closes on a pointer-down outside it, and keeps the layer toggles inside it', () => {
    const { container, getByLabelText } = render(<WallDetailEditor />);
    const screws = () => container.querySelectorAll('svg[data-tool] g[data-appearance]').length;
    expect(screws()).toBeGreaterThan(0);
    const trigger = layersTrigger(container);
    fireEvent.click(trigger);
    fireEvent.click(getByLabelText('Screws'));
    // Toggling a layer keeps the menu open; the screws leave the drawing.
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screws()).toBe(0);

    fireEvent.pointerDown(canvas(container), { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a half-drawn trace when Escape only closes a popover', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.click(container.querySelector('button[title^="Trace cut panel"]'));
    fireEvent.pointerDown(canvas(container), { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    const tracePreview = () => container.querySelector('svg[data-tool] polyline[data-preview="trace"]');
    expect(tracePreview()).not.toBeNull();

    const trigger = layersTrigger(container);
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(tracePreview()).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tracePreview()).toBeNull();
  });
});
