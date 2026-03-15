# Soften Dark Mode — Warm Charcoal Instead of Pitch Black

## Context
The current dark mode uses near-black backgrounds (`#0C0C0C`, `#141414`, etc.) which feel too harsh. Shift to a warm charcoal palette — still clearly dark mode but softer, similar to Notion/Linear.

## File to Modify
`client/src/index.css` — `[data-theme="dark"]` block (lines 74–132)

## Changes

Update background variables to warm charcoal tones:

| Variable | Current | New |
|---|---|---|
| `--bg-primary` | `#0C0C0C` | `#1A1916` |
| `--bg-secondary` | `#141414` | `#222220` |
| `--bg-hover` | `#1E1E1C` | `#2C2C2A` |
| `--bg-elevated` | `#1A1A18` | `#262624` |
| `--bg-card` | `#161614` | `#1E1E1C` |
| `--bg-backdrop` | `rgba(12,12,12,0.8)` | `rgba(26,25,22,0.85)` |
| `--bg-backdrop-heavy` | `rgba(12,12,12,0.9)` | `rgba(26,25,22,0.92)` |
| `--bg-glass` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.07)` |
| `--text-separator` | `#2E2A26` | `#3A3632` |

Also bump border/glass opacity slightly for better visibility on lighter surfaces:

| Variable | Current | New |
|---|---|---|
| `--border-light` | `rgba(255,240,210,0.06)` | `rgba(255,240,210,0.08)` |
| `--border-card` | `rgba(255,240,210,0.04)` | `rgba(255,240,210,0.06)` |
| `--bg-glass-border` | `rgba(255,240,210,0.08)` | `rgba(255,240,210,0.10)` |

Soften shadows (less contrast needed on lighter dark bg):

| Variable | Current | New |
|---|---|---|
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.3)` | `0 2px 8px rgba(0,0,0,0.2)` |
| `--shadow-card-sm` | `0 1px 3px rgba(0,0,0,0.25)` | `0 1px 3px rgba(0,0,0,0.15)` |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,0.5)` | `0 8px 32px rgba(0,0,0,0.35)` |
| `--shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.4), ...` | `0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,240,210,0.06)` |

Text, accent, and icon colors stay unchanged — they already have good contrast against charcoal.

## Verification
- Toggle dark mode in browser and check: home feed, profile page, editor, modals, dropdowns
- Ensure text remains readable (WCAG contrast should improve slightly)
- Cards/elevated surfaces should be visually distinct from the background
