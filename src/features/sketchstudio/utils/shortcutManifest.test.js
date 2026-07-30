import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, TOOL_SHORTCUT_MAP } from '../hooks/sketchConstants';
import {
  SHORTCUT_OVERLAY_FOOTNOTE,
  SHORTCUT_OVERLAY_TITLE,
  SHORTCUT_OVERLAY_TOGGLE_KEY,
  SHORTCUT_SECTIONS,
  buildShortcutSections,
} from './shortcutManifest';

function getAllEntries(sections) {
  return sections.flatMap((section) => section.entries);
}

function getSoloKeys(sections) {
  return getAllEntries(sections)
    .flatMap((entry) => entry.combos)
    .filter((combo) => combo.length === 1)
    .map((combo) => combo[0].toUpperCase());
}

describe('shortcutManifest', () => {
  it('exposes the toggle key, title, and footnote used by the overlay', () => {
    expect(SHORTCUT_OVERLAY_TOGGLE_KEY).toBe('?');
    expect(SHORTCUT_OVERLAY_TITLE.trim().length).toBeGreaterThan(0);
    expect(SHORTCUT_OVERLAY_FOOTNOTE.trim().length).toBeGreaterThan(0);
  });

  it('builds a fresh section list that matches the cached export', () => {
    expect(buildShortcutSections()).toEqual(SHORTCUT_SECTIONS);
  });

  it('derives one tool row per TOOL_SHORTCUT_MAP entry', () => {
    const toolSection = SHORTCUT_SECTIONS.find((section) => section.id === 'tools');

    expect(toolSection).toBeDefined();
    expect(toolSection.entries).toHaveLength(TOOL_SHORTCUT_MAP.size);
  });

  it('lists every TOOL_SHORTCUT_MAP key exactly once with a non-empty label', () => {
    const soloKeys = getSoloKeys(SHORTCUT_SECTIONS);
    const entriesByShortcutKey = new Map(
      getAllEntries(SHORTCUT_SECTIONS)
        .filter((entry) => entry.shortcutKey)
        .map((entry) => [entry.shortcutKey, entry]),
    );

    for (const [shortcutKey, toolId] of TOOL_SHORTCUT_MAP) {
      const matches = soloKeys.filter((key) => key === shortcutKey.toUpperCase());
      expect(matches, `key ${shortcutKey} should appear exactly once`).toHaveLength(1);

      const entry = entriesByShortcutKey.get(shortcutKey);
      expect(entry, `key ${shortcutKey} should have a manifest entry`).toBeDefined();
      expect(entry.toolId).toBe(toolId);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('labels tool rows from TOOL_DEFINITIONS so renames cannot drift', () => {
    const toolSection = SHORTCUT_SECTIONS.find((section) => section.id === 'tools');

    for (const entry of toolSection.entries) {
      const tool = TOOL_DEFINITIONS.find((definition) => definition.id === entry.toolId);

      expect(tool).toBeDefined();
      expect(entry.label).toBe(tool.label);
      expect(entry.detail).toBe(tool.description);
      expect(entry.combos).toEqual([[tool.shortcut.toUpperCase()]]);
    }
  });

  it('keeps every static section well-formed', () => {
    const staticSections = SHORTCUT_SECTIONS.filter((section) => section.id !== 'tools');

    expect(staticSections.map((section) => section.id)).toEqual(['editing', 'selection', 'drafting', 'view']);

    for (const section of staticSections) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.entries.length).toBeGreaterThan(0);

      for (const entry of section.entries) {
        expect(entry.label.trim().length).toBeGreaterThan(0);
        expect(entry.detail === null || entry.detail.trim().length > 0).toBe(true);
        expect(Array.isArray(entry.combos)).toBe(true);
        expect(entry.combos.length).toBeGreaterThan(0);

        for (const combo of entry.combos) {
          expect(Array.isArray(combo)).toBe(true);
          expect(combo.length).toBeGreaterThan(0);

          for (const chip of combo) {
            expect(typeof chip).toBe('string');
            expect(chip.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('uses unique section ids and unique entry ids', () => {
    const sectionIds = SHORTCUT_SECTIONS.map((section) => section.id);
    const entryIds = getAllEntries(SHORTCUT_SECTIONS).map((entry) => entry.id);

    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(new Set(entryIds).size).toBe(entryIds.length);
  });

  it('documents the non-tool bindings implemented in useSketchKeyboard', () => {
    const entryIds = getAllEntries(SHORTCUT_SECTIONS).map((entry) => entry.id);

    expect(entryIds).toEqual(
      expect.arrayContaining([
        'undo',
        'redo',
        'group',
        'ungroup',
        'delete',
        'nudge',
        'nudge-large',
        'commit-draft',
        'cancel-draft',
        'polyline-undo-vertex',
        'fillet-radius-up',
        'fillet-radius-down',
        'space-pan',
        'toggle-overlay',
      ]),
    );
  });
});
