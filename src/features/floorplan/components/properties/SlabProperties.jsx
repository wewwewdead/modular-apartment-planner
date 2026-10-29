import { memo, useMemo } from 'react';
import { analyzeSlabCantilever, deriveOverhangTipLoads, roundDeflectionMm } from '@/analysis/cantileverStructural';
import { getSlabDisplayLabel } from '@/domain/slabLabels';
import {
  applyCantilever,
  applyProjectingBay,
  CANTILEVER_DEFAULT_DISTANCE_MM,
  CANTILEVER_MIN_DISTANCE_MM,
  CANTILEVER_MODES,
  describeCantileverBasis,
  PROJECTING_BAY_DEFAULT_WIDTH_MM,
  PROJECTING_BAY_MIN_WIDTH_MM,
  removeCantilever,
  resetCantileverToolState,
} from '@/editor/handlers/cantileverHandler';
import { TOOLS } from '@/editor/tools';
import { slabArea } from '@/geometry/slabGeometry';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { Hint, Note, NumberField, Readout, Section, Stack, Status, TextField, panelKitStyles } from './PanelKit';

const NO_OP = () => {};

/**
 * One decimal place, for the engineering readouts that are already in their
 * final unit: a load in kN/m², a ratio, a deflection limit in millimetres.
 *
 * Deflections stay in millimetres whatever the drawing unit is set to, because
 * "0.0001 m" is not how anyone reads a serviceability check — which is also
 * why rounding them here is safe. Anything measured in PLAN goes through `u`
 * instead, and is rounded in millimetres FIRST: in metre mode
 * `Math.round(0.62)` is 1, and a 620 mm reach becomes a metre.
 */
function toTenth(value) {
  return Math.round(value * 10) / 10;
}

function SlabProperties({
  slab,
  floor,
  overhang,
  selectedOverhangEdge = null,
  belowFootprint = null,
  profile = null,
  dispatch,
  editorDispatch = NO_OP,
  floorId,
  u,
  phases,
  activePhaseId = null,
  activeTool = null,
  toolState = {},
  // What is under this plate, answered by the panel above rather than here: the
  // whole project is what says which storey that is and whether the overhang
  // reaches anything, and this component is memoized precisely so it never
  // holds the project.
  ceilingHostFloorName = null,
  ceilingHostBeamCount = 0,
  cantileverCeilingCount = 0,
  onTraceCantileverCeiling = NO_OP,
  onDrawCeilingUnderSlab = NO_OP,
  onPickCeilingBeams = NO_OP,
}) {
  const updateSlab = (updates) => {
    dispatch({ type: 'SLAB_UPDATE', floorId, slab: { id: slab.id, ...updates } });
  };

  const generateSupports = () => {
    dispatch({ type: 'SLAB_GENERATE_OVERHANG_SUPPORTS', floorId, slabId: slab.id });
  };

  const vertexCount = (slab.boundaryPoints || []).length;
  const areaM2 = (slabArea(slab) / 1_000_000).toFixed(2);
  const overhangDepth = overhang ? u.toDisplay(Math.round(overhang.maxDepthMm)) : 0;
  const overhangEdgeCount = overhang ? (overhang.overhangEdges || []).length : 0;

  /* ── What the cantilever can carry ──────────────────────────────────────
   *
   * The overhang measurement says how far the plate reaches; this says whether
   * that reach is a balcony or a wish. It is a strip calculation on assumed
   * material — the slab model has a thickness and nothing else — so the
   * assumption travels with the numbers, folded away under the readouts.
   */
  // What is standing on the free end. A bay's own walls are the usual answer,
  // and they are the difference between a balcony's load case and a facade's —
  // so the panel goes and looks rather than assuming a bare plate.
  const tipLoads = useMemo(() => deriveOverhangTipLoads({ overhang, floor }), [overhang, floor]);
  const analysis = useMemo(
    () => analyzeSlabCantilever({ slab, overhang, profile, tipLoads }),
    [slab, overhang, profile, tipLoads],
  );
  const governing = analysis.governing;

  /* ── The run being looked at ────────────────────────────────────────────
   *
   * Clicking one overhang on the plan is a way of asking about THAT one, so
   * when a run is picked the readouts follow it instead of the governing one.
   * The pick is an index into geometry that is remeasured after every edit, so
   * it is resolved rather than trusted: an index that no longer answers to a
   * run leaves the panel exactly where it was before anyone clicked, which is
   * the governing edge. Nothing here can throw, and nothing here can quietly
   * describe a different piece of edge than the one lit up on the plan.
   */
  const pickedRunIndex = selectedOverhangEdge?.slabId === slab.id ? selectedOverhangEdge.edgeIndex : null;
  const focusedEdge =
    pickedRunIndex == null ? null : analysis.edges.find((edge) => edge.sourceIndex === pickedRunIndex) || null;
  const shownEdge = focusedEdge || governing;

  /**
   * Pull one run back onto the storey below. Takes the run as MEASURED rather
   * than as analysed: the analysis is a report about the geometry, and it is
   * the geometry — which boundary edge, how far past it — that gets edited. The
   * footprint below goes with it so the retraction can check its own work
   * against the same thing the overhang was measured against.
   */
  const removeRun = (sourceIndex) => {
    removeCantilever({
      slab,
      floorId,
      run: (overhang?.overhangEdges || [])[sourceIndex] || null,
      belowPolygons: belowFootprint,
      dispatch,
      editorDispatch,
    });
  };

  /* ── Guided cantilever ──────────────────────────────────────────────────
   *
   * Dragging the edge is still there and still right for exploring. This is the
   * other case: the reach is already decided, and typing it beats hunting for it
   * with a cursor. The tool takes the side on the plan and the number here.
   */
  const cantileverActive = activeTool === TOOLS.CANTILEVER;
  const pick = toolState?.cantileverPick?.slabId === slab.id ? toolState.cantileverPick : null;
  const distanceMm = pick
    ? (pick.distanceMm ?? pick.defaultDistanceMm ?? CANTILEVER_DEFAULT_DISTANCE_MM)
    : CANTILEVER_DEFAULT_DISTANCE_MM;
  // The bay macro rides the same tool; `cantileverMode` is what says which of
  // the two the click is going to build.
  const bayMode = toolState?.cantileverMode === CANTILEVER_MODES.BAY;
  const bayPick = pick?.kind === CANTILEVER_MODES.BAY ? pick : null;
  const bayWidthMm = bayPick
    ? (bayPick.widthMm ?? bayPick.defaultWidthMm ?? PROJECTING_BAY_DEFAULT_WIDTH_MM)
    : PROJECTING_BAY_DEFAULT_WIDTH_MM;

  const startCantilever = (mode = CANTILEVER_MODES.CANTILEVER) => {
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.CANTILEVER });
    // SET_TOOL clears the selection along with the old tool's state, and the
    // whole flow is anchored on this plate — so it goes straight back. The mode
    // has to be set AFTER it for the same reason.
    editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
    editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { cantileverMode: mode } });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message:
        mode === CANTILEVER_MODES.BAY
          ? 'Click an edge of the slab where the bay should project.'
          : 'Click an edge of the slab to cantilever that side.',
    });
  };

  const cancelCantilever = () => {
    resetCantileverToolState(editorDispatch);
    editorDispatch({ type: 'SET_TOOL', tool: TOOLS.SELECT });
    editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  };

  // Rounded in millimetres before it goes anywhere near the display unit, so a
  // metre-mode entry of 0.6 is 600 and not 599.9999999999999.
  const toMillimetres = (displayValue) => Math.max(CANTILEVER_MIN_DISTANCE_MM, Math.round(u.fromDisplay(displayValue)));

  const setCantileverDistance = (displayValue) => {
    if (!pick) return;
    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: { cantileverPick: { ...pick, distanceMm: toMillimetres(displayValue) } },
    });
  };

  // Apply takes the number it is given rather than reading it back out of tool
  // state: Enter commits the field and applies in the same keystroke, and the
  // committed value has not returned through the store yet.
  const applyPickedCantilever = (millimetres = distanceMm) => {
    applyCantilever({ slab, floorId, pick, distanceMm: millimetres, dispatch, editorDispatch });
  };

  const setBayWidth = (displayValue) => {
    if (!bayPick) return;
    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        cantileverPick: {
          ...bayPick,
          widthMm: Math.max(PROJECTING_BAY_MIN_WIDTH_MM, Math.round(u.fromDisplay(displayValue))),
        },
      },
    });
  };

  const applyPickedBay = (projection = distanceMm, width = bayWidthMm) => {
    applyProjectingBay({
      slab,
      floor,
      floorId,
      pick: bayPick,
      projectionMm: projection,
      widthMm: width,
      phaseId: activePhaseId,
      dispatch,
      editorDispatch,
    });
  };

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={slab.phaseId} phases={phases} onChange={(v) => updateSlab({ phaseId: v })} />

      <Section id="slab.identity" title="Identity" summary={slab.name || getSlabDisplayLabel(slab)}>
        <TextField label="Name" value={slab.name || ''} onChange={(value) => updateSlab({ name: value })} />
        <TextField label="Type" value={slab.type || ''} onChange={(value) => updateSlab({ type: value })} />
        <Readout label="Floor" value={floor.name} muted />
        <Readout label="Label" value={getSlabDisplayLabel(slab)} muted />
      </Section>

      <Section id="slab.properties" title="Properties" summary={`${u.toDisplay(slab.thickness)} ${u.suffix}`}>
        <NumberField
          label="Thickness"
          value={u.toDisplay(slab.thickness)}
          step={u.step(10)}
          unit={u.suffix}
          onChange={(value) => updateSlab({ thickness: Math.max(50, u.fromDisplay(value)) })}
        />
        <NumberField
          label="Elevation"
          value={u.toDisplay(slab.elevation)}
          step={u.step(10)}
          unit={u.suffix}
          onChange={(value) => updateSlab({ elevation: u.fromDisplay(value) })}
        />
      </Section>

      {/* Both come straight off the boundary polygon, which is edited on the
          canvas by dragging its corners and edges — there is no number to type
          here, so there is no input box either. */}
      <Section id="slab.plate" title="Plate" summary={`${areaM2} m²`}>
        <Readout label="Area" value={areaM2} unit="m²" />
        <Readout label="Vertices" value={vertexCount} />
      </Section>

      {/* Always present, unlike the readouts inside it: a plate with no overhang
          yet is exactly the one someone comes here to give one. What this
          section reports is the plan dimension — whether the reach is CARRIED is
          a structural question the coordination model answers on its own. */}
      <Section
        id="slab.cantilever"
        title="Cantilever"
        summary={overhang ? `${overhangDepth} ${u.suffix} past floor below` : 'None yet'}
        reveal={pickedRunIndex}
      >
        {overhang ? (
          <>
            <Readout label="Reach past floor below" value={overhangDepth} unit={u.suffix} />
            <Readout label="Overhanging edges" value={overhangEdgeCount} />

            {/* How far the overhang runs ALONG the building edge. One run gets
                a plain length; several get a row each, because which side is
                which stops being obvious the moment there is more than one. */}
            {analysis.available && analysis.edges.length === 1 ? (
              <Readout
                label="Edge run length"
                value={u.toDisplay(Math.round(analysis.edges[0].lengthMm))}
                unit={u.suffix}
              />
            ) : null}
            {analysis.available && analysis.edges.length > 1
              ? analysis.edges.map((edge) => (
                  <div key={edge.index} className={styles.edgeRow}>
                    <Readout
                      label={`Edge ${edge.index + 1}${edge === focusedEdge ? ' — selected' : ''}`}
                      value={`${u.toDisplay(Math.round(edge.lengthMm))} long × ${u.toDisplay(
                        Math.round(edge.depthMm),
                      )} out`}
                      unit={u.suffix}
                    />
                    {/* With a run picked there is one obvious thing to remove
                        and a button below that says so. Without one, the choice
                        IS the row — so each row carries its own, small enough
                        that the list still reads as a schedule. */}
                    {focusedEdge ? null : (
                      <button
                        type="button"
                        className={styles.rowBtn}
                        title={`Remove the cantilever on edge ${edge.index + 1}`}
                        onClick={() => removeRun(edge.sourceIndex)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              : null}

            {analysis.available ? (
              <>
                {/* Whose numbers these are. Stated whenever a run is picked,
                    because every readout under it changes meaning with it —
                    and the governing edge stays named alongside, so choosing
                    to look at one run never hides the worst one. */}
                {focusedEdge ? <Readout label="Showing" value={`Edge ${focusedEdge.index + 1} — selected`} /> : null}
                <Status tone={shownEdge.status === 'ok' ? 'info' : 'warning'}>{shownEdge.headline}</Status>
                {analysis.edges.length > 1 ? (
                  <Readout label="Governing edge" value={`Edge ${governing.index + 1}`} muted />
                ) : null}
                <Readout label="Bending utilisation" value={Math.round(shownEdge.bendingUtilization * 100)} unit="%" />
                <Readout
                  label="Tip deflection, long term"
                  value={roundDeflectionMm(shownEdge.deflectionMm)}
                  unit="mm"
                />
                <Readout label="Deflection limit, 2L/250" value={toTenth(shownEdge.deflectionLimitMm)} unit="mm" />
                <Readout label="Allowable imposed load" value={toTenth(shownEdge.allowableImposedKpa)} unit="kN/m²" />
                <Readout
                  label="Limited by"
                  value={shownEdge.allowableGovernedBy === 'deflection' ? 'Deflection' : 'Bending'}
                  muted
                />
                <Readout label="Checked at imposed load" value={analysis.loads.imposedKpa} unit="kN/m²" muted />
                {/* Only shown where there is one. A row reading "0 kN/m from 0
                    walls" would look like a measurement of nothing rather than
                    the absence of a measurement — the assumption note below
                    says which of the two cases this is, in words. */}
                {shownEdge.tipWallCount ? (
                  <Readout
                    label="Facade load on tip"
                    value={`${toTenth(shownEdge.tipLineLoadKnPerM)} from ${shownEdge.tipWallCount} wall${
                      shownEdge.tipWallCount === 1 ? '' : 's'
                    }`}
                    unit="kN/m"
                  />
                ) : null}
                {shownEdge.backSpanMm != null ? (
                  <>
                    <Readout
                      label="Back-span behind support"
                      value={u.toDisplay(Math.round(shownEdge.backSpanMm))}
                      unit={u.suffix}
                    />
                    <Readout
                      label="Back-span ratio"
                      value={`${toTenth(shownEdge.backSpanRatio)}× reach${
                        shownEdge.requiredBackSpanRatio != null ? ` (want ${shownEdge.requiredBackSpanRatio}×)` : ''
                      }`}
                      muted
                    />
                  </>
                ) : null}
                <Note label="What this check assumed">{analysis.assumptions.summary}</Note>
              </>
            ) : null}

            {/* Placing these by hand is one beam per station along every
                projecting run; the model already knows where they belong. */}
            <button type="button" className={styles.actionBtn} onClick={generateSupports}>
              Generate support beams
            </button>

            {/* Removing a cantilever is retracting the edge that makes it, so
                it needs to know WHICH edge. A picked run says so; a single run
                is the answer by elimination; several unpicked runs are a
                question, and it is asked in the rows above rather than answered
                here on the user's behalf. */}
            {focusedEdge || analysis.edges.length === 1 ? (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => removeRun((focusedEdge || analysis.edges[0]).sourceIndex)}
              >
                Remove cantilever
              </button>
            ) : null}
          </>
        ) : null}

        {!cantileverActive ? (
          <Stack>
            <button type="button" className={styles.actionBtn} onClick={() => startCantilever()}>
              Add cantilever
            </button>
            {/* The other thing a plate edge can grow. Same gesture, and it
                brings its own walls — see applyProjectingBay. */}
            <button type="button" className={styles.actionBtn} onClick={() => startCantilever(CANTILEVER_MODES.BAY)}>
              Add projecting bay
            </button>
          </Stack>
        ) : !pick ? (
          <>
            <Hint>
              {bayMode
                ? 'Hover an edge of this slab on the plan to highlight it, then click where the bay should project.'
                : 'Hover an edge of this slab on the plan to highlight it, then click to cantilever that side.'}
            </Hint>
            <Stack>
              <button type="button" className={styles.actionBtn} onClick={cancelCantilever}>
                Cancel
              </button>
            </Stack>
          </>
        ) : bayPick ? (
          <>
            <NumberField
              label="Projection"
              value={u.toDisplay(distanceMm)}
              step={u.step(50)}
              unit={u.suffix}
              min={u.toDisplay(CANTILEVER_MIN_DISTANCE_MM)}
              onChange={setCantileverDistance}
              onSubmit={(displayValue) => applyPickedBay(toMillimetres(displayValue))}
            />
            <NumberField
              label="Bay width"
              value={u.toDisplay(bayWidthMm)}
              step={u.step(100)}
              unit={u.suffix}
              min={u.toDisplay(PROJECTING_BAY_MIN_WIDTH_MM)}
              onChange={setBayWidth}
              onSubmit={(displayValue) =>
                applyPickedBay(
                  distanceMm,
                  Math.max(PROJECTING_BAY_MIN_WIDTH_MM, Math.round(u.fromDisplay(displayValue))),
                )
              }
            />
            {/* A bay is measured from the edge it grows out of, not from the
                storey below — stated for the same reason the cantilever states
                its own basis. */}
            <Readout label="Measured" value="from clicked edge" />
            <Hint>Apply adds the protrusion and its three walls — two returns and the face — in one step.</Hint>
            <Stack>
              <button type="button" className={styles.confirmBtn} onClick={() => applyPickedBay()}>
                Apply bay
              </button>
            </Stack>
            <Stack>
              <button type="button" className={styles.actionBtn} onClick={cancelCantilever}>
                Cancel
              </button>
            </Stack>
          </>
        ) : (
          <>
            <NumberField
              label="Distance"
              value={u.toDisplay(distanceMm)}
              step={u.step(50)}
              unit={u.suffix}
              min={u.toDisplay(CANTILEVER_MIN_DISTANCE_MM)}
              onChange={setCantileverDistance}
              onSubmit={(displayValue) => applyPickedCantilever(toMillimetres(displayValue))}
            />
            {/* Which line the number is counted from changes what it means, so
                it is stated rather than assumed. */}
            <Readout label="Measured" value={describeCantileverBasis(pick.support)} />
            <Stack>
              <button type="button" className={styles.confirmBtn} onClick={() => applyPickedCantilever()}>
                Apply cantilever
              </button>
            </Stack>
            <Stack>
              <button type="button" className={styles.actionBtn} onClick={cancelCantilever}>
                Cancel
              </button>
            </Stack>
          </>
        )}
      </Section>

      {/* ── The underside ────────────────────────────────────────────────
          A plate's ceiling is not this floor's business: a floor's slabs are
          the deck it STANDS ON, so what closes the underside of this one
          belongs to the storey below and is filed there. Offered from the
          plate rather than the sidebar because the plate is what says which
          deck is meant — the sidebar's ceiling list only knows about the floor
          being edited, which is the wrong one for exactly this job. */}
      <Section
        id="slab.ceiling"
        title="Ceiling"
        summary={ceilingHostFloorName ? `Hangs on ${ceilingHostFloorName}` : 'No storey below'}
      >
        {!ceilingHostFloorName ? (
          <Hint>This is the lowest floor — no storey below to ceil.</Hint>
        ) : (
          <>
            {/* The interior first: most of a plate is the part standing inside
                its own frame, and the line a ceiling stops on there is a beam
                face rather than anything worth tracing by hand. Without beams
                below there is no frame to pick, and the fix is a placement job
                on the other storey rather than anything this panel can do. */}
            {ceilingHostBeamCount ? null : (
              <Hint>No beams overhead on {ceilingHostFloorName} — place top beams on its columns to pick from.</Hint>
            )}
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={!ceilingHostBeamCount}
                onClick={onPickCeilingBeams}
              >
                Pick beams
              </button>
            </Stack>
            {/* The count arrives already narrowed to the picked run, so a run
                with nothing to ceil and a plate with no overhang at all are two
                different messages about two different things. */}
            {cantileverCeilingCount ? null : focusedEdge ? (
              <Hint>This cantilever is too small to carry a ceiling — draw the area instead.</Hint>
            ) : (
              <Hint>Slab does not overhang the floor below — draw the ceiling instead.</Hint>
            )}
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={!cantileverCeilingCount}
                onClick={onTraceCantileverCeiling}
              >
                {focusedEdge ? 'Trace ceiling for this cantilever' : 'Trace cantilever ceiling'}
              </button>
            </Stack>
            <Stack>
              <button type="button" className={styles.actionBtn} onClick={onDrawCeilingUnderSlab}>
                Draw ceiling under slab
              </button>
            </Stack>
          </>
        )}
      </Section>
    </div>
  );
}

export default memo(SlabProperties);
