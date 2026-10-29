import { init_planegcs_module } from '@salusoft89/planegcs';
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { solveSketches } from './solver.js';
let modulePromise;
self.onmessage = async ({ data }) => {
  try {
    modulePromise ||= init_planegcs_module({ locateFile: () => wasmUrl });
    const result = solveSketches(data.payload, await modulePromise);
    self.postMessage({ revision: data.revision, requestId: data.requestId, result });
  } catch (error) {
    self.postMessage({
      revision: data.revision,
      requestId: data.requestId,
      error: { message: error.message || String(error), sketchId: error.sketchId, constraintIds: error.constraintIds },
    });
  }
};
