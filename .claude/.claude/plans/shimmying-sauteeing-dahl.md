# Constellation Focus: Click Line → Spotlight Stars, Dim Universe

## Context

When a user clicks a constellation line, the two connected stars should glow intensely while the rest of the universe dims into darkness. This creates a dramatic "spotlight" effect that highlights the relationship between linked stars.

---

## Implementation

### 1. Universe.jsx — State + Handlers + Overlay

**New state:**
```js
const [focusedConstellation, setFocusedConstellation] = useState(null);
```

**Derived focused star IDs:**
```js
const focusedStarIds = useMemo(() => {
    if (!focusedConstellation) return null;
    return new Set([focusedConstellation.star_id_a, focusedConstellation.star_id_b]);
}, [focusedConstellation]);
```

**Callbacks:**
- `handleConstellationFocus(link)` — sets `focusedConstellation`, clears `selectedPost`
- `handleDismissFocus()` — sets `focusedConstellation` to `null`
- Skip focus if in link mode

**ESC handler:** Extend existing ESC useEffect pattern to also dismiss constellation focus.

**Pass new props:**
- `ConstellationLayer`: `onConstellationFocus`, `focusedConstellationId`
- `InteractiveLayer`: `focusedStarIds`

**CSS overlay div** (after warp overlay):
```jsx
{focusedConstellation && (
    <div className={styles.constellationFocusOverlay} onClick={handleDismissFocus} />
)}
```
- z-index 5 (below UI at 1010, but provides click-to-dismiss area)
- Dark semi-transparent background with subtle blur
- `pointer-events: auto` for dismissal

### 2. ConstellationLayer.jsx — Clickable Lines + Focus Rendering

**Add `Line` import** back from `react-konva` (for hit detection only).

**New props:** `onConstellationFocus`, `focusedConstellationId`

**Remove `listening={false}` from Layer.** Keep it on Shape and Text.

**Add hit detection Lines** after the labels (accepted lines only):
```jsx
{resolvedLinks.filter(l => !l.isPending).map((link) => (
    <Line
        key={`hit-${link.id}`}
        points={[link.ax, link.ay, link.bx, link.by]}
        stroke="transparent"
        strokeWidth={1}
        hitStrokeWidth={20}
        onClick={() => onConstellationFocus?.(link)}
        onTap={() => onConstellationFocus?.(link)}
        perfectDrawEnabled={false}
    />
))}
```

**Modify Shape sceneFunc** — when `focusedConstellationId` is set:
- Focused line: boost opacity (underglow 0.15, body 0.3, core 0.7) + larger shadowBlur (30, 14)
- Non-focused lines: heavily dimmed (opacity ~0.02) — nearly invisible

### 3. InteractiveLayer.jsx — Thread Focus to Stars

**New prop:** `focusedStarIds`

**In star render loop:**
```js
const isFocused = focusedStarIds?.has(post.id) || false;
const isDimmed = focusedStarIds != null && !isFocused;
```
Pass `isFocused` and `isDimmed` to `<StarGroup>`.

**Dim other elements when focused:** Galaxy labels, bridges, and galaxy visuals get reduced opacity when `focusedStarIds` is set (wrap their rendering shapes with conditional opacity).

### 4. StarGroup.jsx — Enhanced Glow + Dim States

**New props:** `isFocused`, `isDimmed`

**When `isDimmed`:** Set Group opacity to `0.06` — stars nearly vanish.

**When `isFocused`:** Enhanced glow effect:
- Outer atmosphere: `shadowBlur` increases from `r * 5` → `r * 12`
- Add extra wide glow circle: `radius={r * 5}`, radial gradient, very soft
- Core: slightly larger, brighter shadow

### 5. Universe.module.css — Focus Overlay

```css
.constellationFocusOverlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: auto;
    cursor: pointer;
    animation: constellationFocusFadeIn 0.35s ease-out;
}

@keyframes constellationFocusFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `Universe.jsx` | `focusedConstellation` state, derived `focusedStarIds`, focus/dismiss handlers, ESC key, overlay div, pass props |
| `ConstellationLayer.jsx` | Import `Line`, add hit detection lines, focus-aware rendering in sceneFunc, remove `listening={false}` from Layer |
| `InteractiveLayer.jsx` | Accept `focusedStarIds`, compute `isFocused`/`isDimmed` per star, dim other elements |
| `StarGroup.jsx` | Accept `isFocused`/`isDimmed`, enhanced glow when focused, reduced opacity when dimmed |
| `Universe.module.css` | Add `.constellationFocusOverlay` style |

---

## Verification

1. Click an accepted constellation line → two stars glow intensely, everything else dims
2. Press ESC or click the dark overlay → focus dismissed, universe returns to normal
3. Non-accepted (pending) lines are not clickable
4. Link mode is not affected (focus clicks ignored during link mode)
5. Clicking a star while not in focus mode still works normally (star selection)
