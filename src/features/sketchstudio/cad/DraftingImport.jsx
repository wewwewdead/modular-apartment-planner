import { useMemo, useState } from 'react';
import {
  DEFAULT_HEAL_GAP_MM,
  collectDraftingProfiles,
  describeHealedGap,
  formatMm,
  summarizeSkipped,
} from './draftingProfiles.js';
import { profileToPart } from './model.js';
import { getMaterialById } from '../craftsman/data/materials.js';

const NONE = [];

export default function DraftingImport({ entities, layers = NONE, selectedIds = NONE, onImport, onDrafting }) {
  const [scope, setScope] = useState(selectedIds.length ? 'selected' : 'all');
  const [depth, setDepth] = useState(String(entities.find((e) => selectedIds.includes(e.id))?.thickness || 18));
  const [excluded, setExcluded] = useState([]),
    [error, setError] = useState('');
  const [healGaps, setHealGaps] = useState(true),
    [healTolerance, setHealTolerance] = useState(String(DEFAULT_HEAL_GAP_MM));
  const healGapMm = healGaps && Number(healTolerance) > 0 ? Number(healTolerance) : 0;
  const { candidates, rejected, healed, skipped } = useMemo(
    () =>
      collectDraftingProfiles(scope === 'selected' ? entities.filter((e) => selectedIds.includes(e.id)) : entities, {
        healGapMm,
        layers,
      }),
    [entities, scope, selectedIds, healGapMm, layers],
  );
  const included = candidates.filter((c) => !excluded.includes(c.id));
  const skippedSummary = summarizeSkipped(skipped);
  const openLoops = rejected.filter((item) => item.kind === 'open-loop');
  const onlyOpenLoops = rejected.length > 0 && openLoops.length === rejected.length;
  const smallestGap = openLoops.length ? Math.min(...openLoops.map((item) => item.gapMm)) : null;
  return (
    <div className="cad-import">
      <h3>Import 2D profiles</h3>
      <p>Closed outlines become solid parts on the XY plane. Choose their depth along Z, then position them in 3D.</p>
      <label className="cad-field">
        Drawing profiles
        <select
          aria-label="Import scope"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setExcluded([]);
          }}
        >
          <option value="all">Whole drawing</option>
          <option value="selected" disabled={!selectedIds.length}>
            Drafting selection
          </option>
        </select>
      </label>
      <label className="cad-field">
        Extrusion depth (mm)
        <input
          aria-label="Extrusion depth (mm)"
          type="number"
          min="0.001"
          step="any"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
        />
      </label>
      <label className="cad-import-choice">
        <input
          type="checkbox"
          aria-label="Close small gaps"
          checked={healGaps}
          onChange={(e) => setHealGaps(e.target.checked)}
        />
        <span>
          Close small gaps
          <small>Joins open line ends closer than the tolerance, in the imported copy only.</small>
        </span>
      </label>
      {healGaps && (
        <label className="cad-field">
          Gap tolerance (mm)
          <input
            aria-label="Gap tolerance (mm)"
            type="number"
            min="0.01"
            step="any"
            value={healTolerance}
            onChange={(e) => setHealTolerance(e.target.value)}
          />
        </label>
      )}
      <p className="cad-help">
        Each checked outline creates a separate part. Nested outlines are separate parts, not holes. Original drawing
        coordinates and assigned materials are retained.
      </p>
      {candidates.map((candidate) => (
        <label className="cad-import-choice" key={candidate.id}>
          <input
            type="checkbox"
            checked={!excluded.includes(candidate.id)}
            onChange={(e) =>
              setExcluded(e.target.checked ? excluded.filter((id) => id !== candidate.id) : [...excluded, candidate.id])
            }
          />
          <span>
            {candidate.name}
            <small>
              {candidate.profile.type} · {candidate.sourceIds.length} drawing{' '}
              {candidate.sourceIds.length === 1 ? 'entity' : 'entities'}
            </small>
          </span>
        </label>
      ))}
      {healed.length > 0 && (
        <div className="cad-help" aria-label="Closed gaps">
          {healed.map((item) => (
            <p key={item.ids.join('|') + item.at.join(',')}>{describeHealedGap(item)}</p>
          ))}
        </div>
      )}
      {rejected.length > 0 && (
        <details open={!candidates.length}>
          <summary>Not imported · {rejected.length}</summary>
          {rejected.map((item) => (
            <p className="cad-help" key={item.id}>
              {item.name}: {item.reason}
            </p>
          ))}
        </details>
      )}
      {skippedSummary.length > 0 && (
        <div className="cad-help" aria-label="Skipped entities">
          {skippedSummary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {!candidates.length && (
        <p>
          No supported closed profiles found.{' '}
          {onlyOpenLoops
            ? `Every outline above is open: the smallest gap is ${formatMm(smallestGap)} mm. ${
                healGaps ? 'Raise the gap tolerance above it' : 'Turn on "Close small gaps" with a tolerance above it'
              }, or redraw that corner with endpoint snap.`
            : 'Use a rectangle, circle, closed polyline, or lines with snapped endpoints forming a closed loop.'}
        </p>
      )}
      <p className="cad-help">
        This copies profiles into the workshop; later drafting edits do not change the imported parts. Perspective and
        isometric assembly drawings cannot be reconstructed automatically.
      </p>
      <button
        className="cad-primary cad-wide"
        disabled={!included.length || !Number.isFinite(Number(depth)) || Number(depth) <= 0}
        onClick={() => {
          try {
            const created = included.map((candidate) =>
              profileToPart(candidate.entity, {
                depth: Number(depth),
                sourceIds: candidate.sourceIds,
                material: getMaterialById(candidate.entity.materialId)?.name,
              }),
            );
            onImport(created);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Import {included.length} {included.length === 1 ? 'part' : 'parts'} into 3D
      </button>
      <button className="cad-wide" onClick={onDrafting}>
        Back to 2D drafting
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
