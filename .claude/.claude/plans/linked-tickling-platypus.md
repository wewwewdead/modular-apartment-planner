# Toast Redesign — Simple, Aesthetic, Cute

## Context
The current toast uses a glass morphism + left color stripe + circular icon badge pattern that feels generic/"AI slop." The goal is a redesign that feels intentional, warm, and charming — matching iskrib's editorial personality without the cookie-cutter look.

## Design Direction: "Warm Whisper"
Compact pill toasts that feel like gentle paper notes. No glass morphism, no colored circles, no left stripe. Just clean type, a tiny inline icon, and a soft warm surface.

**Key aesthetic choices:**
- **Shape:** Rounded pill (border-radius 20px) — compact, friendly
- **Background:** Solid warm tones per type (not glass blur) — soft sage for success, warm rose for error, honey for warning, soft lavender for info
- **Icon:** Small inline SVG (16px), no circle background — sits naturally in the text flow
- **Typography:** Outfit at 13px, medium weight — clean and readable
- **Close:** Tiny × that only appears on hover (keeps it clean)
- **Animation:** Gentle pop-in from bottom with slight bounce, fade out on dismiss
- **Auto-dismiss indicator:** Thin bottom progress bar that shrinks over time (same color as icon, subtle)
- **Position:** Bottom-center on all screens (more modern feel)

## Files to Modify

### 1. `client/src/components/Toast/Toast.css` — Full rewrite
- Remove glass morphism, left stripe, circular icon styles
- New pill shape with solid warm backgrounds
- Bottom-center positioning
- Progress bar animation via CSS `@keyframes`
- Hover-reveal close button
- Dark mode variants using existing CSS variables

### 2. `client/src/components/Toast/Toast.jsx` — Minor updates
- Simplify icon SVGs (smaller, thinner strokes)
- Add progress bar div with CSS animation tied to duration
- Close button visibility on hover (CSS handles this, no JS change needed)
- Keep Framer Motion animations but adjust values for the new pop-in feel

### 3. `client/src/components/Toast/ToastContext.jsx` — No changes
### 4. `client/src/components/Toast/ToastContainer.jsx` — No changes

## Color Palette (light mode)
| Type    | Background       | Icon/Text accent | Progress bar     |
|---------|-----------------|------------------|------------------|
| success | `#E8F5E9`       | `#2E7D32`        | `#2E7D32` at 20% |
| error   | `#FFEBEE`       | `#C62828`        | `#C62828` at 20% |
| warning | `#FFF8E1`       | `#E65100`        | `#E65100` at 20% |
| info    | `#EDE7F6`       | `#5E35B1`        | `#5E35B1` at 20% |

## Color Palette (dark mode)
Desaturated, muted versions of the above that blend with the dark theme.

## Verification
- Trigger each toast type (success, error, warning, info) and verify appearance
- Check hover reveals close button
- Verify auto-dismiss progress bar animates correctly
- Test dark mode
- Test mobile (bottom-center, max-width 340px)
- Confirm existing `useToast` API unchanged — no consumer changes needed
