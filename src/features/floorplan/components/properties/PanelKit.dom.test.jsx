// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Readout, Section } from './PanelKit';
import WallProperties from './WallProperties';

const u = {
  step: () => 1,
  suffix: 'mm',
  fromDisplay: (value) => Number(value),
  toDisplay: (value) => value,
};

let container = null;

function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  container?.remove();
  container = null;
  window.localStorage.clear();
});

describe('Section', () => {
  it('opens and closes, and remembers the choice', () => {
    const node = mount(
      <Section id="test.section" title="Framing">
        <p>inside the section</p>
      </Section>,
    );
    expect(node.textContent).toContain('inside the section');

    act(() => node.querySelector('button').click());

    expect(node.textContent).not.toContain('inside the section');
    expect(window.localStorage.getItem('floorplan.panel.section.test.section')).toBe('closed');
  });

  it('starts from the remembered choice rather than the default', () => {
    window.localStorage.setItem('floorplan.panel.section.test.remembered', 'closed');

    const node = mount(
      <Section id="test.remembered" title="Framing" defaultOpen>
        <p>inside the section</p>
      </Section>,
    );

    expect(node.textContent).not.toContain('inside the section');
    expect(node.querySelector('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a summary only while collapsed, so nothing hides silently', () => {
    const node = mount(
      <Section id="test.summary" title="Framing" summary="9 studs @ 400">
        <p>inside</p>
      </Section>,
    );
    expect(node.textContent).not.toContain('9 studs @ 400');

    act(() => node.querySelector('button').click());

    expect(node.textContent).toContain('9 studs @ 400');
  });
});

describe('Readout', () => {
  // The whole point of the readout: a derived number is not an input, so it
  // cannot be focused, typed into, or given dead spinner arrows.
  it('renders derived values as text, never as a form control', () => {
    const node = mount(<Readout label="Stud count" value={9} unit="mm" />);

    expect(node.querySelector('input')).toBeNull();
    expect(node.textContent).toContain('Stud count');
    expect(node.textContent).toContain('9');
  });
});

describe('WallProperties framing section', () => {
  it('reveals the framing controls once the section is opened', () => {
    window.localStorage.setItem('floorplan.panel.section.wall.framing', 'open');

    const wall = {
      id: 'w1',
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
      thickness: 100,
      height: 2400,
      assembly: { preset: 'fiber_cement', system: 'framed' },
    };
    const node = mount(
      <WallProperties
        wall={wall}
        floor={{ walls: [wall], doors: [], windows: [], columns: [], rooms: [] }}
        dispatch={() => {}}
        editorDispatch={() => {}}
        floorId="floor_1"
        u={u}
        phases={[]}
      />,
    );

    expect(node.textContent).toContain('Stud spacing');
    expect(node.textContent).toContain('Double-stud wall');
    expect(node.textContent).toContain('Noggin rows');
    // Derived framing figures are readouts, not inputs.
    expect(node.textContent).toContain('Stud count');
    expect([...node.querySelectorAll('input')].some((input) => input.value === '9')).toBe(false);
  });
});
