/* global localStorage, document */
// Shared Playwright steps for the in-viewport sketcher (Phase A flow), used by
// verify-assemble-and-draw.mjs.
import { expect } from '@playwright/test';

export function cadSteps(page) {
  const properties = page.locator('.cad-properties');
  const toolbar = page.getByRole('toolbar', { name: 'Sketch tools' });
  const status = page.locator('.cad-sketch-status');
  const canvas = page.locator('.cad-viewport canvas');
  const current = () => page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  const saved = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null')?.document?.model,
    );
  // The recovery copy is written shortly after each edit; poll until it matches.
  const savedWhen = async (predicate, message) => {
    for (let i = 0; i < 100; i++) {
      const model = await saved();
      if (model && predicate(model)) return model;
      await page.waitForTimeout(100);
    }
    throw new Error(`Saved model never matched: ${message}`);
  };
  const canvasCenter = async () => {
    const box = await canvas.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  // Screen position of a world point in the 3D viewport.
  const project = (point) => page.evaluate((p) => document.querySelector('.cad-viewport').cadProject(p), point);
  const typeHud = async (first, second) => {
    await page.keyboard.type(String(first));
    if (second != null) {
      await page.keyboard.press('Tab');
      await page.keyboard.type(String(second));
    }
    await page.keyboard.press('Enter');
  };
  const sketchOnPlane = async (plane, offset = 0) => {
    await page.getByRole('button', { name: 'Sketch', exact: true }).click();
    await page.getByRole('button', { name: 'Sketch on plane', exact: true }).click();
    await properties.getByLabel('Sketch plane', { exact: true }).selectOption(plane);
    await properties.getByLabel('Plane offset (mm)', { exact: true }).fill(String(offset));
    await properties.getByRole('button', { name: 'Start sketch', exact: true }).click();
    await toolbar.waitFor();
  };
  const fill = async (label, value) => {
    const field = properties.getByLabel(label, { exact: true });
    await field.fill(String(value));
    await field.press('Enter');
  };
  const applyOperation = async (label, settings = {}) => {
    if (settings.name != null) await fill('Part name', settings.name);
    if (settings.distance != null) await fill('Distance (mm)', settings.distance);
    await expect(properties.getByRole('status')).toHaveText('Preview ready', { timeout: 60000 });
    await properties.getByRole('button', { name: label, exact: true }).click();
    await current();
  };
  const setPosition = async (x, y, z) => {
    const group = properties.getByRole('group', { name: 'Position (mm)', exact: true });
    for (const [axis, value] of [
      ['X', x],
      ['Y', y],
      ['Z', z],
    ]) {
      const field = group.getByLabel(axis, { exact: true });
      if (Number(await field.inputValue()) === value) continue;
      await field.fill(String(value));
      await field.press('Enter');
      await current();
    }
  };
  const view = (name) => page.getByLabel('Standard view').selectOption(name);
  // Paced drag (TransformControls needs real intermediate moves).
  const drag = async (from, to, steps = 8) => {
    await page.mouse.move(from[0], from[1]);
    await page.waitForTimeout(100);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await page.waitForTimeout(100);
    }
    await page.mouse.up();
  };

  // Phase A: a rectangle typed on a world plane (first corner typed too),
  // extruded as a named new part.
  const boardFromPlane = async ({ plane = 'XY', corner = [0, 0], width, height, distance, name }) => {
    await sketchOnPlane(plane);
    await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
    await typeHud(...corner);
    const c = await canvasCenter();
    await page.mouse.move(c.x + 120, c.y - 90, { steps: 4 });
    await typeHud(width, height);
    await expect(status).toContainText('1 item · closed profile');
    await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
    await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
    await applyOperation('Apply extrude', { name, distance });
  };
  // Phase A: Ø(2r) through cut at (u, v) on the face under the canvas centre.
  const holeThroughFace = async ({ viewName, u, v, radius }) => {
    await view(viewName);
    await page.getByRole('button', { name: 'Sketch', exact: true }).click();
    await page.getByRole('button', { name: 'Sketch on face', exact: true }).click();
    const c = await canvasCenter();
    await page.mouse.click(c.x, c.y);
    await toolbar.waitFor();
    await toolbar.getByRole('button', { name: 'Circle', exact: true }).click();
    await typeHud(u, v);
    await typeHud(radius);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await properties.getByRole('button', { name: 'Cut', exact: true }).click();
    await expect(properties.getByLabel('Through all')).toBeChecked();
    await applyOperation('Apply cut');
  };

  return {
    properties,
    toolbar,
    status,
    canvas,
    current,
    saved,
    savedWhen,
    canvasCenter,
    project,
    typeHud,
    sketchOnPlane,
    applyOperation,
    setPosition,
    view,
    drag,
    boardFromPlane,
    holeThroughFace,
  };
}
