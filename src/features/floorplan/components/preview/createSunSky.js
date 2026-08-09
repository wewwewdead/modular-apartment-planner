import * as THREE from 'three';
import { sunDirectionInPlan } from '@/analysis/sunStudyRunner';

/**
 * The sun and the sky it hangs in, for the 3D preview.
 *
 * The preview already aimed a light at the real solar position, which is what
 * makes the shadows correct — but a light has no body, so the thing casting
 * them was invisible and there was no way to see *where* the sun was without
 * reading a shadow backwards. This adds the body: a disc with a glare around
 * it, sitting in the direction the light comes from, and a sky graded to the
 * sun's altitude behind it.
 *
 * Both appear only while a sun study is running. With the study off the preview
 * goes back to its neutral studio backdrop and its decorative key light, which
 * is the right look for drawing a plan and the wrong one for judging daylight.
 *
 * ## Why the sun is parented to nothing and moved by hand
 *
 * It is drawn at a fixed distance *in front of the camera*, refreshed each
 * frame. The alternatives are worse: parent it to the camera and it stops being
 * a place in the world, so orbiting the model would drag the sun along; leave
 * it at a fixed world position and it either falls outside the far plane on a
 * large site or lands inside the building on a small one. Holding it at a set
 * distance along a fixed world *direction* is what an object at infinity
 * actually looks like, and it keeps the disc comfortably inside the frustum
 * whatever the camera is doing.
 *
 * It is still an ordinary depth-tested object, so a building between you and a
 * low sun hides it — which is exactly what a sunset behind a tower looks like.
 */

/** Fraction of the camera's far plane the sun is held at. */
const SUN_DISTANCE_FRACTION = 0.85;

/**
 * Angular sizes, in degrees.
 *
 * The real sun is 0.53° across, which at this field of view is about eight
 * pixels — technically right and useless to look at. Three times that reads as
 * the sun without becoming a cartoon, and the glare around it does the rest of
 * the work of saying "this is a light source, not a ball".
 */
const DISC_ANGLE_DEG = 1.6;
const GLARE_ANGLE_DEG = 16;

/**
 * Sky colours at a few sun altitudes, in degrees: zenith, horizon, and the
 * ground haze below it. Interpolated between, so the sky slides through
 * daylight, gold, dusk and night as the time dial is dragged rather than
 * switching between them.
 *
 * Deliberately desaturated for a working tool. The model is the subject; a
 * postcard sky would fight it.
 */
const SKY_KEYS = [
  { altitude: -12, zenith: [22, 28, 46], horizon: [38, 46, 68], ground: [26, 30, 42] },
  { altitude: -6, zenith: [46, 58, 92], horizon: [120, 96, 110], ground: [50, 54, 68] },
  { altitude: 0, zenith: [84, 112, 158], horizon: [232, 168, 118], ground: [96, 96, 104] },
  { altitude: 8, zenith: [104, 144, 196], horizon: [238, 206, 164], ground: [150, 150, 150] },
  { altitude: 25, zenith: [110, 158, 209], horizon: [206, 226, 240], ground: [196, 198, 198] },
  // Overhead sun, deeper zenith. The one place the sky gets *darker* as the sun
  // gets higher, and it is real: less atmosphere in the line of sight straight
  // up means less of the haze that pales the rest of the day's sky.
  { altitude: 90, zenith: [88, 138, 198], horizon: [205, 224, 238], ground: [200, 202, 202] },
];

const mix = (from, to, t) => from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));

/**
 * Zenith, horizon and ground colours for a sun altitude in **degrees**.
 *
 * Exported for its own test: the sky is the one part of this that has to be
 * monotonic — every step of the dial towards midnight has to make the sky
 * darker, never brighter — and that is worth pinning.
 */
export function skyPalette(altitudeDeg) {
  const first = SKY_KEYS[0];
  const last = SKY_KEYS[SKY_KEYS.length - 1];
  if (altitudeDeg <= first.altitude) return { zenith: first.zenith, horizon: first.horizon, ground: first.ground };
  if (altitudeDeg >= last.altitude) return { zenith: last.zenith, horizon: last.horizon, ground: last.ground };

  for (let index = 1; index < SKY_KEYS.length; index += 1) {
    const before = SKY_KEYS[index - 1];
    const after = SKY_KEYS[index];
    if (altitudeDeg > after.altitude) continue;

    const t = (altitudeDeg - before.altitude) / (after.altitude - before.altitude);
    return {
      zenith: mix(before.zenith, after.zenith, t),
      horizon: mix(before.horizon, after.horizon, t),
      ground: mix(before.ground, after.ground, t),
    };
  }

  return { zenith: last.zenith, horizon: last.horizon, ground: last.ground };
}

/**
 * Unit vector pointing **at** the sun, in world space.
 *
 * World is plan space with elevation lifted into y: `(plan.x, elevation,
 * plan.y)`. The compass convention itself is not restated here — it comes from
 * `sunDirectionInPlan`, the same function the 2D shadow projection uses, so the
 * two views cannot disagree about where the sun is.
 */
export function sunWorldDirection({ altitude, azimuth, northAngle = 0 }, target = new THREE.Vector3()) {
  const plan = sunDirectionInPlan({ azimuth, northAngle });
  const horizontal = Math.cos(altitude);
  return target.set(plan.x * horizontal, Math.sin(altitude), plan.y * horizontal);
}

/** Radial sprite art. White, so the sprite's own colour can tint it per altitude. */
function radialTexture(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The sun's body and its sky.
 *
 * @returns an object to add to the scene, plus `update` (call when the sun
 *   moves), `followCamera` (call every frame) and `dispose`. `update` returns
 *   the texture to hand to `scene.background`, or null to leave the panel's own
 *   backdrop showing.
 */
export function createSunSky() {
  const group = new THREE.Group();
  group.name = 'sun';
  group.visible = false;
  // First among the transparent objects, because it is behind all of them —
  // three carries a Group's renderOrder down to its children as the group order
  // it sorts on. It is still depth-tested, so opaque geometry in front of it
  // still hides it.
  group.renderOrder = -1;

  const direction = new THREE.Vector3(0, 1, 0);
  let glare = null;
  let disc = null;
  let skyCanvas = null;
  let skyTexture = null;
  // Bumped on every repaint. The image-based lighting is generated from this
  // canvas and that generation is not free, so its owner watches this counter
  // instead of re-deriving the environment on every frame.
  let skyVersion = 0;
  let lastPaintKey = null;

  try {
    const glareTexture = radialTexture(256, [
      [0, 'rgba(255,255,255,1)'],
      [0.05, 'rgba(255,255,255,0.92)'],
      [0.12, 'rgba(255,255,255,0.5)'],
      [0.28, 'rgba(255,255,255,0.17)'],
      [0.55, 'rgba(255,255,255,0.04)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // A soft edge rather than a hard one: a disc with aliased edges reads as a
    // sticker, and the sun has an atmosphere in front of it in any case.
    const discTexture = radialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.58, 'rgba(255,255,255,1)'],
      [0.8, 'rgba(255,255,255,0.75)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    if (glareTexture && discTexture) {
      glare = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glareTexture,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture, depthWrite: false, transparent: true }));
      // Both sprites sit at the same point, so distance sorting cannot separate
      // them and the order has to be stated. Glare last: it is the light
      // scattered by the air *between* you and the sun, so it lays over the
      // disc and blows its centre out, which is what looking at the sun does.
      disc.renderOrder = 0;
      glare.renderOrder = 1;
      group.add(disc);
      group.add(glare);
    }

    // Wide enough to hold an azimuth as well as an altitude. The gradient alone
    // only needed one column, but the sky now carries the glow around the sun,
    // and that glow is also what the image-based lighting is generated from —
    // so the model picks up warm light from the sun's side of the sky and cool
    // light from the other, which one column cannot express.
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 256;
    skyTexture = new THREE.CanvasTexture(skyCanvas);
    // Equirectangular so three treats it as a dome: the vertical axis becomes
    // the polar angle and the gradient sits where a sky sits, however the
    // camera is pointed.
    skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    skyTexture.colorSpace = THREE.SRGBColorSpace;
  } catch {
    // No canvas — headless or a locked-down browser. The study still runs, the
    // shadows are still correct, and the preview simply keeps its own backdrop.
  }

  /**
   * Where a world direction lands on the sky canvas, in pixels.
   *
   * Mirrors three's `equirectUv`: `u = atan2(z, x) / 2π + 0.5`, `v = asin(y) / π
   * + 0.5`. A canvas texture is flipped on Y, so v = 1 (the zenith) samples the
   * canvas's top row — which is why the gradient is painted zenith-first.
   */
  function skyCanvasPoint(worldDirection) {
    const u = Math.atan2(worldDirection.z, worldDirection.x) / (2 * Math.PI) + 0.5;
    const v = Math.asin(THREE.MathUtils.clamp(worldDirection.y, -1, 1)) / Math.PI + 0.5;
    return { x: u * skyCanvas.width, y: (1 - v) * skyCanvas.height };
  }

  /**
   * Repaints the sky gradient in place; the texture and its canvas are reused.
   *
   * Repainting is skipped when the sun has not moved far enough to change the
   * picture. That guard is load-bearing rather than a micro-optimisation:
   * `applySun` runs on every scene rebuild — up to fifteen times a second while
   * a wall is being dragged — and every repaint invalidates the texture, which
   * re-uploads it *and* forces the image-based lighting to be prefiltered
   * again. Quantising to a quarter of a degree is well inside what the eye can
   * see in a sky gradient and turns that whole chain into a no-op.
   */
  function paintSky(altitudeDeg) {
    if (!skyCanvas) return null;
    const context = skyCanvas.getContext('2d');
    if (!context) return null;

    const paintKey = `${Math.round(altitudeDeg * 4)}:${Math.round(direction.x * 256)}:${Math.round(direction.z * 256)}`;
    if (paintKey === lastPaintKey) return skyTexture;
    lastPaintKey = paintKey;

    const { zenith, horizon, ground } = skyPalette(altitudeDeg);
    const height = skyCanvas.height;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    const rgb = ([red, green, blue]) => `rgb(${red}, ${green}, ${blue})`;

    // Canvas top is the zenith. The horizon band is squeezed towards the middle
    // rather than spread evenly, because that is where the colour actually
    // changes fastest and where a linear ramp looks like a painted backdrop.
    gradient.addColorStop(0, rgb(zenith));
    gradient.addColorStop(0.34, rgb(mix(zenith, horizon, 0.35)));
    gradient.addColorStop(0.47, rgb(mix(zenith, horizon, 0.82)));
    gradient.addColorStop(0.5, rgb(horizon));
    gradient.addColorStop(0.56, rgb(mix(horizon, ground, 0.7)));
    gradient.addColorStop(1, rgb(ground));

    context.fillStyle = gradient;
    context.fillRect(0, 0, skyCanvas.width, height);

    // The circumsolar glow. Not decoration: this canvas is also the source for
    // the scene's image-based lighting, and without it the sky lights the model
    // as evenly from behind as from the sun's side, which is the flat,
    // directionless look the whole exercise is trying to get away from.
    if (altitudeDeg > -8) {
      const centre = skyCanvasPoint(direction);
      // Wider the lower the sun sits — the same longer path through the
      // atmosphere that reddens it also spreads it.
      const warmth = THREE.MathUtils.clamp(altitudeDeg / 30, 0, 1);
      const radius = skyCanvas.height * (0.5 - 0.18 * warmth);
      const green = Math.round(198 + 50 * warmth);
      const blue = Math.round(120 + 96 * warmth);
      // Steep, not linear. A gentle ramp at this opacity clips a fifth of the
      // sky to flat white, which costs the aureole its colour and — because
      // this canvas is also the light source — flattens the image-based
      // lighting back towards the uniform ambient it exists to replace. Only
      // the few degrees immediately around the disc should blow out.
      const core = 0.78;
      const glow = context.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
      glow.addColorStop(0, `rgba(255, ${green}, ${blue}, ${core})`);
      glow.addColorStop(0.12, `rgba(255, ${green}, ${blue}, ${core * 0.34})`);
      glow.addColorStop(0.4, `rgba(255, ${green}, ${blue}, ${core * 0.1})`);
      glow.addColorStop(1, `rgba(255, ${green}, ${blue}, 0)`);
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = glow;
      // Drawn three times across the seam so a sun near u = 0 does not lose half
      // its glow off the edge of a texture that wraps in the world. Canvas
      // gradients live in user space, so translating the context moves the glow
      // with it.
      for (const offset of [-skyCanvas.width, 0, skyCanvas.width]) {
        context.setTransform(1, 0, 0, 1, offset, 0);
        context.fillRect(-offset, 0, skyCanvas.width, height);
      }
      context.restore();
    }

    skyTexture.needsUpdate = true;
    skyVersion += 1;
    return skyTexture;
  }

  return {
    object: group,

    /** The painted sky, for whoever wants to light the scene with it. */
    getSkyTexture() {
      return skyTexture;
    },

    /** Increments whenever the sky is actually repainted. */
    getSkyVersion() {
      return skyVersion;
    },

    /**
     * Place and colour the sun for a solar position, and return the sky behind
     * it. Pass null — or a study that is switched off — to put both away.
     */
    update(sun) {
      if (!sun?.enabled) {
        group.visible = false;
        return null;
      }

      const altitudeDeg = (sun.altitude * 180) / Math.PI;
      sunWorldDirection(sun, direction);

      // Below the horizon there is a sky to show and no sun to show in it.
      group.visible = sun.altitude > 0 && Boolean(disc);

      if (group.visible) {
        // The same warmth curve the key light uses, so the disc you can see and
        // the light you can measure agree about how low the sun is.
        const warmth = Math.min(1, Math.max(0, Math.sin(sun.altitude) / Math.sin(Math.PI / 6)));
        disc.material.color.setRGB(1, 0.78 + 0.2 * warmth, 0.55 + 0.42 * warmth);
        glare.material.color.setRGB(1, 0.55 + 0.32 * warmth, 0.26 + 0.45 * warmth);
        // A low sun is a bigger, softer glare — the light is travelling through
        // more atmosphere to reach you, which is the same reason it is redder.
        glare.material.opacity = 0.9 - 0.25 * warmth;
      }

      return paintSky(altitudeDeg);
    },

    /**
     * Hold the sun at a fixed distance along its direction from the camera, and
     * size it to a constant angle. Call once per frame, before rendering.
     */
    followCamera(camera) {
      if (!group.visible) return;

      const distance = camera.far * SUN_DISTANCE_FRACTION;
      group.position.copy(camera.position).addScaledVector(direction, distance);

      const angularSize = (degrees) => 2 * distance * Math.tan(THREE.MathUtils.degToRad(degrees) / 2);
      disc.scale.setScalar(angularSize(DISC_ANGLE_DEG));
      glare.scale.setScalar(angularSize(GLARE_ANGLE_DEG));
    },

    dispose() {
      for (const sprite of [glare, disc]) {
        if (!sprite) continue;
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      skyTexture?.dispose();
    },
  };
}
