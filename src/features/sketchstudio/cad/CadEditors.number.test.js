// numberFor (CadEditors.jsx) is the one rule the paint and print fields
// (ShopStationPanels.jsx) and the press brake's fields (PressBrakePanel.jsx)
// read a typed number by. Each kept its own copy before; this compares that
// copy, frozen here as it was written, with numberFor over every kind of text
// a field can hand over. The handler sees exactly the same calls; the only
// difference is the answer for text that reads as no number (NOT_A_NUMBER),
// which tells the field to show the value in force again.
import { describe, expect, it, vi } from 'vitest';
import { NOT_A_NUMBER, numberFor } from './CadEditors.jsx';
import { numeric } from './model.js';

// Both copies were this, word for word, with `values` from the parameter context.
const before = (values) => (handler) => (value) => {
  let resolved;
  try {
    resolved = numeric(value, values || {});
  } catch {
    return;
  }
  if (Number.isFinite(resolved)) handler(resolved);
};

const TEXTS = [
  12,
  0,
  -3,
  1.5,
  Infinity,
  NaN,
  '12',
  ' 7 ',
  '12.',
  '-3',
  '1e3',
  '0',
  '',
  ' ',
  'abc',
  'NaN',
  '=a*2',
  '=a+',
  '=b',
  '=1/0',
  null,
  undefined,
  {},
];
const VALUES = [{ a: 3 }, {}, null, undefined];

describe('numberFor', () => {
  it('calls the handler exactly as the copies it replaced did, for every text and parameter set', () => {
    for (const values of VALUES)
      for (const text of TEXTS) {
        const old = vi.fn(),
          now = vi.fn();
        const kept = before(values)(old)(text);
        const answer = numberFor(values)(now)(text);
        expect(now.mock.calls).toEqual(old.mock.calls);
        expect(kept).toBeUndefined();
        // Read: the handler ran and nothing is said; not read: NOT_A_NUMBER.
        expect(answer).toBe(old.mock.calls.length ? undefined : NOT_A_NUMBER);
      }
  });
});
