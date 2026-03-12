import InputField from './InputField';
import styles from './PropertiesPanel.module.css';
import { TOOLS } from '@/editor/tools';
import {
  createRoofPlane,
  createRoofSystemForProject,
  deriveRoofBoundaryFromProject,
  roofPitchDirectionFromAngle,
  roofPitchDirectionToAngle,
} from '@/domain/roofModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import {
  buildRoofBoundaryEdges,
  buildParapetEdgeAttachmentForPoints,
  buildRoofPlanGeometry,
  resolveParapetLine,
} from '@/geometry/roofPlanGeometry';
import { buildRoofScheduleSummary } from '@/roof/roofSchedule';
import { isRoofAccessOpening, isSkylightRoofOpening, normalizeRoofOpeningType } from '@/roof/openings';
import { polygonArea } from '@/geometry/polygon';
import { wallLength } from '@/geometry/wallGeometry';
import RoofScheduleSummary from './RoofScheduleSummary';

function selectRoofTool(editorDispatch, tool) {
  editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
  editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'plan' });
  editorDispatch({ type: 'SET_TOOL', tool });
}

function parapetPlacementHint(roofSystem) {
  switch (roofSystem?.roofType || 'flat') {
    case 'shed':
      return 'Attached parapets on shed roofs snap only to the high edge and rake edges. The low eave edge is excluded.';
    case 'gable':
      return 'Attached parapets on gable roofs snap only to gable-end edges. The eaves are excluded.';
    case 'custom':
      return 'Attached parapets on custom roofs can snap to any roof perimeter edge. Derived drainage still treats eave edges separately.';
    case 'flat':
    default:
      return 'Attached parapets on flat roofs can snap to any roof edge.';
  }
}

export function RoofEmptyState({ project, dispatch, editorDispatch }) {
  const handleCreate = () => {
    const roofSystem = createRoofSystemForProject(project);
    dispatch({ type: 'ROOF_CREATE', roofSystem });
    editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
    editorDispatch({ type: 'SELECT_OBJECT', id: roofSystem.id, objectType: 'roofSystem' });
  };

  return (
    <div>
      <div className={styles.title}>Roof</div>
      <div className={styles.drawingHint}>
        Create a dedicated roof system above the highest floor. The initial boundary will derive from the current top outline.
      </div>
      <button className={styles.actionBtn} onClick={handleCreate}>
        Create roof
      </button>
    </div>
  );
}

export function RoofSystemProperties({ project, roofSystem, dispatch, editorDispatch, u }) {
  const updateRoof = (updates) => {
    dispatch({ type: 'ROOF_UPDATE', roofSystem: { id: roofSystem.id, ...updates } });
  };
  const geometry = buildRoofPlanGeometry(roofSystem);
  const roofPlaneGeometry = buildRoofPlaneGeometry(roofSystem);
  const schedule = buildRoofScheduleSummary(roofSystem);
  const roofType = roofSystem.roofType || 'flat';
  const pitch = roofSystem.pitch || {};
  const pitchAngle = roofPitchDirectionToAngle(pitch.direction);
  const customPlaneCount = (roofSystem.roofPlanes || []).length;
  const customSeamCount = (roofPlaneGeometry.roofEdges || []).filter((edge) => !edge.isPerimeter).length;

  const addRoofPlane = () => {
    const nextPlane = createRoofPlane(
      roofPlaneGeometry.roofOutline?.length
        ? roofPlaneGeometry.roofOutline
        : (roofSystem.boundaryPolygon || []),
      {
        name: `Plane ${customPlaneCount + 1}`,
        baseElevation: roofSystem.baseElevation ?? 0,
        slope: pitch.slope || 20,
        slopeDirection: pitch.direction,
      }
    );

    dispatch({ type: 'ROOF_PLANE_ADD', roofPlane: nextPlane });
    editorDispatch({ type: 'SELECT_OBJECT', id: nextPlane.id, objectType: 'roofPlane' });
  };

  const updatePitch = (updates) => {
    updateRoof({
      pitch: {
        ...pitch,
        ...updates,
      },
    });
  };

  return (
    <div>
      <div className={styles.title}>Roof</div>
      <InputField
        label="Name"
        value={roofSystem.name}
        onChange={(value) => updateRoof({ name: value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={roofType}
          onChange={(e) => updateRoof({ roofType: e.target.value })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          <option value="flat">Flat</option>
          <option value="shed">Shed</option>
          <option value="gable">Gable</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <InputField
        label="Base Elev."
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(roofSystem.baseElevation || 0)}
        onChange={(value) => updateRoof({ baseElevation: u.fromDisplay(value) })}
      />
      <InputField
        label="Slab Thick."
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(roofSystem.slabThickness || 0)}
        onChange={(value) => updateRoof({ slabThickness: Math.max(50, u.fromDisplay(value)) })}
      />
      {roofType === 'flat' ? (
        <InputField
          label="Finish Slope"
          type="number"
          suffix="%"
          step={0.1}
          value={roofSystem.finishSlope || 0}
          onChange={(value) => updateRoof({ finishSlope: Math.max(0, value) })}
        />
      ) : roofType === 'custom' ? (
        <>
          <div className={styles.drawingHint}>
            Custom roofs are authored per plane. Use the roof plane list or click a plane in plan to edit its own slope, direction, and base elevation.
          </div>
          <button className={styles.actionBtn} onClick={addRoofPlane}>
            Add roof plane
          </button>
          <div className={styles.drawingHint}>
            Ridge, valley, and hip seams are derived from shared plane edges. Select a seam line to override its role when needed.
          </div>
        </>
      ) : (
        <>
          <InputField
            label="Roof Slope"
            type="number"
            suffix="%"
            step={0.1}
            value={pitch.slope || 0}
            onChange={(value) => updatePitch({ slope: Math.max(0, value) })}
          />
          <InputField
            label="Slope Dir."
            type="number"
            suffix="°"
            step={1}
            value={pitchAngle}
            onChange={(value) => updatePitch({ direction: roofPitchDirectionFromAngle(value) })}
          />
          <InputField
            label="Overhang"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(pitch.overhang || 0)}
            onChange={(value) => updatePitch({ overhang: Math.max(0, u.fromDisplay(value)) })}
          />
          {roofType === 'gable' && (
            <InputField
              label="Ridge Offset"
              type="number"
              suffix={u.suffix}
              step={u.step(10)}
              value={u.toDisplay(pitch.ridgeOffset || 0)}
              onChange={(value) => updatePitch({ ridgeOffset: u.fromDisplay(value) })}
            />
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button className={styles.actionBtn} onClick={() => updatePitch({ direction: roofPitchDirectionFromAngle(pitchAngle + 90) })}>
              Rotate 90°
            </button>
            {roofType === 'gable' && (
              <button className={styles.actionBtn} onClick={() => updatePitch({ ridgeOffset: 0 })}>
                Center ridge
              </button>
            )}
          </div>
          {!roofPlaneGeometry.overhangApplied && (pitch.overhang || 0) > 0 && (
            <div className={styles.drawingHint}>
              Overhang is currently applied only to convex roof boundaries. This roof keeps the structural outline in plan/3D until a general offset tool is added.
            </div>
          )}
        </>
      )}
      <div className={styles.subtitle}>Geometry</div>
      <InputField label="Boundary Vertices" value={(roofSystem.boundaryPolygon || []).length} readOnly />
      {roofType !== 'flat' && roofType !== 'custom' && (
        <InputField label="Roof Edge Vertices" value={(roofPlaneGeometry.roofOutline || []).length} readOnly />
      )}
      {roofType === 'custom' && (
        <>
          <InputField label="Roof Planes" value={customPlaneCount} readOnly />
          <InputField label="Shared Seams" value={customSeamCount} readOnly />
          <InputField label="Ridges" value={(roofPlaneGeometry.ridges || []).length} readOnly />
          <InputField label="Valleys" value={(roofPlaneGeometry.valleys || []).length} readOnly />
          <InputField label="Hips" value={(roofPlaneGeometry.hips || []).length} readOnly />
        </>
      )}
      <InputField label="Surface Area" value={(schedule.netSurfaceArea / 1_000_000).toFixed(2)} suffix="m²" readOnly />
      {roofType !== 'flat' && (
        <InputField label="Projected Area" value={(schedule.netPlanArea / 1_000_000).toFixed(2)} suffix="m²" readOnly />
      )}
      <InputField label="Parapets" value={(roofSystem.parapets || []).length} readOnly />
      <InputField label="Drains" value={(roofSystem.drains || []).length} readOnly />
      <InputField label="Openings" value={(roofSystem.roofOpenings || []).length} readOnly />
      <button
        className={styles.actionBtn}
        onClick={() => updateRoof({ boundaryPolygon: deriveRoofBoundaryFromProject(project) })}
      >
        Reset outline from top floor
      </button>
      <div className={styles.subtitle}>Add Objects</div>
      <button className={styles.actionBtn} onClick={() => selectRoofTool(editorDispatch, TOOLS.ROOF_PARAPET)}>
        Place parapet
      </button>
      <button className={styles.actionBtn} onClick={() => selectRoofTool(editorDispatch, TOOLS.ROOF_DRAIN)}>
        Place drain
      </button>
      <button className={styles.actionBtn} onClick={() => selectRoofTool(editorDispatch, TOOLS.ROOF_OPENING)}>
        Draw roof opening
      </button>
      <div className={styles.drawingMeta}>
        Boundary centroid: {Math.round(geometry.centroid.x)} / {Math.round(geometry.centroid.y)} mm
      </div>
      <div className={styles.drawingHint}>
        Click a valid roof edge to place an attached parapet that follows the roof boundary. Click twice away from the edge, or hold Shift, to draw a free parapet.
      </div>
      <div className={styles.drawingHint}>
        {parapetPlacementHint(roofSystem)}
      </div>
      <div className={styles.drawingHint}>
        Add sheet viewports with source `Roof Schedule` or `Roof Drainage` to place roof quantities and drainage graphics on sheets and exports.
      </div>
      <RoofScheduleSummary roofSystem={roofSystem} u={u} />
    </div>
  );
}

export function ParapetProperties({ parapet, roofSystem, dispatch, u }) {
  const updateParapet = (updates) => {
    dispatch({ type: 'PARAPET_UPDATE', parapet: { id: parapet.id, ...updates } });
  };
  const resolved = resolveParapetLine(parapet, roofSystem) || {
    startPoint: parapet.startPoint,
    endPoint: parapet.endPoint,
  };
  const roofEdges = buildRoofBoundaryEdges(roofSystem);
  const attachedEdge = parapet.attachment?.type === 'roof_edge'
    ? roofEdges.find((edge) => edge.index === parapet.attachment.edgeIndex)
    : null;

  const attachToNearestRoofEdge = () => {
    const attachment = buildParapetEdgeAttachmentForPoints(roofSystem, resolved.startPoint, resolved.endPoint);
    if (!attachment) return;

    updateParapet({
      attachment,
      startPoint: resolved.startPoint,
      endPoint: resolved.endPoint,
    });
  };

  const detachFromEdge = () => {
    updateParapet({
      attachment: null,
      startPoint: resolved.startPoint,
      endPoint: resolved.endPoint,
    });
  };

  return (
    <div>
      <div className={styles.title}>Parapet</div>
      <InputField label="Name" value={parapet.name || ''} onChange={(value) => updateParapet({ name: value })} />
      <InputField label="Mode" value={parapet.attachment?.type === 'roof_edge' ? 'Roof Edge' : 'Free'} readOnly />
      {attachedEdge ? (
        <>
          <InputField label="Edge" value={attachedEdge.index + 1} readOnly />
          <InputField label="Edge Role" value={attachedEdge.parapetPlacement?.label || 'Edge'} readOnly />
          <InputField label="Edge Length" suffix={u.suffix} value={u.toDisplay(attachedEdge.length)} readOnly />
        </>
      ) : null}
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(resolved.startPoint.x)}
        readOnly={Boolean(attachedEdge)}
        onChange={(value) => updateParapet({ attachment: null, startPoint: { ...resolved.startPoint, x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(resolved.startPoint.y)}
        readOnly={Boolean(attachedEdge)}
        onChange={(value) => updateParapet({ attachment: null, startPoint: { ...resolved.startPoint, y: u.fromDisplay(value) } })}
      />
      <div className={styles.subtitle}>End Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(resolved.endPoint.x)}
        readOnly={Boolean(attachedEdge)}
        onChange={(value) => updateParapet({ attachment: null, endPoint: { ...resolved.endPoint, x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(resolved.endPoint.y)}
        readOnly={Boolean(attachedEdge)}
        onChange={(value) => updateParapet({ attachment: null, endPoint: { ...resolved.endPoint, y: u.fromDisplay(value) } })}
      />
      <div className={styles.subtitle}>Properties</div>
      <InputField label="Length" suffix={u.suffix} value={u.toDisplay(wallLength({ start: resolved.startPoint, end: resolved.endPoint }))} readOnly />
      <InputField label="Height" type="number" suffix={u.suffix} step={u.step(10)} value={u.toDisplay(parapet.height || 0)} onChange={(value) => updateParapet({ height: Math.max(50, u.fromDisplay(value)) })} />
      <InputField label="Thickness" type="number" suffix={u.suffix} step={u.step(10)} value={u.toDisplay(parapet.thickness || 0)} onChange={(value) => updateParapet({ thickness: Math.max(20, u.fromDisplay(value)) })} />
      {attachedEdge ? (
        <>
          {!attachedEdge.parapetPlacement?.allowed && (
            <div className={styles.drawingHint}>
              This parapet is attached to an edge that is not recommended for the current roof type.
            </div>
          )}
          <button
            className={styles.actionBtn}
            onClick={() => updateParapet({
              attachment: {
                ...parapet.attachment,
                startOffset: 0,
                endOffset: attachedEdge.length,
              },
            })}
          >
            Follow full edge
          </button>
          <button className={styles.actionBtn} onClick={detachFromEdge}>
            Detach from edge
          </button>
        </>
      ) : (
        <>
          <button className={styles.actionBtn} onClick={attachToNearestRoofEdge}>
            Attach to nearest valid roof edge
          </button>
          <div className={styles.drawingHint}>
            {parapetPlacementHint(roofSystem)}
          </div>
        </>
      )}
    </div>
  );
}

export function DrainProperties({ drain, dispatch, u }) {
  const updateDrain = (updates) => {
    dispatch({ type: 'DRAIN_UPDATE', drain: { id: drain.id, ...updates } });
  };

  return (
    <div>
      <div className={styles.title}>Drain</div>
      <InputField label="Name" value={drain.name || ''} onChange={(value) => updateDrain({ name: value })} />
      <InputField label="X" type="number" suffix={u.suffix} value={u.toDisplay(drain.position.x)} onChange={(value) => updateDrain({ position: { ...drain.position, x: u.fromDisplay(value) } })} />
      <InputField label="Y" type="number" suffix={u.suffix} value={u.toDisplay(drain.position.y)} onChange={(value) => updateDrain({ position: { ...drain.position, y: u.fromDisplay(value) } })} />
      <InputField label="Diameter" type="number" suffix={u.suffix} step={u.step(10)} value={u.toDisplay(drain.diameter || 0)} onChange={(value) => updateDrain({ diameter: Math.max(40, u.fromDisplay(value)) })} />
      <InputField label="Invert Offset" type="number" suffix={u.suffix} step={u.step(10)} value={u.toDisplay(drain.invertOffset || 0)} onChange={(value) => updateDrain({ invertOffset: u.fromDisplay(value) })} />
    </div>
  );
}

export function RoofOpeningProperties({ roofOpening, project, dispatch, u }) {
  const updateRoofOpening = (updates) => {
    dispatch({ type: 'ROOF_OPENING_UPDATE', roofOpening: { id: roofOpening.id, ...updates } });
  };
  const linkedStairs = (project?.floors || [])
    .flatMap((floor) => (floor.stairs || []).map((stair) => ({ stair, floor })))
    .filter(({ stair }) => stair.roofAccess?.roofOpeningId === roofOpening.id);
  const normalizedType = normalizeRoofOpeningType(roofOpening.type || 'opening');
  const selectableType = isRoofAccessOpening(normalizedType)
    ? 'hatch'
    : (isSkylightRoofOpening(normalizedType) ? 'skylight' : 'opening');

  return (
    <div>
      <div className={styles.title}>Roof Opening</div>
      <InputField label="Name" value={roofOpening.name || ''} onChange={(value) => updateRoofOpening({ name: value })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={selectableType}
          onChange={(e) => updateRoofOpening({ type: e.target.value })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          <option value="opening">Opening</option>
          <option value="skylight">Skylight</option>
          <option value="hatch">Hatch</option>
        </select>
      </div>
      <InputField label="Vertices" value={(roofOpening.boundaryPoints || []).length} readOnly />
      <InputField label="Area" value={(polygonArea(roofOpening.boundaryPoints || []) / 1_000_000).toFixed(2)} suffix="m²" readOnly />
      <InputField label="Curb Height" type="number" suffix={u.suffix} step={u.step(10)} value={u.toDisplay(roofOpening.curbHeight || 0)} onChange={(value) => updateRoofOpening({ curbHeight: Math.max(0, u.fromDisplay(value)) })} />
      <InputField label="Linked Stairs" value={linkedStairs.length} readOnly />
      {isRoofAccessOpening(normalizedType) ? (
        <div className={styles.drawingHint}>
          Top-level stairs can target this opening as roof access. Linked stairs will show an access connection in sections.
        </div>
      ) : (
        <div className={styles.drawingHint}>
          Change the type to `Hatch` if this opening should be used for stair-to-roof access.
        </div>
      )}
    </div>
  );
}

export function RoofPlaneProperties({ roofPlane, dispatch, u }) {
  const updateRoofPlane = (updates) => {
    dispatch({ type: 'ROOF_PLANE_UPDATE', roofPlane: { id: roofPlane.id, ...updates } });
  };
  const slopeAngle = roofPitchDirectionToAngle(roofPlane.slopeDirection);

  return (
    <div>
      <div className={styles.title}>Roof Plane</div>
      <InputField label="Name" value={roofPlane.name || ''} onChange={(value) => updateRoofPlane({ name: value })} />
      <InputField label="Material" value={roofPlane.material || ''} onChange={(value) => updateRoofPlane({ material: value })} />
      <InputField label="Plane Type" value={roofPlane.planeType || 'roof_plane'} onChange={(value) => updateRoofPlane({ planeType: value || 'roof_plane' })} />
      <InputField
        label="Base Elev."
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(roofPlane.baseElevation || 0)}
        onChange={(value) => updateRoofPlane({ baseElevation: u.fromDisplay(value) })}
      />
      <InputField
        label="Slope"
        type="number"
        suffix="%"
        step={0.1}
        value={roofPlane.slope || 0}
        onChange={(value) => updateRoofPlane({ slope: Math.max(0, value) })}
      />
      <InputField
        label="Slope Dir."
        type="number"
        suffix="°"
        step={1}
        value={slopeAngle}
        onChange={(value) => updateRoofPlane({ slopeDirection: roofPitchDirectionFromAngle(value) })}
      />
      <InputField label="Height Rule" value={roofPlane.heightRule || 'base_low_edge'} onChange={(value) => updateRoofPlane({ heightRule: value || 'base_low_edge' })} />
      <InputField label="Vertices" value={(roofPlane.boundaryPoints || []).length} readOnly />
      <InputField label="Plan Area" value={(polygonArea(roofPlane.boundaryPoints || []) / 1_000_000).toFixed(2)} suffix="m²" readOnly />
      <div className={styles.drawingHint}>
        Drag the plane body to move it or drag individual vertices in roof plan view to reshape it.
      </div>
    </div>
  );
}

export function RoofEdgeProperties({ roofEdge, roofSystem, dispatch, u }) {
  const planeLabels = (roofSystem?.roofPlanes || [])
    .filter((plane) => (roofEdge.planeIds || []).includes(plane.id))
    .map((plane) => plane.name || plane.id)
    .join(', ') || 'Unassigned';

  const updateRole = (edgeRole) => {
    dispatch({
      type: 'ROOF_EDGE_UPDATE',
      roofEdge: {
        id: roofEdge.id,
        geometryKey: roofEdge.geometryKey,
        startPoint: roofEdge.startPoint,
        endPoint: roofEdge.endPoint,
        planeIds: roofEdge.planeIds,
        edgeRole,
      },
    });
  };

  return (
    <div>
      <div className={styles.title}>Roof Seam</div>
      <InputField label="Derived Role" value={roofEdge.derivedRole || 'transition'} readOnly />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Role</label>
        <select
          value={roofEdge.roleOverride || 'derived'}
          onChange={(e) => updateRole(e.target.value)}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          <option value="derived">Derived</option>
          <option value="ridge">Ridge</option>
          <option value="valley">Valley</option>
          <option value="hip">Hip</option>
          <option value="transition">Transition</option>
        </select>
      </div>
      <InputField label="Current Role" value={roofEdge.edgeRole || roofEdge.derivedRole || 'transition'} readOnly />
      <InputField label="Planes" value={planeLabels} readOnly />
      <InputField label="Length" value={u.toDisplay(wallLength({ start: roofEdge.startPoint, end: roofEdge.endPoint }))} suffix={u.suffix} readOnly />
      <div className={styles.drawingHint}>
        Seam roles are derived from adjacent roof planes first. Use an override only when you need to force a ridge, valley, or hip classification.
      </div>
    </div>
  );
}
