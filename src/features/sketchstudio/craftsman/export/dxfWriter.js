function serializeValue(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '0';
    }

    return String(Object.is(value, -0) ? 0 : value);
  }

  return String(value ?? '');
}

export function createDxfWriter() {
  const lines = [];

  return {
    pair(code, value) {
      lines.push(String(code), serializeValue(value));
    },

    section(name, callback) {
      this.pair(0, 'SECTION');
      this.pair(2, name);
      callback(this);
      this.pair(0, 'ENDSEC');
    },

    table(name, callback) {
      this.pair(0, 'TABLE');
      this.pair(2, name);
      callback(this);
      this.pair(0, 'ENDTAB');
    },

    toString() {
      return `${lines.join('\n')}\n`;
    },
  };
}
