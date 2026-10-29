import * as cad from 'replicad';

// Exact OpenCascade HLR, with an empty-edge guard absent from Replicad 1.2's
// drawProjection. Curve conversion follows Replicad's MIT-licensed converter;
// its notice is distributed in public/cad-notices/Replicad-LICENSE.txt.
function curve2d(edge, own) {
  const oc = cad.getOC(),
    adaptor = own(new oc.BRepAdaptor_Curve(edge.wrapped));
  const first = adaptor.FirstParameter(),
    last = adaptor.LastParameter();
  let curve;
  const axis2d = (axis) => {
    const location = own(axis.Location()),
      x = own(axis.XDirection()),
      y = own(axis.YDirection());
    return own(
      new oc.gp_Ax22d(
        own(new oc.gp_Pnt2d(location.X(), location.Y())),
        own(new oc.gp_Dir2d(x.X(), x.Y())),
        own(new oc.gp_Dir2d(y.X(), y.Y())),
      ),
    );
  };
  const poles2d = (poles) => {
    const result = own(new oc.NCollection_Array1_gp_Pnt2d(poles.Lower(), poles.Upper()));
    for (let i = poles.Lower(); i <= poles.Upper(); i++) {
      const point = own(poles.Value(i));
      result.SetValue(i, own(new oc.gp_Pnt2d(point.X(), point.Y())));
    }
    return result;
  };
  if (edge.geomType === 'LINE') {
    const a = own(adaptor.Value(first)),
      b = own(adaptor.Value(last));
    curve = own(cad.draw([a.X(), a.Y()]).lineTo([b.X(), b.Y()]).done().blueprint.curves[0]);
  } else if (edge.geomType === 'CIRCLE' || edge.geomType === 'ELLIPSE') {
    const primitive = own(edge.geomType === 'CIRCLE' ? adaptor.Circle() : adaptor.Ellipse());
    const axis = axis2d(own(primitive.Position()));
    const geometry = own(
      edge.geomType === 'CIRCLE'
        ? new oc.Geom2d_Circle(own(new oc.gp_Circ2d(axis, primitive.Radius())))
        : new oc.Geom2d_Ellipse(own(new oc.gp_Elips2d(axis, primitive.MajorRadius(), primitive.MinorRadius()))),
    );
    curve = own(new cad.Curve2D(new oc.Geom2d_TrimmedCurve(geometry, first, last, true, true)));
  } else if (['BEZIER_CURVE', 'BSPLINE_CURVE'].includes(edge.geomType)) {
    const source = own(edge.geomType === 'BEZIER_CURVE' ? adaptor.Bezier() : adaptor.BSpline()),
      poles = poles2d(own(source.Poles()));
    let copy;
    if (edge.geomType === 'BEZIER_CURVE')
      copy = source.IsRational()
        ? new oc.Geom2d_BezierCurve(poles, own(source.Weights()))
        : new oc.Geom2d_BezierCurve(poles);
    else {
      const knots = own(source.Knots()),
        multiplicities = own(source.Multiplicities());
      copy = source.IsRational()
        ? new oc.Geom2d_BSplineCurve(
            poles,
            own(source.Weights()),
            knots,
            multiplicities,
            source.Degree(),
            source.IsPeriodic(),
          )
        : new oc.Geom2d_BSplineCurve(poles, knots, multiplicities, source.Degree(), source.IsPeriodic());
    }
    if (edge.geomType === 'BEZIER_CURVE') copy.Segment(first, last);
    else copy.Segment(first, last, 1e-9);
    curve = own(new cad.Curve2D(copy));
  } else throw new Error(`Unsupported exact projection curve: ${edge.geomType}`);
  if (edge.orientation === 'backward') curve.reverse();
  return curve;
}

function edgeDrawing(edges, own) {
  if (!edges.length) return null;
  const pending = edges.map((edge) => curve2d(own(edge), own)),
    loops = [];
  const equal = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  while (pending.length) {
    const chain = [pending.shift()];
    for (;;) {
      const end = chain.at(-1).lastPoint;
      const index = pending.findIndex((curve) => equal(curve.firstPoint, end) || equal(curve.lastPoint, end));
      if (index === -1 || equal(chain[0].firstPoint, end)) break;
      const [curve] = pending.splice(index, 1);
      if (!equal(curve.firstPoint, end)) curve.reverse();
      chain.push(curve);
    }
    loops.push(own(new cad.Blueprint(chain)));
  }
  return new cad.Drawing(loops.length === 1 ? loops[0] : new cad.Blueprints(loops));
}

export function exactProjection(shape, camera, own) {
  const edges = cad.makeProjectedEdges(shape, camera);
  const visible = edgeDrawing(edges.visible, own),
    hidden = edgeDrawing(edges.hidden, own);
  return {
    // Same camera basis as HLR; SVG reverses the vertical drawing coordinate.
    basis: [
      own(camera.xAxis).toTuple(),
      own(camera.yAxis)
        .toTuple()
        .map((n) => -n),
    ],
    visible: visible?.toSVGPaths().flat(Infinity) || [],
    hidden: hidden?.toSVGPaths().flat(Infinity) || [],
    viewBox: visible ? visible.toSVGViewBox(0).split(/\s+/).map(Number) : [0, 0, 0, 0],
  };
}
