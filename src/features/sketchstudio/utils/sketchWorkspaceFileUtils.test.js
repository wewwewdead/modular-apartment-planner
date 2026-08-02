import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankSketchDocument } from './sketchDocumentUtils';
import {
  getSketchWorkspaceFileName,
  isSketchRenamePending,
  openSketchWorkspaceFile,
  saveSketchWorkspaceFile,
} from './sketchWorkspaceFileUtils';

describe('sketchWorkspaceFileUtils', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
    globalThis.window = globalThis;
  });

  afterEach(() => {
    delete globalThis.showOpenFilePicker;
    delete globalThis.showSaveFilePicker;
    globalThis.window = originalWindow;
    vi.restoreAllMocks();
  });

  it('builds the expected sketch file name', () => {
    expect(getSketchWorkspaceFileName('My Desk')).toBe('My-Desk.sketch.json');
  });

  it('saves a sketch workspace through the native save picker when available', async () => {
    const write = vi.fn();
    const close = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const handle = { name: 'Desk.sketch.json', createWritable };
    globalThis.showSaveFilePicker = vi.fn().mockResolvedValue(handle);

    const result = await saveSketchWorkspaceFile(
      {
        document: createBlankSketchDocument({ name: 'Desk' }),
        objectDraft: null,
        viewport: { zoom: 1, panX: 0, panY: 0 },
        ui: { activeLayerId: 'default', snapEnabled: true, orthoEnabled: false },
      },
      {
        savedAt: '2026-03-22T00:00:00.000Z',
      },
    );

    expect(globalThis.showSaveFilePicker).toHaveBeenCalled();
    expect(createWritable).toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(result.fileHandle).toBe(handle);
    expect(result.fileName).toBe('Desk.sketch.json');
  });

  it('opens and deserializes a sketch workspace through the native open picker', async () => {
    const file = {
      name: 'Opened.sketch.json',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          kind: 'sketchstudio-workspace',
          version: 1,
          document: createBlankSketchDocument({ name: 'Opened Sketch' }),
          objectDraft: null,
          viewport: { zoom: 1, panX: 0, panY: 0 },
          ui: { activeLayerId: 'default', snapEnabled: true, orthoEnabled: false },
        }),
      ),
    };
    const handle = {
      name: 'Opened.sketch.json',
      getFile: vi.fn().mockResolvedValue(file),
    };
    globalThis.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);

    const result = await openSketchWorkspaceFile();

    expect(globalThis.showOpenFilePicker).toHaveBeenCalled();
    expect(handle.getFile).toHaveBeenCalled();
    expect(result.fileName).toBe('Opened.sketch.json');
    expect(result.workspace.document.name).toBe('Opened Sketch');
  });

  describe('isSketchRenamePending', () => {
    const fileHandle = { name: 'my-cabinet.sketch.json' };

    it('keeps plain Save silent when the document name is unchanged since the last save', () => {
      // The classic bug case: the user saved under a file name of their own
      // choosing, which differs from the document name. That must NOT force
      // the picker open on every subsequent save.
      expect(
        isSketchRenamePending({
          fileHandle,
          savedDocumentName: 'untitled sketch',
          documentName: 'untitled sketch',
        }),
      ).toBe(false);
    });

    it('re-prompts once the document is renamed after a save', () => {
      expect(
        isSketchRenamePending({
          fileHandle,
          savedDocumentName: 'untitled sketch',
          documentName: 'kitchen cabinet',
        }),
      ).toBe(true);
    });

    it('never reports a pending rename without a file handle or a recorded save', () => {
      expect(isSketchRenamePending({ fileHandle: null, savedDocumentName: 'a', documentName: 'b' })).toBe(false);
      expect(isSketchRenamePending({ fileHandle, savedDocumentName: null, documentName: 'b' })).toBe(false);
    });
  });
});
