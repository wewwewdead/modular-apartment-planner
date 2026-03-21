export default function EditHandles({ handles, onHandlePointerDown }) {
  if (!handles.length) {
    return null;
  }

  return (
    <g className="sketchStudioHandleLayer">
      {handles.map((handle) => (
        <circle
          key={handle.id}
          className="sketchStudioEditHandle"
          cx={handle.x}
          cy={handle.y}
          r={6}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => onHandlePointerDown(handle, event)}
        />
      ))}
    </g>
  );
}
