import { rotate } from './point';
import { pointInPolygon } from './polygon';

export function fixtureOutline(fixture) {
  const hw = fixture.width / 2, hd = fixture.depth / 2;
  const { x: cx, y: cy } = fixture;
  const corners = [
    { x: cx - hw, y: cy - hd }, { x: cx + hw, y: cy - hd },
    { x: cx + hw, y: cy + hd }, { x: cx - hw, y: cy + hd },
  ];
  if (!fixture.rotation) return corners;
  return corners.map(p => rotate(p, { x: cx, y: cy }, fixture.rotation));
}

export function fixtureContainsPoint(fixture, point) {
  return pointInPolygon(point, fixtureOutline(fixture));
}
