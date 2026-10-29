export class RevisionWorker {
  constructor(factory, timeout = 120000) {
    this.factory = factory;
    this.timeout = timeout;
    this.pending = new Map();
    this.sequence = 0;
    this.revision = 0;
  }
  start() {
    if (this.worker) return;
    this.worker = this.factory();
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      if (data.revision !== this.revision) pending.reject(new Error('Superseded model revision.'));
      else if (data.error) pending.reject(Object.assign(new Error(data.error.message), data.error));
      else pending.resolve(data.result);
    };
    this.worker.onerror = (event) => this.cancel(event.message || 'CAD worker failed. Retry to recover.');
    this.worker.onmessageerror = () => this.cancel('Could not read the worker result. Retry to recover.');
  }
  request(type, payload, revision = this.revision) {
    this.start();
    this.revision = revision;
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel('Operation timed out. Retry or simplify the feature.'), this.timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ type, payload, revision, requestId });
    });
  }
  // Drop interest in older requests but keep the worker (and its loaded WASM
  // kernel) alive. The worker skips builds that a newer build has replaced.
  supersede() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Superseded model revision.'));
    }
    this.pending.clear();
  }
  cancel(message = 'Operation cancelled.') {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.revision++;
  }
}
