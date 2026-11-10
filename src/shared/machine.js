/**
 * A state machine written down as data.
 *
 * Most of the app's modes started life as a handful of flags and a string that
 * several handlers each nudged in their own way: an "is it loading" boolean
 * beside an error beside a stage name, kept in step by convention. The bugs
 * that came out of that were all the same bug — one path forgot a sibling
 * variable, or two copies of "how this ends" drifted apart.
 *
 * A machine declared here is the single place that says which states exist and
 * which event moves which state where:
 *
 *   const door = defineMachine({
 *     id: 'door',
 *     initial: 'closed',
 *     states: {
 *       closed: { OPEN: 'open' },
 *       open: { CLOSE: 'closed' },
 *     },
 *   });
 *   door.next('closed', 'OPEN');  // 'open'
 *   door.next('open', 'OPEN');    // 'open' — not listed, so nothing happens
 *
 * It is deliberately only a table. It holds no state, runs no effects and knows
 * nothing about React: the owner keeps the current state wherever it already
 * lives (useState, a reducer, a closure) and asks the table what comes next.
 *
 * An event a state does not list is IGNORED, not an error. That is the rule
 * these tables exist to state: a reply that arrives after a cancel, a second
 * click on a button that is already working, an Escape with nothing open — all
 * of them are events that reach a state with no use for them, and the right
 * answer is to stay put. Use `can` when the caller needs to know beforehand.
 *
 * Every machine is listed in docs/state-machines.md, and
 * src/shared/machineRegistry.test.js fails when a table and that page disagree.
 */

/**
 * @param {object} definition
 * @param {string} definition.id        Name of the machine, as the registry lists it.
 * @param {string} definition.initial   The state a fresh owner starts in.
 * @param {Record<string, Record<string, string>>} definition.states
 *   state → EVENT → next state. A state with no events is terminal.
 */
export function defineMachine({ id, initial, states }) {
  if (!id) throw new Error('A machine needs an id.');
  const names = Object.keys(states || {});
  if (!names.includes(initial)) throw new Error(`Machine "${id}": initial state "${initial}" is not declared.`);

  const table = {};
  const events = new Set();
  for (const name of names) {
    table[name] = Object.freeze({ ...states[name] });
    for (const [event, target] of Object.entries(table[name])) {
      if (!names.includes(target))
        throw new Error(`Machine "${id}": ${name} --${event}--> "${target}" leads to an undeclared state.`);
      events.add(event);
    }
  }
  Object.freeze(table);

  const can = (state, event) => Boolean(table[state] && Object.hasOwn(table[state], event));

  return Object.freeze({
    id,
    initial,
    states: Object.freeze(names),
    events: Object.freeze([...events].sort()),
    can,
    /** The state `event` leads to from `state`; `state` itself when it leads nowhere. */
    next: (state, event) => (can(state, event) ? table[state][event] : state),
    /** Every declared move, in declaration order. */
    transitions: () => names.flatMap((from) => Object.entries(table[from]).map(([event, to]) => ({ from, event, to }))),
  });
}

/** One line per declared move — the form docs/state-machines.md lists them in. */
export function describeMachine(machine) {
  return machine.transitions().map(({ from, event, to }) => `${from} --${event}--> ${to}`);
}
