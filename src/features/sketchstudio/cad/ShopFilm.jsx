// Replay the build (docs/sketch-studio-shop-floor.md §8, SF-5): the panel
// that runs the film (what is showing, play / pause, previous / next, the
// speed, every step to jump to, End replay) and the caption over the view.
// The scenes and what exists at each come from shopFilm.js; the workspace
// shows them through the stations' own display code and owns the clock. The
// progress bars are rewritten by the workspace's frame loop through
// `bar(kind)` refs (no React render per frame).
import { useEffect, useRef } from 'react';
import { routeStation } from './shopRoute.js';
import { FILM_SPEEDS } from './shopFilm.js';
import { PrimaryButton, StationShell } from './ShopFloor.jsx';

const fmt = (value) => (Number.isFinite(value) ? Number(value.toFixed(1)).toString() : '—');
const NONE = [];
/** "3 · Bend", or "Finished". */
export const filmStationName = (station) => {
  const entry = routeStation(station);
  return entry ? `${entry.number} · ${entry.name}` : 'Finished';
};
const clockText = (seconds) =>
  seconds < 60
    ? `${fmt(seconds)} s`
    : `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;

/**
 * The replay's panel. `film`: the workspace's session ({ stage, index,
 * speed, scenes }); `start` / `total`: where the scene starts and how long
 * the film is, seconds at normal speed; `bar(kind)`: a ref for the 'total'
 * progress bar; onPlay, onPause, onStep(index), onSpeed(speed), onEnd.
 */
export function FilmPanel({
  film,
  product = '',
  start = 0,
  total = 0,
  bar,
  onPlay,
  onPause,
  onStep,
  onSpeed,
  onEnd,
  watching = '',
}) {
  const scenes = film.scenes || NONE;
  const scene = scenes[film.index];
  const playing = film.stage === 'playing',
    ended = film.stage === 'ended';
  const list = useRef(null),
    deck = useRef(null);
  // The scene showing stays in view in the step list: the pane scrolls the
  // row between the controls (which stick to its top) and the pinned footer,
  // on every new scene and when the window changes size.
  useEffect(() => {
    const keep = () => {
      const row = list.current?.querySelector('[aria-current="step"]')?.closest('li');
      const pane = row?.closest('.cad-properties');
      if (!row || !pane) return;
      const box = row.getBoundingClientRect();
      const top = deck.current?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
      const bottom =
        pane.querySelector('.cad-film .cad-shell-foot')?.getBoundingClientRect().top ??
        pane.getBoundingClientRect().bottom;
      if (box.top < top + 4) pane.scrollTop -= top + 4 - box.top;
      else if (box.bottom > bottom - 4) pane.scrollTop += box.bottom - (bottom - 4);
    };
    keep();
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, [film.index]);
  return (
    <StationShell
      station="film"
      region="Replay"
      heading={{ number: '▶', name: watching ? 'Watch the bends' : 'Replay' }}
      className="cad-film"
      shell={{ subject: product }}
      primary={
        <PrimaryButton onClick={playing ? onPause : onPlay}>
          {playing ? 'Pause' : ended ? 'Play again' : 'Play'}
        </PrimaryButton>
      }
      leave={
        <button type="button" className="cad-shell-leave" onClick={onEnd}>
          {watching ? 'Back to the press brake' : 'End replay'}
        </button>
      }
    >
      <p className="cad-shop-lead">
        {watching
          ? `${watching}: each hit of the press brake again, as it was made. Nothing in the model changes.`
          : 'The whole route, from flat sheet to the finished product, in the order the shop makes it. Nothing in the model changes; Esc ends it.'}
      </p>
      <div ref={deck} className="cad-film-deck">
        {scene && (
          <div className="cad-film-now" aria-label="Now showing" role="status">
            <span className={`cad-film-station is-${scene.station}`}>{filmStationName(scene.station)}</span>
            <strong>{scene.title}</strong>
            {scene.subject && <small>{scene.subject}</small>}
            {scene.detail && <small>{scene.detail}</small>}
          </div>
        )}
        <div className="cad-film-progress" aria-hidden="true">
          <span ref={bar?.('total')} />
        </div>
        <p className="cad-film-clock" aria-label="Replay position">
          {ended ? 'Finished · ' : !playing ? 'Paused · ' : ''}Step {film.index + 1} of {scenes.length} ·{' '}
          {clockText(start)} of {clockText(total)} at 1×
        </p>
        <div className="cad-film-controls" role="group" aria-label="Replay controls">
          <button type="button" disabled={film.index === 0} onClick={() => onStep(film.index - 1)}>
            <span aria-hidden="true">⏮</span> Previous step
          </button>
          <button type="button" disabled={film.index >= scenes.length - 1} onClick={() => onStep(film.index + 1)}>
            Next step <span aria-hidden="true">⏭</span>
          </button>
        </div>
        <div className="cad-film-speed">
          <span>Speed</span>
          <span className="cad-segmented" role="group" aria-label="Replay speed">
            {FILM_SPEEDS.map((speed) => (
              <button key={speed} type="button" aria-pressed={film.speed === speed} onClick={() => onSpeed(speed)}>
                {speed}×
              </button>
            ))}
          </span>
        </div>
      </div>
      <h4>Steps</h4>
      <ol ref={list} className="cad-film-steps" aria-label="Replay steps">
        {scenes.map((s, i) => (
          <li key={s.key} className={i < film.index ? 'is-done' : ''}>
            {(i === 0 || scenes[i - 1].station !== s.station) && (
              <span className="cad-film-group" aria-hidden="true">
                {filmStationName(s.station)}
              </span>
            )}
            <button
              type="button"
              aria-current={i === film.index ? 'step' : undefined}
              title={[s.subject, s.detail].filter(Boolean).join(' · ')}
              onClick={() => onStep(i)}
            >
              <span className="cad-film-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="cad-film-step-title">{s.title}</span>
              <small aria-hidden="true">{fmt(s.seconds)} s</small>
            </button>
          </li>
        ))}
      </ol>
    </StationShell>
  );
}

/** The caption over the view while the film runs: the station, the scene's title and its progress. */
export function FilmCaption({ film, bar }) {
  const scene = film.scenes[film.index];
  if (!scene) return null;
  return (
    <div className="cad-film-caption" aria-label="Replay caption" data-station={scene.station}>
      <span className={`cad-film-station is-${scene.station}`}>{filmStationName(scene.station)}</span>
      <strong>{scene.title}</strong>
      {scene.subject && <small>{scene.subject}</small>}
      <span className="cad-film-caption-bar" aria-hidden="true">
        <span ref={bar?.('scene')} />
      </span>
      {film.stage === 'paused' && <em className="cad-film-paused">Paused</em>}
    </div>
  );
}
