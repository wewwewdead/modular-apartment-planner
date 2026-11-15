// @vitest-environment jsdom
// The station panels on their own (ShopStationPanels.jsx): engraved readouts
// are not inputs, the RAL swatches, the part's group in the paint booth, the
// image upload.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PaintPanel, PrintPanel } from './ShopStationPanels.jsx';
import { FINISH_DEFAULTS, paintNumbers } from './paintStation.js';
import { PRINT_DEFAULTS } from './printStation.js';
import { RAL_CLASSIC } from './shopCatalog.js';

afterEach(() => cleanup());

it('the paint booth: every RAL swatch by name, the readouts, the hex note, the part’s group', () => {
  const onFinish = vi.fn(),
    onWhole = vi.fn();
  render(
    <PaintPanel
      view={{
        stage: 'colour',
        targets: [{ id: 'a', name: 'Plate', finish: null }],
        group: { id: 'g', name: 'Frame', instanceIds: ['a', 'b', 'c'] },
        finish: { ...FINISH_DEFAULTS },
        numbers: paintNumbers({ area: 50000, kind: 'powder', thickness: 70 }),
        holes: [{ size: 0.8, where: 'a drilled hole' }],
        prints: [],
      }}
      onFinish={onFinish}
      onWhole={onWhole}
    />,
  );
  const panel = screen.getByRole('region', { name: 'Paint booth' });
  const swatches = within(within(panel).getByRole('group', { name: 'RAL colours' })).getAllByRole('button');
  expect(swatches.map((b) => b.getAttribute('aria-label'))).toEqual(RAL_CLASSIC.map((r) => r.name));
  expect(within(panel).getByRole('button', { name: 'RAL 7035 Light grey' }).getAttribute('aria-pressed')).toBe('true');
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'RAL 3020 Traffic red' })));
  expect(onFinish).toHaveBeenLastCalledWith({ name: 'RAL 3020 Traffic red', colour: '#bb1e10' });
  expect(within(panel).getByLabelText('Painted area').textContent).toBe('0.05 m²');
  expect(within(panel).getByText(/screen approximations of the printed RAL cards/)).toBeTruthy();
  expect(within(panel).getByText(/0.8 mm \(a drilled hole\) is likely to fill/)).toBeTruthy();
  // The picked part's group, in one click; "weldment" is no longer a word of the booth.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Paint the whole Frame (3 parts)' })));
  expect(onWhole).toHaveBeenCalledTimes(1);
  expect(panel.textContent).not.toMatch(/weld/i);
});

it('the print panel: an image goes to onImage; its size readout', () => {
  const onImage = vi.fn();
  const view = (draft) => ({
    stage: 'face',
    draft,
    imageInfo: draft.image ? { width: 1024, height: 768 } : null,
    selected: null,
    selectedPart: '',
    warnings: [],
    notes: [],
    prints: [],
  });
  const { rerender } = render(<PrintPanel view={view({ ...PRINT_DEFAULTS, kind: 'image' })} onImage={onImage} />);
  const panel = screen.getByRole('region', { name: 'Print station' });
  expect(within(panel).getByLabelText('Image size').textContent).toBe(
    'No image yet: at most 1024 px and 512 KB once fitted',
  );
  const file = new File(['x'], 'logo.png', { type: 'image/png' });
  act(() => fireEvent.change(within(panel).getByLabelText('Upload image'), { target: { files: [file] } }));
  expect(onImage).toHaveBeenCalledWith(file);
  rerender(
    <PrintPanel
      view={view({ ...PRINT_DEFAULTS, kind: 'image', image: `data:image/png;base64,${'A'.repeat(2048)}` })}
      onImage={onImage}
    />,
  );
  expect(within(panel).getByLabelText('Image size').textContent).toBe('1024 × 768 px · 2 KB in the model');
  expect(within(panel).getByRole('button', { name: 'New print' }).disabled).toBe(true);
});
