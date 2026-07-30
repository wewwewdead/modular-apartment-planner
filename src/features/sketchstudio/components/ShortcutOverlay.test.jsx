import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShortcutOverlay from './ShortcutOverlay';
import { SHORTCUT_SECTIONS } from '../utils/shortcutManifest';

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

describe('ShortcutOverlay', () => {
  it('renders a modal dialog with a close button', () => {
    const markup = renderToStaticMarkup(<ShortcutOverlay onClose={() => {}} />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Close keyboard shortcuts"');
    expect(markup).toContain('Keyboard shortcuts');
  });

  it('renders every manifest section, label, and key chip', () => {
    const markup = renderToStaticMarkup(<ShortcutOverlay onClose={() => {}} />);

    for (const section of SHORTCUT_SECTIONS) {
      expect(markup).toContain(section.title);

      for (const entry of section.entries) {
        expect(markup).toContain(escapeHtml(entry.label));

        for (const chip of entry.combos.flat()) {
          expect(markup, `chip ${chip} should be rendered as a kbd`).toContain(`${escapeHtml(chip)}</kbd>`);
        }
      }
    }
  });

  it('renders alternative combinations separated by "or"', () => {
    const markup = renderToStaticMarkup(
      <ShortcutOverlay
        onClose={() => {}}
        sections={[
          {
            id: 'demo',
            title: 'Demo',
            entries: [{ id: 'demo-redo', label: 'Redo', detail: 'Alternate binding', combos: [['Ctrl', 'Y'], ['F4']] }],
          },
        ]}
      />,
    );

    expect(markup).toContain('Demo');
    expect(markup).toContain('Alternate binding');
    expect(markup).toContain('>or<');
    expect(markup).toContain('>+<');
    expect(markup).toContain('F4</kbd>');
  });
});
