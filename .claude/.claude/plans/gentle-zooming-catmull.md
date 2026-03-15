# Stabilize Orbital Physics — "The Galactic Speed Limit"

## Context

Posts orbit their galaxy centers (user name = "the sun", posts = "planets"). The current code has:
- **Radial orbit spring** (orbitSpringK=0.0004) — holds posts at their natural orbit radius
- **Tangential drive** (orbitalDrive=0.0008) — constant perpendicular push for rotation
- **frictionAir=0.03** — velocity damping
- **N-body star-to-star** Barnes-Hut forces for semantic interaction

**Problem:** The radial spring + friction creates an *underdamped* oscillator (damping ratio ≈ 0.75 < 1). Posts bounce in-and-out radially while also drifting tangentially → looks like fast wobbly spinning. Additionally, posts clump together because there's no inter-body separation force.

---

## Plan

### 1. Overdamp the radial spring (stop the wobble)
**File:** `client/src/components/Universe/physics/matterEngine.js`

- `frictionAir`: 0.03 → **0.07** (heavy "space honey")
- `orbitSpringK`: 0.0004 → **0.0006** (slightly stiffer for tighter orbit control)
- New damping ratio = 0.07 / (2 × √0.0006) = **1.43 > 1 → overdamped** ✓
- Posts smoothly glide to their orbit radius instead of bouncing

### 2. Tune orbital speed for the new friction
**File:** `client/src/components/Universe/physics/matterEngine.js`

- `orbitalDrive`: 0.0008 → **0.002**
- Equilibrium speed: 0.002 × 0.93 / 0.07 ≈ **0.027 px/frame** (1.6 px/sec)
- At r=80: one orbit takes **~5 minutes** — peaceful, visible drift
- At r=150: one orbit takes **~10 minutes**

### 3. Elliptical orbits (organic feel)
**File:** `client/src/components/Universe/hooks/useStarPhysics.js`

- Apply a 1.2× multiplier to the X-component of the tangential drive
- This stretches orbits into gentle ellipses instead of perfect circles
- `tanX * orbitalDrive * 1.2` vs `tanY * orbitalDrive * 1.0`

### 4. Anti-clumping separation force ("personal space")
**File:** `client/src/components/Universe/hooks/useStarPhysics.js`

In the RAF force loop, after applying N-body + orbit forces, add a separation pass:
- For each pair of non-static bodies within 50px, apply an outward repulsion force
- Use a simple `O(n²)` pass (n = active awake bodies, typically < 100 on screen)
- Force = `separationStrength * (minSeparation - distance) / distance` in radial direction
- Config: `minSeparation: 50`, `separationStrength: 0.0005`

### 5. Set `inertia: Infinity` on star bodies (no angular spin)
**File:** `client/src/components/Universe/physics/matterEngine.js`

- In `createStarBody()`, add `inertia: Infinity` to the body options
- Prevents the Matter.js body from spinning on its axis (angular rotation artifacts)
- Only translational movement remains

### 6. Remove unused orbital velocity code
**File:** `client/src/components/Universe/physics/matterEngine.js`

- Remove `computeOrbitalVelocity()` — no longer called anywhere
- Keep `getGalaxyMass()` — still useful reference, low cost

---

## Files Changed

| File | Changes |
|------|---------|
| `physics/matterEngine.js` | Update PHYSICS_CONFIG (frictionAir, orbitSpringK, orbitalDrive, add minSeparation + separationStrength), add `inertia: Infinity` to createStarBody, remove computeOrbitalVelocity |
| `hooks/useStarPhysics.js` | Add elliptical orbit multiplier (1.2x on X), add separation force loop |

---

## Config Summary

| Param | Before | After | Effect |
|-------|--------|-------|--------|
| `frictionAir` | 0.03 | **0.07** | Overdamps radial oscillation → smooth orbit approach |
| `orbitSpringK` | 0.0004 | **0.0006** | Tighter orbit radius control |
| `orbitalDrive` | 0.0008 | **0.002** | ~5 min orbits (compensates for higher friction) |
| `minSeparation` | — | **50** | Posts push apart within 50px |
| `separationStrength` | — | **0.0005** | Gentle but firm anti-clumping |
| body `inertia` | default | **Infinity** | No angular spin on bodies |

---

## Verification

1. **No wobble:** Posts should glide smoothly to their orbit radius without bouncing in/out
2. **Gentle rotation:** Visible drift around galaxy center, ~5 min per full orbit at r=80
3. **No clumping:** Posts near each other maintain ≥50px separation
4. **Elliptical shape:** Orbits are slightly oval, not perfect circles
5. **Drag works:** Drag a star, release → smoothly re-enters orbit
6. **Performance:** 60fps maintained (separation force is O(n²) but n is small)
