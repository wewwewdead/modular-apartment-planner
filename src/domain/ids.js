let counter = 0;

export function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const count = (counter++).toString(36);
  return `${prefix}_${timestamp}_${count}`;
}
