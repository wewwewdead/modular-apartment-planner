import { useState } from 'react';

function NumberField({ label, value, onChange, step = '1' }) {
  return (
    <label className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{label}</span>
      <input className="sketchStudioPropertyInput" type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function CabinetInternalsPanel({ params, onApply }) {
  const [shelfInput, setShelfInput] = useState('');
  const shelfPositions = params.shelfPositions || [];
  const dividerCount = params.dividerCount || 0;
  const includeBackPanel = params.includeBackPanel !== false;

  const handleAddShelf = () => {
    const pos = Number(shelfInput);
    if (!Number.isFinite(pos) || pos < 0) return;
    onApply({ shelfPositions: [...shelfPositions, pos].sort((a, b) => a - b) });
    setShelfInput('');
  };

  const handleRemoveShelf = (index) => {
    const next = shelfPositions.filter((_, i) => i !== index);
    onApply({ shelfPositions: next.length ? next : null });
  };

  return (
    <div className="sketchStudioSubpanelCard">
      <div className="sketchStudioSubpanelHeader">
        <strong>Cabinet Internals</strong>
      </div>

      <div className="sketchStudioPropertyList sketchStudioEditableList">
        <label className="sketchStudioEditableRow">
          <span className="sketchStudioPropertyKey">Back Panel</span>
          <input
            type="checkbox"
            checked={includeBackPanel}
            onChange={(e) => onApply({ includeBackPanel: e.target.checked })}
          />
        </label>

        <NumberField
          label="Dividers"
          value={dividerCount}
          onChange={(val) => onApply({ dividerCount: Math.max(0, Math.round(Number(val) || 0)) })}
        />
      </div>

      <div className="sketchStudioSubpanelHeader" style={{ marginTop: 8 }}>
        <strong>Custom Shelf Positions</strong>
      </div>

      {shelfPositions.length > 0 && (
        <div className="sketchStudioPropertyList">
          {shelfPositions.map((pos, i) => (
            <div key={i} className="sketchStudioPropertyRow">
              <span className="sketchStudioPropertyKey">Shelf {i + 1}</span>
              <span className="sketchStudioPropertyValue">{pos.toFixed(1)} mm</span>
              <button
                type="button"
                className="sketchStudioInlineButton"
                style={{ marginLeft: 4, padding: '0 4px', fontSize: '0.75em' }}
                onClick={() => handleRemoveShelf(i)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sketchStudioActionRow">
        <input
          className="sketchStudioPropertyInput"
          type="number"
          step="1"
          placeholder="Z offset (mm)"
          value={shelfInput}
          onChange={(e) => setShelfInput(e.target.value)}
          style={{ width: 90 }}
        />
        <button type="button" className="sketchStudioInlineButton" onClick={handleAddShelf}>
          Add Shelf
        </button>
      </div>
    </div>
  );
}
