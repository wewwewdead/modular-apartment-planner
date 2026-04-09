# Design System

All design tokens live in `src/styles/variables.css`. This document reflects the current state of the codebase.

## Color Palette

### Light Theme (Homepage, Floorplan Editor)

**Canvas**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#FAFAF8` | Canvas/page background |
| `--color-wall-fill` | `#2D3444` | Wall interiors |
| `--color-wall-stroke` | `#1E2433` | Wall outlines |
| `--color-grid-minor` | `#E6E4DE` | Minor grid lines |
| `--color-grid-major` | `#D0CDC5` | Major grid lines |
| `--color-selection` | `#10B981` | Selection highlight |
| `--color-selection-fill` | `rgba(16, 185, 129, 0.08)` | Selection area fill |

**UI Chrome**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-text-primary` | `#1E2433` | Primary text |
| `--color-text-secondary` | `#5B6275` | Secondary text |
| `--color-text-tertiary` | `#6E7280` | Tertiary/muted text |
| `--color-panel-bg` | `#F4F3F0` | Panel backgrounds |
| `--color-panel-bg-alt` | `#EAEAE7` | Alternate panel backgrounds |
| `--color-surface-elevated` | `#FFFFFF` | Elevated surfaces |
| `--color-border` | `rgba(0, 0, 0, 0.08)` | Default borders |
| `--color-border-subtle` | `rgba(0, 0, 0, 0.05)` | Subtle borders |
| `--color-divider` | `rgba(0, 0, 0, 0.06)` | Divider lines |

**Interactive**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent` | `#1A7A68` | Primary accent (teal) |
| `--color-accent-hover` | `#156B5A` | Accent hover state |
| `--color-accent-subtle` | `rgba(26, 122, 104, 0.08)` | Accent background tint |
| `--color-danger` | `#DC2626` | Destructive actions |
| `--color-danger-hover` | `#B91C1C` | Danger hover state |
| `--color-active-glow` | `#2D5F8E` | Active/focused state (Prussian ink blue) |

**Status**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-info` | `#3B82F6` | Informational |
| `--color-success` | `#10B981` | Success/valid |
| `--color-warning` | `#F59E0B` | Warning/caution |

### Dark Theme (Sketch Studio, Craftsman)

**Backgrounds**
| Token | Value | Usage |
|-------|-------|-------|
| `--dark-bg-primary` | `#1e2433` | Main background |
| `--dark-bg-surface` | `#252540` | Surface/card background |
| `--dark-bg-elevated` | `rgba(17, 24, 34, 0.8)` | Elevated surfaces |
| `--dark-bg-deep` | `rgba(8, 12, 18, 0.88)` | Deep backgrounds (toolbar) |
| `--dark-bg-input` | `#252540` | Input fields |
| `--dark-bg-card` | `#2a2a44` | Card backgrounds |
| `--dark-bg-card-hover` | `#3a3a5a` | Card hover |

**Text**
| Token | Value | Usage |
|-------|-------|-------|
| `--dark-text-primary` | `#fafaf8` | Primary text |
| `--dark-text-secondary` | `#7a93b5` | Secondary text |
| `--dark-text-tertiary` | `#667a94` | Tertiary text |
| `--dark-text-muted` | `#9eb2cf` | Muted text |
| `--dark-text-dim` | `#8a8a8a` | Dimmed text (WCAG AA: ~5.0:1 on `#1e2433`) |

**Accents**
| Token | Value | Usage |
|-------|-------|-------|
| `--dark-accent-craftsman` | `#d4856b` | Primary Craftsman accent (terracotta) |
| `--dark-accent-craftsman-hover` | `#c07460` | Craftsman hover |
| `--dark-accent-active` | `#b8f5e5` | Active/selected state |
| `--dark-accent-success` | `#51cf66` | Success |
| `--dark-accent-error` | `#ff6b6b` | Error |
| `--dark-accent-param-blue` | `#4a9eff` | Parametric variable accent |

**Borders**
| Token | Value | Usage |
|-------|-------|-------|
| `--dark-border` | `rgba(136, 165, 201, 0.12)` | Default dark borders |
| `--dark-border-hover` | `rgba(136, 165, 201, 0.28)` | Hover borders |
| `--dark-border-strong` | `#333` | Strong borders |
| `--dark-border-section` | `#2a2a3e` | Section dividers |

### Workspace Accents

| Token                         | Value     | Usage                             |
| ----------------------------- | --------- | --------------------------------- |
| `--color-workspace-floorplan` | `#1A7A68` | Floorplan workspace indicator     |
| `--color-workspace-sketch`    | `#4A72B0` | Sketch Studio workspace indicator |

---

## Typography

| Role           | Token              | Font Stack                             | Usage                                                     |
| -------------- | ------------------ | -------------------------------------- | --------------------------------------------------------- |
| UI/Body        | `--font-ui`        | Manrope, system-ui, sans-serif         | All interface text, labels, descriptions                  |
| Headings       | `--font-heading`   | Manrope, system-ui, sans-serif         | Section headers (same as UI, distinguished by weight)     |
| Display        | `--font-display`   | Instrument Serif, Georgia, serif       | Hero text, landing page headings (italic)                 |
| Code/Blueprint | `--font-blueprint` | JetBrains Mono, Courier New, monospace | Dimensions, coordinates, BOM data, parametric expressions |

All fonts are self-hosted as woff2 in `public/fonts/` (68KB total, Latin subset).

**Note:** No type-scale tokens exist yet. Font sizes are raw `px`/`rem` values throughout the codebase. A future improvement could add `--text-xs` through `--text-2xl` tokens.

---

## Spacing Scale

| Token         | Value |
| ------------- | ----- |
| `--space-2xs` | 2px   |
| `--space-xs`  | 4px   |
| `--space-sm`  | 8px   |
| `--space-md`  | 12px  |
| `--space-lg`  | 16px  |
| `--space-xl`  | 24px  |
| `--space-xxl` | 32px  |

**Note:** Spacing tokens are defined but not universally adopted. Floorplan UI files reference the scale. Craftsman and Sketch Studio files use raw `px` values that happen to align with the scale (see TODOS.md "Spacing Tokens Unadopted").

---

## Border Radius

| Token         | Value |
| ------------- | ----- |
| `--radius-xs` | 4px   |
| `--radius-sm` | 5px   |
| `--radius-md` | 8px   |
| `--radius-lg` | 12px  |
| `--radius-xl` | 16px  |

---

## Shadows

| Token                  | Usage                                 |
| ---------------------- | ------------------------------------- |
| `--shadow-sm`          | Subtle elevation (buttons, inputs)    |
| `--shadow-md`          | Medium elevation (cards, dropdowns)   |
| `--shadow-lg`          | High elevation (modals, popovers)     |
| `--shadow-overlay`     | Overlay panels                        |
| `--shadow-hover`       | Hover state lift                      |
| `--shadow-pressed`     | Pressed/active state (inset)          |
| `--shadow-active-glow` | Active selection glow (Prussian blue) |
| `--shadow-glass`       | Glassmorphism surfaces                |
| `--shadow-floating`    | Floating elements                     |
| `--shadow-toolbar`     | Toolbar shadow                        |

---

## Transitions

| Token                | Value                                  | Usage                |
| -------------------- | -------------------------------------- | -------------------- |
| `--ease-out`         | `cubic-bezier(0.16, 1, 0.3, 1)`        | Default ease-out     |
| `--ease-spring`      | `cubic-bezier(0.34, 1.56, 0.64, 1)`    | Bouncy spring        |
| `--ease-tactile`     | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Tactile feedback     |
| `--ease-in-out-soft` | `cubic-bezier(0.4, 0, 0.2, 1)`         | Smooth in-out        |
| `--duration-micro`   | 0.08s                                  | Tiny state changes   |
| `--duration-fast`    | 0.1s                                   | Fast feedback        |
| `--duration-normal`  | 0.2s                                   | Standard transitions |
| `--duration-layout`  | 0.25s                                  | Layout shifts        |
| `--duration-smooth`  | 0.3s                                   | Smooth animations    |

---

## Layout

| Token                | Value |
| -------------------- | ----- |
| `--toolbar-height`   | 52px  |
| `--sidebar-width`    | 256px |
| `--properties-width` | 288px |

---

## Themes

The app uses three visual contexts, which is an intentional design choice matching CAD/design tool conventions (light for drafting, dark for technical work):

| Context                   | Theme         | Background |
| ------------------------- | ------------- | ---------- |
| Homepage                  | Light (cream) | `#FAFAF8`  |
| Floorplan Editor          | Light (white) | `#FAFAF8`  |
| Sketch Studio / Craftsman | Dark (navy)   | `#1e2433`  |

---

## Known Inconsistencies

Documented for transparency (see TODOS.md for full context):

- **Breakpoints:** 9 different values used (480, 640, 720, 768, 900, 920, 1024, 1100, 1200px). Should consolidate to 3-4 canonical values.
- **Font sizes:** 23 distinct sizes with no type-scale tokens. Every `font-size` is a raw value.
- **Spacing adoption:** Craftsman and Sketch Studio CSS use raw `px` instead of `--space-*` tokens. Values align with the scale but don't reference the tokens.
- **Dark theme colors in Sketch Studio SVG:** ~60-70 hardcoded hex values in SVG entity styling. Domain-specific and harder to tokenize.
