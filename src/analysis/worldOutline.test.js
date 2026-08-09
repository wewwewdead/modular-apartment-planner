/**
 * The outline is generated data, so what is worth testing is not its content
 * but that it is still *the world*, in the projection the picker assumes.
 *
 * A regenerated file with the axes swapped, the latitude sign flipped or the
 * origin left at zero would still parse, still draw, and still look vaguely
 * like coastlines — so the checks here are geographic: known land is inside a
 * ring, known ocean is not, and the whole thing sits inside the viewBox.
 */

import { describe, expect, it } from 'vitest';
import { WORLD_BORDERS_PATH, WORLD_LAND_PATH } from './worldOutline';
import { MAP_HEIGHT, MAP_WIDTH, project } from '@/features/floorplan/components/LocationPicker';

const NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const TOKEN = new RegExp(`M(${NUMBER}) (${NUMBER})|l(${NUMBER}) ?(${NUMBER})|Z`, 'g');

/** Walks the path the way a renderer would, so a malformed command shows up as a gap. */
function parseRings(data) {
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;

  for (const match of data.matchAll(TOKEN)) {
    if (match[0] === 'Z') {
      if (ring) rings.push(ring);
      ring = null;
    } else if (match[1] !== undefined) {
      x = Number(match[1]);
      y = Number(match[2]);
      ring = [{ x, y }];
    } else {
      // Rounded back to the tenth of a degree the file stores, so a chain of a
      // hundred relative steps is read at the precision it was written at
      // rather than at whatever binary residue the additions leave behind.
      x = Math.round((x + Number(match[3])) * 10) / 10;
      y = Math.round((y + Number(match[4])) * 10) / 10;
      ring.push({ x, y });
    }
  }

  return rings;
}

/** Even-odd, matching the `fill-rule` the land path is drawn with. */
function insideAnyRing(point, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

const land = parseRings(WORLD_LAND_PATH);
const borders = parseRings(WORLD_BORDERS_PATH);
const onLand = (latitude, longitude) => insideAnyRing(project({ latitude, longitude }), land);

describe('world outline data', () => {
  it('parses into closed rings, with nothing left dangling', () => {
    expect(land.length).toBeGreaterThan(80);
    expect(borders.length).toBeGreaterThan(150);
    for (const ring of [...land, ...borders]) expect(ring.length).toBeGreaterThanOrEqual(4);

    // Every command in both paths was consumed by the tokeniser.
    const consumed = (data) => [...data.matchAll(TOKEN)].reduce((total, match) => total + match[0].length, 0);
    expect(consumed(WORLD_LAND_PATH)).toBe(WORLD_LAND_PATH.length);
    expect(consumed(WORLD_BORDERS_PATH)).toBe(WORLD_BORDERS_PATH.length);
  });

  it('is already in map units, so nothing has to be projected to draw it', () => {
    for (const ring of [...land, ...borders]) {
      for (const point of ring) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(MAP_WIDTH);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(MAP_HEIGHT);
      }
    }
  });

  it('puts land where there is land', () => {
    expect(onLand(14.6, 121.0)).toBe(true); // Manila
    expect(onLand(51.5, -0.1)).toBe(true); // London
    expect(onLand(-23.5, -46.6)).toBe(true); // São Paulo
    expect(onLand(-25.3, 133.8)).toBe(true); // central Australia
    expect(onLand(64.1, -21.9)).toBe(true); // Reykjavík
  });

  it('puts ocean where there is ocean', () => {
    expect(onLand(0, -140)).toBe(false); // mid Pacific
    expect(onLand(30, -40)).toBe(false); // mid Atlantic
    expect(onLand(-40, 80)).toBe(false); // southern Indian Ocean
    expect(onLand(90, 0)).toBe(false); // the pole, which is sea ice and not drawn
  });

  it('would fail if the projection were mirrored or the axes swapped', () => {
    // The two hemispheres are the cheapest way to catch a sign flip: Cairo is
    // north of the equator and east of Greenwich, Perth is south and further
    // east still, and no reflection of the map keeps both on land.
    expect(onLand(30.0, 31.2)).toBe(true); // Cairo
    expect(onLand(-31.9, 115.9)).toBe(true); // Perth
    expect(onLand(-30.0, -31.2)).toBe(false); // Cairo, latitude and longitude negated
    expect(onLand(115.9, -31.9)).toBe(false); // Perth, axes swapped — off the map entirely
  });

  it('stays small enough to bundle', () => {
    // It replaced a claim that coastlines would cost a megabyte. Keep that
    // honest: this is the budget, and a finer dataset has to argue for itself.
    expect(WORLD_LAND_PATH.length + WORLD_BORDERS_PATH.length).toBeLessThan(60_000);
  });
});
