import { describe, expect, it, vi } from 'vitest';
import { renderSceneToImage } from '@/features/floorplan/components/preview/renderToImage';
import { renderSheetPreviewImage } from './SheetViewportContent';

// A still costs a whole WebGL render; here it costs a call to count.
vi.mock('@/features/floorplan/components/preview/renderToImage', () => ({
  renderSceneToImage: vi.fn((project) => `data:image/png;${project.updatedAt}`),
}));

const source = (updatedAt, activeFloorId = 'floor_1') => ({ project: { id: 'p1', updatedAt }, activeFloorId });

describe('sheet axonometric cache', () => {
  it('reuses the still for an unchanged project', async () => {
    const first = await renderSheetPreviewImage(source('reuse-1'));
    const again = await renderSheetPreviewImage(source('reuse-1'));
    expect(again).toBe(first);
    expect(renderSceneToImage).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest still per project and floor', async () => {
    vi.mocked(renderSceneToImage).mockClear();
    await renderSheetPreviewImage(source('t1'));
    await renderSheetPreviewImage(source('t1', 'floor_2'));
    await renderSheetPreviewImage(source('t2'));
    expect(renderSceneToImage).toHaveBeenCalledTimes(3);

    // t1 on floor 1 was superseded by t2 and let go; floor 2's still was not.
    await renderSheetPreviewImage(source('t1', 'floor_2'));
    expect(renderSceneToImage).toHaveBeenCalledTimes(3);
    const back = await renderSheetPreviewImage(source('t1'));
    expect(renderSceneToImage).toHaveBeenCalledTimes(4);
    expect(back).toEqual({ status: 'ready', imageUrl: 'data:image/png;t1' });
  });
});
