import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC } from 'replicad';
import { createKernelSession, snapshotTransferables } from './kernel.js';
let init, session, revision;
let announced = false;
// Queue initialization and operations so an export cannot race a build.
let queue = Promise.resolve();
let latestBuild = -Infinity;
// Each message's queued step runs as a microtask before the next message is
// delivered, so a build looks at `latestBuild` before edits posted during the
// build before it have arrived. One task's wait lets them in first. A port
// message rather than a timer: it shares their task source, so it is queued
// behind the messages already waiting, never ahead of them.
const nextTask = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
self.onmessage = ({ data }) => {
  if (data.type === 'build') latestBuild = Math.max(latestBuild, data.revision);
  queue = queue.then(async () => {
    try {
      // Rapid edits queue several builds; only the newest one is worth running.
      // Drawings, references and exports keep strict order and do not wait.
      if (data.type === 'build') await nextTask();
      if (data.type === 'build' && data.revision < latestBuild) throw new Error('Superseded model revision.');
      init ||= initOpenCascade({ locateFile: () => wasmUrl }).then(setOC);
      await init;
      // Once, so the UI can tell "waking the kernel" from "building the parts".
      if (!announced) {
        announced = true;
        self.postMessage({ status: 'awake' });
      }
      let result;
      if (data.type === 'build') {
        session?.dispose();
        session = null;
        revision = null;
        const started = performance.now();
        session = createKernelSession(data.payload);
        const built = performance.now();
        const timing = { meshMs: 0, edgesMs: 0, copyMs: 0 };
        result = session.snapshot({ timing });
        // Timing probes (docs/perf-pass-3.md B2.5), under a key the UI never
        // reads: the build (every part made and placed), the snapshot, and
        // within it the meshing, edge meshing and typed-array copies.
        result.debug = {
          buildMs: built - started,
          snapshotMs: performance.now() - built,
          ...timing,
          instances: result.instances?.length ?? 0,
        };
        revision = data.revision;
      } else {
        if (!session || revision !== data.revision) throw new Error('Model is out of date. Rebuild before exporting.');
        // The payload is { sheetIds, includeParts, collectErrors } (Phases
        // S and T), or null for every sheet.
        if (data.type === 'drawings') result = session.drawings(data.payload || {});
        else if (data.type === 'references')
          result = session.referenceOptions(data.payload.partId, data.payload.beforeFeatureId);
        else if (data.type === 'inspect') result = session.inspect();
        else if (data.type === 'solids') result = session.exportSolids();
        else if (data.type === 'export')
          result = {
            ...session.exportSolids(),
            drawings: session.drawings({ includeParts: true }),
            profiles: session.planarProfiles(),
          };
        else throw new Error(`Unknown worker request: ${data.type}`);
      }
      // A build's tessellation is transferred, not copied (see `typedMesh`).
      const transfer = data.type === 'build' ? snapshotTransferables(result) : [];
      // Wall-clock ms as it is posted: the page's own clock on arrival, less
      // this, is the transfer.
      if (data.type === 'build') result.debug.postedAt = performance.timeOrigin + performance.now();
      self.postMessage({ revision: data.revision, requestId: data.requestId, result }, transfer);
    } catch (error) {
      self.postMessage({
        revision: data.revision,
        requestId: data.requestId,
        error: {
          message: error.message || String(error),
          partId: error.partId,
          featureId: error.featureId,
          diagnostics: error.diagnostics,
        },
      });
    }
  });
};
