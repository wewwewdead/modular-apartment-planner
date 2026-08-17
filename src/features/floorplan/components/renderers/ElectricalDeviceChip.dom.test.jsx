/* @vitest-environment jsdom */
/*
 * The device palette is the only way to place anything but a duplex outlet, and
 * it was unreachable while it lived in the toolbar's off-screen tail. These pin
 * that it appears over the plan whenever the Electrical tool is active, offers
 * all six devices, and writes the same toolState.deviceType the placement
 * handler reads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ELECTRICAL_DEVICE_TYPES, TOOLS } from '@/editor/tools';
import ElectricalDeviceChip from './ElectricalDeviceChip';

afterEach(cleanup);

function renderChip(overrides = {}) {
  const editorDispatch = vi.fn();
  const view = render(
    <ElectricalDeviceChip
      activeTool={TOOLS.ELECTRICAL}
      viewMode="plan"
      modelTarget="floor"
      floor={{ id: 'floor_1', walls: [], electricalDevices: [] }}
      deviceType={undefined}
      editorDispatch={editorDispatch}
      {...overrides}
    />,
  );
  const button = (label) => view.container.querySelector(`[aria-label="${label}"]`);
  return { container: view.container, editorDispatch, button };
}

describe('ElectricalDeviceChip', () => {
  it('offers every device with its plan-symbol code while the Electrical tool is active', () => {
    const { container, button } = renderChip();

    const group = container.querySelector('[role="group"][aria-label="Electrical device type"]');
    expect(group).not.toBeNull();
    expect(group.textContent).toContain('Device');

    const codes = [...group.querySelectorAll('button')].map((el) => el.textContent);
    expect(codes).toEqual(['DUP', 'GFCI', '220', 'S', 'S3', 'SD']);

    // Each button names the full device for screen readers, not just the code.
    expect(button('Outlet').textContent).toBe('DUP');
    expect(button('GFCI Outlet').textContent).toBe('GFCI');
    expect(button('220V Outlet').textContent).toBe('220');
    expect(button('Switch').textContent).toBe('S');
    expect(button('3-Way Switch').textContent).toBe('S3');
    expect(button('Dimmer Switch').textContent).toBe('SD');
  });

  it('stays off the canvas for every other tool and view', () => {
    expect(renderChip({ activeTool: TOOLS.WALL }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ viewMode: 'section_view' }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ modelTarget: 'roof' }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ floor: null }).container.textContent).toBe('');
  });

  it('writes the chosen device into the tool state the placement handler reads', () => {
    const { editorDispatch, button } = renderChip();

    fireEvent.click(button('GFCI Outlet'));
    expect(editorDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_TOOL_STATE',
      payload: { deviceType: ELECTRICAL_DEVICE_TYPES.OUTLET_GFCI },
    });

    fireEvent.click(button('Dimmer Switch'));
    expect(editorDispatch).toHaveBeenLastCalledWith({
      type: 'UPDATE_TOOL_STATE',
      payload: { deviceType: ELECTRICAL_DEVICE_TYPES.SWITCH_DIMMER },
    });
  });

  it('marks the device the tool state currently holds, defaulting to the duplex outlet', () => {
    // Nothing chosen yet is a duplex outlet, matching the handler's own fallback.
    const unset = renderChip();
    expect(unset.button('Outlet').getAttribute('aria-pressed')).toBe('true');
    expect(unset.button('3-Way Switch').getAttribute('aria-pressed')).toBe('false');
    expect(unset.button('Outlet').className).not.toBe(unset.button('3-Way Switch').className);
    cleanup();

    const threeWay = renderChip({ deviceType: ELECTRICAL_DEVICE_TYPES.SWITCH_3WAY });
    expect(threeWay.button('3-Way Switch').getAttribute('aria-pressed')).toBe('true');
    expect(threeWay.button('Outlet').getAttribute('aria-pressed')).toBe('false');
    expect(
      [...threeWay.container.querySelectorAll('[aria-pressed="true"]')].map((el) => el.getAttribute('aria-label')),
    ).toEqual(['3-Way Switch']);
  });
});
