export default function LeftToolbar({ tools, activeTool, onToolChange }) {
  return (
    <aside className="sketchStudioToolbar" aria-label="SketchStudio tools">
      <div className="sketchStudioToolbarStack" role="toolbar" aria-orientation="vertical">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`sketchStudioToolButton ${activeTool === tool.id ? 'is-active' : ''}`}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.description}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            aria-pressed={activeTool === tool.id}
          >
            <span className="sketchStudioToolButtonShort">{tool.shortLabel}</span>
            <span className="sketchStudioToolButtonLabel">{tool.label}</span>
            <span className="sketchStudioToolButtonHotkey">{tool.shortcut}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
