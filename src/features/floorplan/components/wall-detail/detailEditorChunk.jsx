import { Component, lazy } from 'react';
import { ErrorScreen } from '@/app/ErrorBoundary';
import { ToolbarButton } from './WallDetailUiKit';
import styles from './WallDetailEditor.module.css';

/**
 * An assembly editor's code, loaded on demand.
 *
 * The wall and ceiling editors are a few hundred kilobytes each and mount only
 * when opened, so the workspace keeps just their shells (what the first frame
 * of an opening paints) and fetches the editor behind that shell — or, usually,
 * before it is ever asked for: `prefetch` runs when the floorplan goes idle.
 *
 * `component(pick)` is the editor for one opening: the real component when the
 * module has already arrived, so an editor opened after the prefetch renders
 * straight away instead of suspending, else a fresh React.lazy (fresh per
 * retry too: React.lazy remembers a failed load for good).
 */
export function createEditorChunk(load) {
  let loaded = null;
  const fetchModule = () =>
    load().then((module) => {
      loaded = module;
      return module;
    });
  return {
    loaded: () => loaded,
    // Swallowed: a prefetch that fails costs nothing, and the opening that
    // needs the chunk will ask again and report it.
    prefetch: () => fetchModule().catch(() => {}),
    component: (pick) =>
      loaded ? pick(loaded) : lazy(() => fetchModule().then((module) => ({ default: pick(module) }))),
  };
}

/**
 * An editor whose code failed to load: the app's error screen with its retry,
 * inside the editor's own overlay, with Close — the workspace behind it stays
 * as it was.
 */
export class DetailEditorLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = () => {
      this.setState({ error: null });
      this.props.onRetry?.();
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[detail editor] Failed to load the editor:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={this.props.dialogLabel}
        data-editor-phase="failed"
      >
        <header className={styles.header}>
          <div className={styles.headerActions}>
            <ToolbarButton title={this.props.closeTitle} onClick={this.props.onClose}>
              Close
            </ToolbarButton>
          </div>
        </header>
        <ErrorScreen error={this.state.error} onRetry={this.handleRetry} />
      </div>
    );
  }
}
