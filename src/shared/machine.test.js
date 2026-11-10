import { describe, expect, it } from 'vitest';
import { defineMachine, describeMachine } from './machine.js';

const door = () =>
  defineMachine({
    id: 'door',
    initial: 'closed',
    states: {
      closed: { OPEN: 'open', LOCK: 'locked' },
      open: { CLOSE: 'closed' },
      locked: { UNLOCK: 'closed' },
      welded: {},
    },
  });

describe('defineMachine', () => {
  it('moves along a declared transition', () => {
    const machine = door();
    expect(machine.next('closed', 'OPEN')).toBe('open');
    expect(machine.next('open', 'CLOSE')).toBe('closed');
    expect(machine.next('locked', 'UNLOCK')).toBe('closed');
  });

  it('ignores an event the current state does not list', () => {
    const machine = door();
    expect(machine.next('open', 'OPEN')).toBe('open');
    expect(machine.next('locked', 'OPEN')).toBe('locked');
    expect(machine.next('welded', 'OPEN')).toBe('welded');
    expect(machine.next('closed', 'NOT_AN_EVENT')).toBe('closed');
  });

  it('leaves a state it has never heard of where it is', () => {
    expect(door().next('ajar', 'OPEN')).toBe('ajar');
  });

  it('says beforehand whether an event applies', () => {
    const machine = door();
    expect(machine.can('closed', 'OPEN')).toBe(true);
    expect(machine.can('open', 'OPEN')).toBe(false);
    expect(machine.can('ajar', 'OPEN')).toBe(false);
    // Inherited object keys are not events.
    expect(machine.can('closed', 'toString')).toBe(false);
  });

  it('lists its states, events and moves', () => {
    const machine = door();
    expect(machine.id).toBe('door');
    expect(machine.initial).toBe('closed');
    expect(machine.states).toEqual(['closed', 'open', 'locked', 'welded']);
    expect(machine.events).toEqual(['CLOSE', 'LOCK', 'OPEN', 'UNLOCK']);
    expect(describeMachine(machine)).toEqual([
      'closed --OPEN--> open',
      'closed --LOCK--> locked',
      'open --CLOSE--> closed',
      'locked --UNLOCK--> closed',
    ]);
  });

  it('cannot be edited after it is declared', () => {
    const machine = door();
    expect(Object.isFrozen(machine)).toBe(true);
    expect(Object.isFrozen(machine.states)).toBe(true);
    expect(() => {
      machine.states.push('ajar');
    }).toThrow();
  });

  it('refuses a table that does not hold together', () => {
    expect(() => defineMachine({ initial: 'a', states: { a: {} } })).toThrow(/needs an id/);
    expect(() => defineMachine({ id: 'x', initial: 'missing', states: { a: {} } })).toThrow(/initial state/);
    expect(() => defineMachine({ id: 'x', initial: 'a', states: { a: { GO: 'nowhere' } } })).toThrow(
      /undeclared state/,
    );
  });
});
