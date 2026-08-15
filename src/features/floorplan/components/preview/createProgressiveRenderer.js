import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { IS_DESKTOP_APP } from '@/platform/desktopApp';
import { refineSupersample } from './previewResolution';

/**
 * The preview's image pipeline: ambient occlusion, tone mapping, and
 * progressive refinement.
 *
 * ## The idea
 *
 * The camera is either moving or it is not, and those are two completely
 * different problems. While it moves, nothing matters except keeping up — a
 * jagged edge that is on screen for 16 ms is invisible. The moment it stops,
 * the same frame is going to be stared at for seconds, and every jagged edge
 * and hard shadow is suddenly the only thing you can see.
 *
 * So this renders one cheap frame per input event, and then, once the camera
 * settles, keeps re-rendering the *same* view with a different sub-pixel offset
 * and a different point on the sun's disc each time, averaging the results. The
 * picture visibly resolves over about a second into something with
 * supersampled edges and true penumbral shadows, and none of that cost is ever
 * paid while anyone is dragging.
 *
 * This is why the preview does not use MSAA or an SMAA pass: neither can
 * antialias a 45 mm stud seen across a room, and neither does anything at all
 * for shadow edges. Accumulating jittered samples does both, and gets better
 * the longer you look, which is exactly the right shape for a viewport that
 * spends most of its life still.
 *
 * ## Colour management
 *
 * Every pass renders into a half-float target, and three switches tone mapping
 * off automatically when the destination is a render target — so accumulation
 * happens in linear light, where averaging is meaningful. `OutputPass` applies
 * the tone curve and the sRGB transfer exactly once, on the way to the screen.
 * Averaging after tone mapping would darken every antialiased edge.
 *
 * ## Resolution
 *
 * The same split runs through the resolution. Moving frames render at the
 * canvas's own resolution — one rendered pixel per pixel the display can show,
 * which is the cheapest image that is not actually blurry. Refinement samples
 * on the desktop shell render `REFINE_SUPERSAMPLE`× that in each axis, and the
 * blit to the canvas averages them back down; that averaging *is* the
 * supersampling, and it costs nothing while anyone is dragging. See
 * `applyRenderScale`.
 */

/**
 * How long a full refine is allowed to take before the sample count is cut.
 *
 * The desktop shell gets nearly three times as long: it has a whole GPU to
 * itself and nothing else on screen, so spending it on a cleaner settled image
 * is the point of being a desktop app. The budget is wall-clock after the
 * camera stops, so interaction feel is identical either way.
 */
const REFINE_BUDGET_MS = IS_DESKTOP_APP ? 2500 : 900;

/** Below this the accumulated image is not yet worth trusting over a fresh one. */
const MIN_SAMPLES = 4;

/**
 * Frame times at which ambient occlusion drops out of moving frames, and comes
 * back.
 *
 * Two numbers rather than one, because a single threshold on a measurement that
 * naturally wanders either side of it makes the pass switch on and off between
 * frames — and occlusion appearing and disappearing is far more distracting
 * than occlusion being absent. Zooming is where it showed: the amount of
 * geometry filling the screen changes continuously, and so does the frame time.
 *
 * The pair is set for 60 fps, not for "not obviously broken". At 33 ms the
 * fallback only fired once a drag was already down at 30 fps, which is exactly
 * the state it exists to prevent — occlusion is the first thing worth giving up
 * to hold a moving frame inside a 16.7 ms vsync. Recovery at 12 ms leaves a
 * fifth of the budget as margin, so a scene sitting right at the line does not
 * flip back and forth.
 */
const INTERACTIVE_FRAME_BUDGET_MS = 16;
const INTERACTIVE_FRAME_RECOVER_MS = 12;

/** Weight of the newest frame in the running frame-time estimate. */
const FRAME_TIME_SMOOTHING = 0.25;

function halton(index, base) {
  let result = 0;
  let fraction = 1;
  let i = index + 1;
  while (i > 0) {
    fraction /= base;
    result += fraction * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}

/**
 * Sub-pixel camera offsets, in the [-0.5, 0.5] pixel square.
 *
 * Halton (2, 3) rather than random: a low-discrepancy sequence covers the pixel
 * evenly at *every* prefix length, so the image is already well antialiased
 * after eight samples instead of only at the end of the run.
 *
 * The first entry is pinned to dead centre, because sample zero is displayed on
 * its own — it replaces the frame rather than averaging into it — and it has to
 * be the same *view* as the interactive frame it follows. (It is a sharper one:
 * that frame is where the desktop shell steps up to the supersampled size. A
 * sharpen when the picture settles reads as the refine arriving. A sideways
 * shift of half a pixel reads as a glitch, and a camera being nudged along
 * would produce one several times a second.)
 */
// Long enough that the highest maxSamples any style asks for never wraps the
// table — repeated offsets stop adding antialiasing information.
const JITTER_COUNT = IS_DESKTOP_APP ? 128 : 64;
const JITTER = [
  [0, 0],
  ...Array.from({ length: JITTER_COUNT - 1 }, (_, index) => [halton(index, 2) - 0.5, halton(index, 3) - 0.5]),
];

/**
 * Multisample count for the offscreen colour buffers, capped by the GPU.
 *
 * Not redundant with the accumulation. Accumulation only antialiases a frame
 * that is going to be re-rendered dozens of times; the frames you actually
 * watch — every frame of every orbit — get one shot each. Moving rendering
 * offscreen silently lost the MSAA the old direct-to-canvas renderer had, and
 * left a preview that resolved beautifully once it settled and stepped visibly
 * the entire time it moved.
 *
 * Measured on a tilted silhouette, as the RMS error of the recovered sub-pixel
 * edge position: no MSAA gives 0.29 px, which is exactly the 1/sqrt(12) you get
 * from quantising an edge to whole pixels — the number that says "no
 * antialiasing whatsoever". Four samples gives 0.077, eight gives 0.045. At
 * preview-panel sizes the extra buffer is small enough that there is no reason
 * to take the cheaper one.
 */
const MSAA_PREFERRED_SAMPLES = 8;

/**
 * How much bigger than the canvas a refinement sample is rendered.
 *
 * 2 on the desktop shell, 1 in a browser tab. The canvas is fixed at the
 * display's own pixel ratio (see `previewResolution`), so this is the entire
 * supersampling story: the accumulation buffers are twice the canvas in each
 * axis, and the present blit averages each 2×2 block into one canvas pixel.
 */
const REFINE_SUPERSAMPLE = refineSupersample(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/** Render scale of a moving frame: exactly the pixels the display can show. */
const INTERACTIVE_SCALE = 1;

export function createProgressiveRenderer({ renderer, scene, camera, onBeforeSample = null }) {
  // Device pixels of the default framebuffer — the size everything offscreen is
  // measured against, and the size the finished image is presented at.
  const canvasSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Asking for more samples than the driver supports is not an error, it is
  // silently ignored — so clamp rather than hope.
  const msaaSamples = Math.min(MSAA_PREFERRED_SAMPLES, renderer.capabilities.maxSamples ?? 0);

  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(canvasSize.x, canvasSize.y, {
      type: THREE.HalfFloatType,
      samples: msaaSamples,
    }),
  );
  composer.renderToScreen = false;
  // Deliberately *not* the renderer's pixel ratio. The offscreen chain no
  // longer tracks the canvas — that decoupling is the point — so the composer
  // is driven in raw device pixels and `applyRenderScale` owns the conversion.
  composer.setPixelRatio(1);

  const renderPass = new RenderPass(scene, camera);
  const gtaoPass = new GTAOPass(scene, camera, canvasSize.x, canvasSize.y);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  composer.addPass(renderPass);
  composer.addPass(gtaoPass);

  const outputPass = new OutputPass();
  outputPass.renderToScreen = true;
  // The output quad covers every pixel, so let it overwrite rather than blend.
  // Blending here would multiply the alpha of a transparent backdrop into its
  // own colour on the way to the canvas.
  outputPass.material.blending = THREE.NoBlending;

  const accumulationTarget = new THREE.WebGLRenderTarget(canvasSize.x, canvasSize.y, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    // Nearest while this is the same size as the canvas — which is every moving
    // frame, and every frame at all in the browser build. Linear filtering at
    // one texel per pixel cannot add information, but a half-texel misalignment
    // anywhere in the chain would let it quietly soften every edge the
    // accumulation just worked to resolve. Nearest cannot.
    //
    // `applyRenderScale` switches it to linear for the supersampled case, where
    // the blit is a genuine downsample and nearest would keep one texel out of
    // every four.
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  // Averaging by constant-factor blending rather than by dividing in the
  // shader: `blendAlpha` is a piece of GL state, so the weight can change every
  // sample without touching the shader, and the same factor applies to alpha —
  // which is what lets the transparent studio backdrop survive accumulation.
  const accumulationMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ConstantAlphaFactor,
    blendDst: THREE.OneMinusConstantAlphaFactor,
    blendAlpha: 1,
  });
  const accumulationQuad = new FullScreenQuad(accumulationMaterial);

  let style = null;
  let sampleIndex = 0;
  let targetSamples = MIN_SAMPLES;
  let lastFrameMs = 8;
  let smoothedFrameMs = 8;
  let interactiveOcclusion = true;
  let hasAccumulation = false;
  // Zero so the first `applyRenderScale` always runs.
  let renderScale = 0;
  const renderSize = new THREE.Vector2(canvasSize.x, canvasSize.y);

  /**
   * Resize the whole offscreen chain to `scale` × the canvas.
   *
   * Called at the two moments the preview changes gear — the first moving frame
   * of a gesture, and the first refinement sample after it stops — so a
   * reallocation lands once per gesture rather than once per frame. It throws
   * the accumulated image away, which is why it may only ever be called where
   * an accumulation was about to be restarted anyway.
   */
  function applyRenderScale(scale) {
    const width = Math.max(1, Math.round(canvasSize.x * scale));
    const height = Math.max(1, Math.round(canvasSize.y * scale));
    if (scale === renderScale && width === renderSize.x && height === renderSize.y) return;

    renderScale = scale;
    renderSize.set(width, height);

    // Sizing from the canvas's pixel count rather than from CSS pixels is what
    // makes this exact: at the usual desktop ratio the accumulation is exactly
    // twice the canvas in each axis, so a bilinear tap at a canvas pixel's
    // centre lands precisely between four texels and weights them 25% each —
    // a box filter, for free, in hardware, in linear light.
    const filter = width > canvasSize.x ? THREE.LinearFilter : THREE.NearestFilter;
    if (accumulationTarget.texture.minFilter !== filter) {
      // Texture parameters of a render target are only read when its GL texture
      // is created, so force a new one rather than assume the resize will.
      accumulationTarget.dispose();
      accumulationTarget.texture.minFilter = filter;
      accumulationTarget.texture.magFilter = filter;
    }

    // In device pixels: the composer's own ratio is pinned to 1 above.
    composer.setSize(width, height);
    accumulationTarget.setSize(width, height);

    // Whatever had accumulated lived in a texture that no longer exists.
    sampleIndex = 0;
    hasAccumulation = false;
  }

  /** Offsets the projection by a fraction of a pixel, in clip space. */
  function jitterCamera(index) {
    camera.updateProjectionMatrix();
    if (index < 0) return;

    const [offsetX, offsetY] = JITTER[index % JITTER.length];
    // Against the size being *rendered*, not the canvas: during a refine that
    // is the supersampled buffer, and one of its pixels is what a sample is
    // meant to be jittered within. Measuring against the canvas instead would
    // spread the same offsets over four times the area and quietly soften the
    // settled image.
    // Clip space spans 2 units across the viewport, so one pixel is 2 / width.
    camera.projectionMatrix.elements[8] += (offsetX * 2) / Math.max(renderSize.x, 1);
    camera.projectionMatrix.elements[9] += (offsetY * 2) / Math.max(renderSize.y, 1);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function blendIntoAccumulation(weight) {
    accumulationMaterial.uniforms.tDiffuse.value = composer.readBuffer.texture;
    accumulationMaterial.blendAlpha = weight;
    renderer.setRenderTarget(accumulationTarget);
    // The whole point of this pass is to read what is already in the target, so
    // the renderer must not wipe it first. Without this the average is always
    // just the newest sample and the image never resolves.
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    accumulationQuad.render(renderer);
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(null);
  }

  /**
   * Put the accumulated image on the canvas.
   *
   * `renderToScreen` is set on the pass, so this targets the default
   * framebuffer at its own size — which is where the downsample happens when
   * the accumulation is bigger. Tone mapping and the sRGB transfer are applied
   * *after* the texture fetch, so the four texels are averaged in linear light,
   * which is the only place averaging light is meaningful.
   */
  function present() {
    outputPass.render(renderer, null, accumulationTarget, 0, false);
  }

  applyRenderScale(INTERACTIVE_SCALE);

  return {
    /** How many samples have landed in the current accumulation. */
    get sampleCount() {
      return sampleIndex;
    },

    /** Where the refine has got to, for anyone who wants to show or check it. */
    getStats() {
      return {
        samples: sampleIndex,
        targetSamples,
        lastFrameMs: Math.round(lastFrameMs * 100) / 100,
        multisampling: msaaSamples,
        drawingBuffer: canvasSize.toArray(),
        // What the last frame was actually rendered at, and how that compares
        // to the canvas — the two numbers that say whether this frame was a
        // cheap moving one or a supersampled settled one.
        renderSize: renderSize.toArray(),
        renderScale,
      };
    },

    /** True once the accumulated image has as many samples as it is getting. */
    isConverged() {
      return sampleIndex >= targetSamples;
    },

    setStyle(nextStyle) {
      style = nextStyle;
      gtaoPass.blendIntensity = style.aoIntensity;
      gtaoPass.updateGtaoMaterial({
        // World units are millimetres here, so the default 0.25 would gather
        // occlusion over a quarter of a millimetre and return a blank pass.
        radius: style.aoRadiusMm,
        distanceExponent: 1,
        // Gates how deep a depth discontinuity still counts as an occluder.
        // Also in world units, so it has to be scaled with the radius.
        thickness: style.aoRadiusMm * 2,
        scale: 1,
        // Doubled on desktop: at 16, flat wall/ceiling junctions keep a faint
        // banded look that more directions per pixel genuinely fixes.
        samples: IS_DESKTOP_APP ? 32 : 16,
        screenSpaceRadius: false,
      });
      this.reset();
    },

    /**
     * Tell GTAO where the model is.
     *
     * Not optional: the pass ships with a ±1 unit clip box and fades occlusion
     * to nothing outside it, so in a scene measured in millimetres every
     * surface is thousands of units out of bounds and the pass silently returns
     * a blank image.
     */
    setSceneBounds(box) {
      if (!box || box.isEmpty()) return;
      gtaoPass.setSceneClipBox(box);
    },

    /**
     * Follow the canvas to its new size.
     *
     * Takes no arguments on purpose: the canvas is the source of truth, and the
     * caller has already resized it. Sizing this chain from CSS pixels instead
     * would put the renderer's pixel ratio back into the offscreen sizes, which
     * is exactly the coupling this pipeline exists without.
     *
     * Always lands on the interactive size, whatever it was rendering before. A
     * resize invalidates the picture, so the next frame is a moving one by
     * definition — and a window being dragged by its corner fires this dozens of
     * times, which is the last place to be allocating supersampled buffers.
     */
    setSize() {
      renderer.getDrawingBufferSize(canvasSize);
      renderScale = 0;
      applyRenderScale(INTERACTIVE_SCALE);
      this.reset();
    },

    /** Throw away the accumulated image; the next sample starts a fresh average. */
    reset() {
      sampleIndex = 0;
      hasAccumulation = false;
    },

    /**
     * One frame while the camera is moving. No accumulation, and GTAO drops out
     * if the last frame was too slow to afford it.
     */
    renderInteractive() {
      // Before the clock starts: on the first moving frame after a refine this
      // reallocates the offscreen chain, and charging a once-per-gesture
      // allocation to the frame-time estimate would drop occlusion out of the
      // whole drag that follows.
      applyRenderScale(INTERACTIVE_SCALE);

      const startedAt = performance.now();
      gtaoPass.enabled = style.ambientOcclusion && interactiveOcclusion;
      onBeforeSample?.(-1, 1);
      jitterCamera(-1);
      composer.render();
      blendIntoAccumulation(1);
      present();
      sampleIndex = 0;
      hasAccumulation = true;
      lastFrameMs = performance.now() - startedAt;

      smoothedFrameMs += (lastFrameMs - smoothedFrameMs) * FRAME_TIME_SMOOTHING;
      if (interactiveOcclusion && smoothedFrameMs > INTERACTIVE_FRAME_BUDGET_MS) {
        interactiveOcclusion = false;
      } else if (!interactiveOcclusion && smoothedFrameMs < INTERACTIVE_FRAME_RECOVER_MS) {
        interactiveOcclusion = true;
      }
    },

    /**
     * One refinement sample. Returns true while more are wanted.
     *
     * The budget is measured, not assumed: a studio flat gets its full sample
     * count, a forty-unit block with every truss modelled quietly settles for
     * six, and neither one leaves the user waiting.
     *
     * Worth knowing that the estimate survives the resolution switch below: the
     * first sample is the one that pays for the step up to the supersampled
     * size, so it reads slightly *high*, and the budget errs towards too few
     * samples rather than a refine that outstays the budget. Measured on an
     * empty scene in full-window mode: 21 ms predicted, 21 ms actual, 121
     * samples landed inside the 2500 ms.
     */
    renderSample() {
      // The converged check has to come first: `applyRenderScale` resets the
      // sample count, so asking it anything at all after convergence would
      // restart the refine forever.
      if (sampleIndex >= targetSamples && hasAccumulation) return false;

      // A no-op on every sample but the first of a run. The first one steps the
      // whole chain up to the supersampled size, which is safe precisely here:
      // sample zero replaces the accumulation rather than averaging into it.
      applyRenderScale(REFINE_SUPERSAMPLE);

      const startedAt = performance.now();
      gtaoPass.enabled = style.ambientOcclusion;
      onBeforeSample?.(sampleIndex, targetSamples);
      jitterCamera(sampleIndex);
      composer.render();

      // First sample replaces whatever was there; later ones average in.
      blendIntoAccumulation(hasAccumulation && sampleIndex > 0 ? 1 / (sampleIndex + 1) : 1);
      present();

      // Undo the jitter so picking, culling and the sun sprite all see the
      // camera the user thinks they are looking through.
      camera.updateProjectionMatrix();

      sampleIndex += 1;
      hasAccumulation = true;
      lastFrameMs = performance.now() - startedAt;

      if (sampleIndex === 1) {
        const affordable = Math.floor(REFINE_BUDGET_MS / Math.max(lastFrameMs, 1));
        targetSamples = THREE.MathUtils.clamp(affordable, MIN_SAMPLES, style.maxSamples);
      }

      return sampleIndex < targetSamples;
    },

    /** Re-present the accumulated image without adding to it. */
    repaint() {
      if (!hasAccumulation) return false;
      present();
      return true;
    },

    dispose() {
      accumulationQuad.dispose();
      accumulationMaterial.dispose();
      accumulationTarget.dispose();
      outputPass.dispose?.();
      gtaoPass.dispose?.();
      renderPass.dispose?.();
      composer.dispose?.();
    },
  };
}
