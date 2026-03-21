function renderReadOnlyRows(rows) {
  return rows.map(([label, value]) => (
    <div key={label} className="sketchStudioPropertyRow">
      <span className="sketchStudioPropertyKey">{label}</span>
      <span className="sketchStudioPropertyValue">{typeof value === 'number' ? value.toFixed(1) : value}</span>
    </div>
  ));
}

function renderEditableField(field, value, onCommit) {
  return (
    <label key={`${field}-${value}`} className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{field}</span>
      <input
        type="number"
        step="0.1"
        defaultValue={value}
        className="sketchStudioPropertyInput"
        onBlur={(event) => onCommit(field, event.target.value)}
      />
    </label>
  );
}

function renderEditableTextField(field, value, onCommit) {
  return (
    <label key={`${field}-${value}`} className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{field}</span>
      <input
        type="text"
        defaultValue={value}
        className="sketchStudioPropertyInput"
        onBlur={(event) => onCommit(field, event.target.value)}
      />
    </label>
  );
}

function renderEditableFields(entity, onCommit) {
  if (!entity) {
    return null;
  }

  if (entity.type === 'line') {
    return ['x1', 'y1', 'x2', 'y2'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'rect') {
    return ['x', 'y', 'width', 'height', 'rotation'].map((field) => renderEditableField(field, entity[field] ?? 0, onCommit));
  }

  if (entity.type === 'circle') {
    return ['cx', 'cy', 'r'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'text') {
    return [
      renderEditableTextField('text', entity.text, onCommit),
      ...['x', 'y', 'fontSize', 'rotation'].map((field) => renderEditableField(field, entity[field] ?? 0, onCommit)),
    ];
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      return ['cx', 'cy', 'diameter'].map((field) => renderEditableField(field, entity[field], onCommit));
    }

    return ['x', 'y', 'width', 'height'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'dimension') {
    return (
      <>
        <label key={`subtype-${entity.subtype}`} className="sketchStudioEditableRow">
          <span className="sketchStudioPropertyKey">Subtype</span>
          <select className="sketchStudioPropertyInput" defaultValue={entity.subtype} onChange={(event) => onCommit('subtype', event.target.value)}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="aligned">Aligned</option>
          </select>
        </label>
        {renderEditableField('offset', entity.offset, onCommit)}
      </>
    );
  }

  return null;
}

function SelectionActions({
  isBrokenLineSelection,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
}) {
  return (
    <div className="sketchStudioSelectionActions">
      <button type="button" className="sketchStudioInlineButton" onClick={onRotateLeft}>Rotate Left</button>
      <button type="button" className="sketchStudioInlineButton" onClick={onRotateRight}>Rotate Right</button>
      <button type="button" className="sketchStudioInlineButton" onClick={onFlipHorizontal}>Flip Horizontal</button>
      <button type="button" className="sketchStudioInlineButton" onClick={onFlipVertical}>Flip Vertical</button>
      <button type="button" className="sketchStudioInlineButton sketchStudioInlineButtonWide" onClick={onToggleBrokenLines}>
        {isBrokenLineSelection ? 'Use Solid Lines' : 'Use Broken Lines'}
      </button>
    </div>
  );
}

export default function RightPanel({
  selectedEntity,
  groupSelectionSummary,
  selectedMeasurements,
  selectedProfileInfo,
  isBrokenLineSelection,
  onEntityFieldCommit,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
}) {
  return (
    <aside className="sketchStudioRightPanel">
      <section className="sketchStudioPanelSection">
        <p className="sketchStudioPanelEyebrow">Selection</p>
        {selectedEntity ? (
          <>
            <h2 className="sketchStudioPanelTitle">{selectedEntity.id}</h2>
            <SelectionActions
              isBrokenLineSelection={isBrokenLineSelection}
              onRotateLeft={onRotateLeft}
              onRotateRight={onRotateRight}
              onFlipHorizontal={onFlipHorizontal}
              onFlipVertical={onFlipVertical}
              onToggleBrokenLines={onToggleBrokenLines}
            />
            <div className="sketchStudioPropertyList">
              <div className="sketchStudioPropertyRow"><span className="sketchStudioPropertyKey">Type</span><span className="sketchStudioPropertyValue">{selectedEntity.type}</span></div>
              <div className="sketchStudioPropertyRow"><span className="sketchStudioPropertyKey">Layer</span><span className="sketchStudioPropertyValue">{selectedEntity.layerId}</span></div>
              {renderReadOnlyRows(selectedMeasurements)}
            </div>
            <div className="sketchStudioPropertyList sketchStudioEditableList">{renderEditableFields(selectedEntity, onEntityFieldCommit)}</div>
          </>
        ) : groupSelectionSummary ? (
          <>
            <SelectionActions
              isBrokenLineSelection={isBrokenLineSelection}
              onRotateLeft={onRotateLeft}
              onRotateRight={onRotateRight}
              onFlipHorizontal={onFlipHorizontal}
              onFlipVertical={onFlipVertical}
              onToggleBrokenLines={onToggleBrokenLines}
            />
            <div className="sketchStudioPlaceholderCard">
              <p className="sketchStudioPlaceholderText">{groupSelectionSummary.count} entities selected</p>
              <p className="sketchStudioPlaceholderSubtext">
                {groupSelectionSummary.types}
                {selectedProfileInfo ? ` • ${selectedProfileInfo.count} profile source${selectedProfileInfo.count > 1 ? 's' : ''}` : ''}
              </p>
            </div>
          </>
        ) : (
          <div className="sketchStudioPlaceholderCard">
            <p className="sketchStudioPlaceholderText">No selection</p>
            <p className="sketchStudioPlaceholderSubtext">
              Select an entity to inspect and edit it here.
            </p>
          </div>
        )}
      </section>
    </aside>
  );
}
