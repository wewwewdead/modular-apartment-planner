/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { isTypingTarget } from '@/utils/keyboard';
import {
  CLICK_TRAVEL_PX,
  MEASURE_CLICK_PX,
  clickTravelUnits,
  isMeasureClick,
  isSpaceKey,
  spaceArmsPanLatch,
  spaceKeyUpTaken,
  travelledPastClick,
} from './detailCanvasRules';

/*
 * Each rule here replaced a hand-written copy in both detail editors. The
 * copies are kept below exactly as they were written, frozen, and each new
 * rule is compared with its copy over every combination of inputs. None of
 * them differs.
 */

const frozen = {
  // `finishCanvasGesture` (wall) and `commitMovedEntity` / `commitDimensionMove` (ceiling).
  clickTravel: (unitPx) => Math.max(1, unitPx * 2),
  movedTooLittle: (start, current, unitPx) =>
    Math.hypot(current.u - start.u, current.v - start.v) < Math.max(1, unitPx * 2),
  // The click-click measurement test, both editors.
  measureClick: (gesture, event) =>
    Math.hypot(event.clientX - (gesture.screenX ?? event.clientX), event.clientY - (gesture.screenY ?? event.clientY)) <
    5,
  // The field test, six copies across the two editors.
  editable: (target) => target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName),
  // The Space latch, both editors.
  spaceArms: (event) =>
    !(
      event.code !== 'Space' ||
      event.target?.isContentEditable ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)
    ),
  spaceUpPrevented: (event) => event.code === 'Space',
};

const UNIT_PX = [0, 0.05, 0.2, 0.49, 0.5, 0.51, 1, 2.5, 3.3, 10, 47.5];
const OFFSETS = [0, 0.1, 0.5, 0.99, 1, 1.01, 2, 4.9, 5, 5.1, 6.6, 20, 95, 100];

const attached = [];
afterEach(() => {
  for (const node of attached.splice(0)) node.remove();
});

function element(tag, attributes = {}, { editable = false, parent = null } = {}) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  // jsdom does not compute `isContentEditable`; a browser would for these.
  if (editable) Object.defineProperty(node, 'isContentEditable', { value: true });
  (parent || document.body).appendChild(node);
  if (!parent) attached.push(node);
  return node;
}

/** Every kind of thing a key event can be aimed at, named for the failure message. */
function keyTargets() {
  const button = element('button');
  const iconInButton = element('span', {}, { parent: element('button') });
  return {
    input: element('input'),
    numberInput: element('input', { type: 'number' }),
    select: element('select'),
    textarea: element('textarea'),
    editableDiv: element('div', { contenteditable: 'true' }, { editable: true }),
    plainDiv: element('div'),
    svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    body: document.body,
    document,
    window,
    none: null,
    button,
    iconInButton,
    link: element('a', { href: '#somewhere' }),
    anchorWithoutHref: element('a'),
    roleButton: element('div', { role: 'button', tabindex: '0' }),
  };
}

describe('the click travel', () => {
  it('is 2 px', () => {
    expect(CLICK_TRAVEL_PX).toBe(2);
  });

  it('is the old Math.max(1, unitPx * 2) at every scale', () => {
    for (const unitPx of [...UNIT_PX, NaN]) {
      expect(clickTravelUnits(unitPx)).toBe(frozen.clickTravel(unitPx));
    }
  });

  it('splits clicks from drags exactly where the old move test did', () => {
    const start = { u: 1000, v: 500 };
    for (const unitPx of UNIT_PX) {
      for (const du of OFFSETS) {
        for (const dv of OFFSETS) {
          for (const [su, sv] of [
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ]) {
            const current = { u: start.u + su * du, v: start.v + sv * dv };
            expect(travelledPastClick(start, current, unitPx), `${unitPx} mm/px, ${du}, ${dv}`).toBe(
              !frozen.movedTooLittle(start, current, unitPx),
            );
          }
        }
      }
    }
  });
});

describe('the click-click measurement', () => {
  it('is 5 px', () => {
    expect(MEASURE_CLICK_PX).toBe(5);
  });

  it('reads a press as the first click exactly where the old test did', () => {
    const presses = [{ screenX: 100, screenY: 200 }, { screenX: 100 }, { screenY: 200 }, {}];
    for (const gesture of presses) {
      for (const dx of [0, 1, 3, 3.5, 4, 4.99, 5, 5.01, 7, -3, -5]) {
        for (const dy of [0, 1, 3, 3.5, 4, 4.99, 5, 5.01, 7, -3, -5]) {
          const event = { clientX: 100 + dx, clientY: 200 + dy };
          expect(isMeasureClick(gesture, event), `${JSON.stringify(gesture)} ${dx},${dy}`).toBe(
            frozen.measureClick(gesture, event),
          );
        }
      }
    }
  });
});

describe('the typing-target check', () => {
  // Both are read as conditions, so what is compared is whether each holds.
  it('is the old inline field test for every target a key can have', () => {
    for (const [name, target] of Object.entries(keyTargets())) {
      expect(Boolean(isTypingTarget(target)), name).toBe(Boolean(frozen.editable(target)));
    }
  });
});

describe('the Space pan latch', () => {
  const space = (target, code = 'Space') => ({ code, target });

  it('recognises the Space bar by its code', () => {
    expect(isSpaceKey(space(null))).toBe(true);
    expect(isSpaceKey(space(null, 'KeyS'))).toBe(false);
  });

  // A focused button included: Space there is the pan's (Enter presses it).
  it('arms exactly where the old latch did', () => {
    for (const [name, target] of Object.entries(keyTargets())) {
      for (const code of ['Space', 'KeyA', 'Enter']) {
        const event = space(target, code);
        expect(spaceArmsPanLatch(event), `${code} on ${name}`).toBe(frozen.spaceArms(event));
      }
    }
  });

  it('takes the key-up exactly where the old latch did', () => {
    for (const [name, target] of Object.entries(keyTargets())) {
      for (const code of ['Space', 'KeyA', 'Enter']) {
        const event = space(target, code);
        expect(spaceKeyUpTaken(event), `${code} on ${name}`).toBe(frozen.spaceUpPrevented(event));
      }
    }
  });
});
