/**
 * True for `key` pressed on its own — no Ctrl, Cmd, Alt or Shift. A tool's
 * `claimsKey` uses it so only the bare letter is taken from the plan's global
 * tool shortcuts; any chord still reaches whatever it meant before.
 */
export function isBareKey(e, key) {
  return e.key.toLowerCase() === key && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
}
