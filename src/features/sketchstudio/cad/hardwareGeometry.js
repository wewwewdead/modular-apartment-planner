import * as cad from 'replicad';
import { hardwareDimensions } from './hardware.js';

export function hardwareGeometry(f, parameters, own) {
  const d = hardwareDimensions(f, parameters);
  const round = (diameter, length, z = 0) => own(cad.makeCylinder(diameter / 2, length, [0, 0, z]));
  const hex = (acrossFlats, length) => {
    const radius = acrossFlats / Math.sqrt(3);
    const points = Array.from({ length: 6 }, (_, i) => [
      radius * Math.cos((i * Math.PI) / 3),
      radius * Math.sin((i * Math.PI) / 3),
    ]);
    const pen = cad.draw(points[0]);
    points.slice(1).forEach((p) => pen.lineTo(p));
    return own(own(pen.close().sketchOnPlane('XY')).extrude(length));
  };
  // Seating plane is Z=0. Bolts/studs point into -Z; nuts/spacers extend +Z.
  if (['bolt', 'stud'].includes(f.kind)) {
    const head = f.kind === 'bolt' ? hex(d.headDiameter, d.headHeight) : round(d.headDiameter, d.headHeight);
    return own(head.fuse(round(d.diameter, d.length, -d.length)));
  }
  let body = ['nut', 'standoff'].includes(f.kind) ? hex(d.bodyDiameter, d.length) : round(d.bodyDiameter, d.length);
  let height = d.length;
  if (['clinch-nut', 'clinch-standoff', 'rivet-nut'].includes(f.kind)) {
    body = own(body.fuse(round(d.headDiameter, d.headHeight)));
    height = Math.max(height, d.headHeight);
  }
  return own(body.cut(round(d.boreDiameter, height + 0.02, -0.01)));
}
