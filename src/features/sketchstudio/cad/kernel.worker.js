import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
let init, session, revision;
// Queue initialization and operations so an export cannot race a build.
let queue = Promise.resolve();
let latestBuild = -Infinity;
self.onmessage = ({ data }) => {
  if (data.type === 'build') latestBuild = Math.max(latestBuild, data.revision);
  queue = queue.then(async () => {
    try {
      // Rapid edits queue several builds; only the newest one is worth running.
      if (data.type === 'build' && data.revision < latestBuild) throw new Error('Superseded model revision.');
      init ||= initOpenCascade({ locateFile: () => wasmUrl }).then(setOC);
      await init;
      let result;
      if (data.type === 'build') {
        session?.dispose();
        session = null;
        revision = null;
        session = createKernelSession(data.payload);
        result = session.snapshot();
        revision = data.revision;
      } else {
        if (!session || revision !== data.revision) throw new Error('Model is out of date. Rebuild before exporting.');
        if (data.type === 'drawings') result = session.drawings();
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
      self.postMessage({ revision: data.revision, requestId: data.requestId, result });
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
