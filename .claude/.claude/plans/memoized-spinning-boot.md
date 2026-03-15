# Redesign `.profile-postcards-parent-container` — Editorial Luxury Polish

## Context
The `.profile-postcards-parent-container` and its child elements use generic fonts (Nunito), cold shadows (`rgba(0,0,0,...)`), and undersized typography (grid titles at 0.68rem). This doesn't match the editorial luxury aesthetic used across the rest of the app (Playfair Display headings, Lora body, warm amber accents, refined glass morphism). This is a **CSS-only** redesign — no JSX changes needed.

## File to Modify
`client/src/components/HomePage/postCards/ProfilePostCards/profilepostcards.css`

## Changes

### 1. Parent Container (`.profile-postcards-parent-container`)
- `padding` → `1.5rem 1.5rem 1.25rem` (more breathing room)
- `gap` → `20px`
- Add `box-shadow: 0 1px 4px rgba(80,60,40,0.04)` (subtle warm lift)

### 2. Header Row (`.postcards-header-row`)
- Add `border-bottom: 1px solid var(--border-card)` + `padding-bottom: 0.65rem` (divider between header and content)

### 3. Heading (`.postcards-heading`)
- `font-family` → `"Playfair Display", Georgia, serif` (editorial display font)
- `font-size` → `1.1rem`, `font-weight` → `600`, `letter-spacing` → `-0.015em`

### 4. Count Badge (`.postcards-count`)
- `font-family` → `var(--font-ui)`, `font-size` → `0.85rem`, `font-weight` → `500`
- Add `opacity: 0.7` to subordinate it

### 5. View Toggle (`.postcards-view-toggle-btn`)
- `border-radius` → `10px`, `border` → `1px solid var(--border-light)`, `transition` → `all 0.2s ease`
- **Hover**: amber accent border (`rgba(212,168,83,0.3)`), amber icon color, `translateY(-1px)` micro-lift
- **Active (.is-active)**: amber wash bg (`rgba(212,168,83,0.1)`), amber icon, `box-shadow: 0 0 0 2px rgba(212,168,83,0.08)`

### 6. Grid View (`.postcards-grid-view`)
- `gap` → `12px`

### 7. Grid Cards (`.postcards-grid-item`)
- `border-radius` → `12px`
- Add resting `box-shadow: var(--shadow-card-sm)`
- `transition` timing → `0.25s ease`
- **Hover**: warm shadows `rgba(80,60,40,...)`, amber border tint `rgba(212,168,83,0.15)`
- **Dark hover**: amber border `rgba(212,168,83,0.12)` instead of white

### 8. Grid Image (`.postcards-grid-img-wrap`)
- Border radii → `12px`, add `background-color: var(--bg-secondary)` placeholder

### 9. Grid Body (`.postcards-grid-body`)
- `padding` → `0.55rem 0.65rem 0.5rem`, `gap` → `0.25rem`

### 10. Grid Title (`.postcards-grid-title`) — biggest visual upgrade
- `font-family` → `var(--font-serif)` (Lora — editorial DNA)
- `font-size` → `0.78rem` (up from 0.68rem), `font-weight` → `500`, `line-height` → `1.35`
- `color` → `var(--text-primary)` for stronger contrast

### 11. Grid Snippet (`.postcards-grid-snippet`)
- `font-size` → `0.68rem` (up from 0.6rem — now readable)
- `opacity` → `0.65`, `color` → `var(--text-muted)`, `line-height` → `1.45`

### 12. Grid Footer (`.postcards-grid-body-footer`)
- Add `border-top: 1px solid var(--border-card)`, `padding-top` → `0.35rem`

### 13. Grid Privacy/Settings Icons
- Privacy icon: add `opacity: 0.6`, reveal to `0.85` on card hover
- Settings icon: reduce to `18px`, `opacity: 0.5` at rest, `0.85` on hover

### 14. List View (`.postcards-list-view`)
- `gap` → `16px`

### 15. List Card (`.profile-postcards`)
- Add resting `box-shadow: var(--shadow-card-sm)`
- **Hover**: warm shadows `rgba(80,60,40,...)`, amber border `rgba(212,168,83,0.15)`
- **Dark hover**: amber border `rgba(212,168,83,0.12)`

### 16. List Card Content (`.user-profile-card-content`)
- `padding` → `1.15rem 1.4rem 0.9rem 1.4rem`, `gap` → `0.55rem`

### 17. List Title (`.feed-title-profile-page`)
- `font-family` → `var(--font-serif)` (Lora)
- `font-size` → `1.05rem`, `font-weight` → `600`, `letter-spacing` → `-0.02em`, `line-height` → `1.35`

### 18. List Preview Text (`.feed-text-content-profile-page`)
- Add 3-line clamp (`-webkit-line-clamp: 3`)
- `color` → `var(--text-secondary)` (more readable than `--text-body`)

### 19. Author Name (`.user-newsfeed-name-profile-page`)
- `font-family` → `var(--font-ui)` (Outfit replaces Nunito), `font-size` → `0.78rem`, `font-weight` → `600`

### 20. All "Nunito" → `var(--font-ui)` replacements
- `.delete-button`, `.edit-button`, `.only-me-bttn`, `.public-post-bttn` → `var(--font-ui)`, `font-weight: 600`
- `.confirmation-delete-heading`, `.confirm-buttons-yes`, `.confirm-buttons-cancel` → `var(--font-ui)`
- `.journal-is-deleted-message-container` → `"Playfair Display"` (celebratory display)
- `.delete-journal-loader-container` → `var(--font-ui)`

### 21. Dialog Polish
- Confirm dialog: `border-radius` → `16px`, warm shadow, pill buttons (`border-radius: 20px`)
- Settings dropdown: `box-shadow` → `var(--shadow-dropdown)`, `border-radius` → `14px`

### 22. Loading Container (`.profile-postcards-loading-container`)
- `font-family` → `var(--font-ui)`, `font-weight` → `500`, `font-size` → `0.88rem`
- `height` → `60vh` (was 100vh — excessive), add `opacity: 0.75`

### 23. In-View Loader (`.in-view-container`)
- `height` → `24px`, `margin-top` → `0.5rem`, add `opacity: 0.7`

### 24. Mobile Breakpoint Updates (428px)
- `.postcards-heading`: `0.95rem`
- `.postcards-grid-view`: `gap: 10px`
- Grid items/images: `border-radius: 10px`
- `.postcards-grid-title`: `0.72rem`
- `.postcards-grid-snippet`: `0.62rem`, 1-line clamp
- `.user-newsfeed-name-profile-page`: `0.7rem`
- `.profile-postcards-loading-container`: `height: 50vh`
- `.postcards-header-row`: ensure border-bottom + `padding-bottom: 0.5rem`

## Verification
1. Run `npm run dev` and navigate to `/profile` (own profile)
2. Check grid view: titles legible, warm shadows, amber hover accents, toggle button styling
3. Switch to list view: serif titles, preview text clamped, refined typography
4. Visit another user's profile: confirm VisitedProfilePostCards renders identically
5. Toggle dark mode: verify amber accents work, shadows appropriate
6. Resize to mobile (428px): grid switches to 2-col, text sizes adjust, no overflow
7. Test settings dropdown, delete confirmation, caption editor — all still functional
