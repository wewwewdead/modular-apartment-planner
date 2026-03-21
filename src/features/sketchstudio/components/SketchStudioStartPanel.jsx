import { useState } from 'react';
import { getAllGenerators } from '../utils/generatorRegistry';

export default function SketchStudioStartPanel({
  selectedProfileInfo,
  objectLibrary,
  onCreateBlank,
  onCreateBuildFromParts,
  onCreateFromSelection,
  onCreateWithGenerator,
  onLoadObject,
}) {
  const generators = getAllGenerators();
  const [selectedGenerator, setSelectedGenerator] = useState(generators[0]?.id || '');

  return (
    <div className="sketchStudioPlaceholderCard">
      <p className="sketchStudioPlaceholderText">No object draft</p>
      <p className="sketchStudioPlaceholderSubtext">
        Start with a blank custom object, build directly from parts, convert drafted geometry, or use an optional generator preset.
        {selectedProfileInfo ? ` ${selectedProfileInfo.count} closed profile${selectedProfileInfo.count > 1 ? 's are' : ' is'} currently selected.` : ''}
      </p>

      <div className="sketchStudioActionRow">
        <button type="button" className="sketchStudioInlineButton" onClick={onCreateBlank}>
          New Blank Object
        </button>
        <button type="button" className="sketchStudioInlineButton" onClick={onCreateBuildFromParts}>
          Build From Parts
        </button>
        <button
          type="button"
          className="sketchStudioInlineButton"
          onClick={onCreateFromSelection}
          disabled={!selectedProfileInfo}
        >
          Create from Selection
        </button>
      </div>

      <div className="sketchStudioActionRow">
        <span className="sketchStudioPropertyValue">Optional Generators</span>
        <select
          className="sketchStudioPropertyInput"
          value={selectedGenerator}
          onChange={(event) => setSelectedGenerator(event.target.value)}
        >
          {generators.map((gen) => (
            <option key={gen.id} value={gen.id}>{gen.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="sketchStudioInlineButton"
          onClick={() => onCreateWithGenerator(selectedGenerator)}
          disabled={!selectedGenerator}
        >
          Use Generator
        </button>
      </div>

      {objectLibrary?.items?.length ? (
        <>
          <p className="sketchStudioPlaceholderSubtext">Open Library Object</p>
          <div className="sketchStudioActionRow">
            {objectLibrary.items.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                className="sketchStudioInlineButton"
                onClick={() => onLoadObject(item)}
              >
                {item.name || item.id}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
