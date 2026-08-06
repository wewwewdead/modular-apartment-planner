import { useMemo, useRef, useState } from 'react';
import { WORLD_CITIES, searchCities, nearestCity } from '@/analysis/worldCities';
import styles from './LocationPicker.module.css';

/**
 * Picks a site position without a network connection.
 *
 * Three ways in, in the order people reach for them: type a city, click the
 * map, or enter coordinates. All three write the same two numbers.
 *
 * The map is an equirectangular projection — longitude and latitude map
 * linearly to x and y, which makes hit-testing exact and reversible with two
 * lines of arithmetic. It draws a graticule and the bundled city index rather
 * than coastlines: shipping real outlines would mean either a megabyte of path
 * data or a tile server, and neither is worth it when a sun study only needs
 * the position to within tens of kilometres. The city scatter follows habitable
 * land closely enough to navigate by.
 */

const MAP_WIDTH = 360;
const MAP_HEIGHT = 180;

/** Equirectangular: longitude -180..180 → 0..width, latitude 90..-90 → 0..height. */
function project({ latitude, longitude }) {
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: ((90 - latitude) / 180) * MAP_HEIGHT,
  };
}

function unproject({ x, y }) {
  return {
    latitude: 90 - (y / MAP_HEIGHT) * 180,
    longitude: (x / MAP_WIDTH) * 360 - 180,
  };
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatCoordinate(value, positive, negative) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

export default function LocationPicker({ latitude, longitude, onChange }) {
  const [query, setQuery] = useState('');
  const svgRef = useRef(null);

  const results = useMemo(() => searchCities(query), [query]);
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
  const marker = hasPoint ? project({ latitude, longitude }) : null;
  const near = useMemo(() => (hasPoint ? nearestCity({ latitude, longitude }) : null), [hasPoint, latitude, longitude]);

  const pickFromEvent = (event) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // The SVG scales to its container, so convert through the rendered size
    // rather than assuming a 1:1 pixel mapping.
    const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    const point = unproject({ x, y });
    const closest = nearestCity(point);
    onChange({
      latitude: round(point.latitude),
      longitude: round(point.longitude),
      timeZone: closest?.city.timeZone || '',
      label: '',
    });
  };

  const selectCity = (city) => {
    setQuery('');
    onChange({
      latitude: city.latitude,
      longitude: city.longitude,
      timeZone: city.timeZone,
      label: `${city.name}, ${city.country}`,
    });
  };

  return (
    <div className={styles.picker}>
      <div className={styles.searchWrap}>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a city…"
          aria-label="Search for a city"
          autoComplete="off"
        />
        {results.length > 0 && (
          <ul className={styles.results}>
            {results.map((city) => (
              <li key={city.id}>
                <button type="button" className={styles.resultButton} onClick={() => selectCity(city)}>
                  <span className={styles.resultName}>
                    {city.name}
                    <span className={styles.resultCountry}>{city.country}</span>
                  </span>
                  <span className={styles.resultCoords}>
                    {formatCoordinate(city.latitude, 'N', 'S')} {formatCoordinate(city.longitude, 'E', 'W')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <svg
        ref={svgRef}
        className={styles.map}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="button"
        tabIndex={0}
        aria-label="World map — click to place the site"
        onClick={pickFromEvent}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          // Keyboard users get the search box and the coordinate fields; the
          // map is a pointer convenience, so Enter simply moves focus on.
          svgRef.current?.blur();
        }}
      >
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} className={styles.ocean} />

        {/* Graticule every 30°, with the equator and prime meridian emphasised. */}
        {[-60, -30, 30, 60].map((lat) => (
          <line
            key={`lat${lat}`}
            x1="0"
            x2={MAP_WIDTH}
            y1={project({ latitude: lat, longitude: 0 }).y}
            y2={project({ latitude: lat, longitude: 0 }).y}
            className={styles.graticule}
          />
        ))}
        {[-150, -120, -90, -60, -30, 30, 60, 90, 120, 150].map((lon) => (
          <line
            key={`lon${lon}`}
            y1="0"
            y2={MAP_HEIGHT}
            x1={project({ latitude: 0, longitude: lon }).x}
            x2={project({ latitude: 0, longitude: lon }).x}
            className={styles.graticule}
          />
        ))}
        <line x1="0" x2={MAP_WIDTH} y1={MAP_HEIGHT / 2} y2={MAP_HEIGHT / 2} className={styles.equator} />
        <line x1={MAP_WIDTH / 2} x2={MAP_WIDTH / 2} y1="0" y2={MAP_HEIGHT} className={styles.equator} />

        {/* The tropics bound where the sun can pass directly overhead, which is
            the one piece of solar geography worth drawing on a sun-study map. */}
        {[23.44, -23.44].map((lat) => (
          <line
            key={`trop${lat}`}
            x1="0"
            x2={MAP_WIDTH}
            y1={project({ latitude: lat, longitude: 0 }).y}
            y2={project({ latitude: lat, longitude: 0 }).y}
            className={styles.tropic}
          />
        ))}

        {WORLD_CITIES.map((city) => {
          const point = project(city);
          // Sized against the rendered width, not the viewBox: the map is about
          // 220px wide in the sidebar, so a 360-unit viewBox scales by ~0.6 and
          // anything under r=1.5 lands sub-pixel and vanishes.
          return <circle key={city.id} cx={point.x} cy={point.y} r="1.6" className={styles.cityDot} />;
        })}

        {marker && (
          <g className={styles.marker}>
            <line x1={marker.x} x2={marker.x} y1="0" y2={MAP_HEIGHT} className={styles.markerGuide} />
            <line x1="0" x2={MAP_WIDTH} y1={marker.y} y2={marker.y} className={styles.markerGuide} />
            <circle cx={marker.x} cy={marker.y} r="4.5" className={styles.markerHalo} />
            <circle cx={marker.x} cy={marker.y} r="2" className={styles.markerDot} />
          </g>
        )}
      </svg>

      <p className={styles.caption}>
        {hasPoint ? (
          <>
            <strong>
              {formatCoordinate(latitude, 'N', 'S')} {formatCoordinate(longitude, 'E', 'W')}
            </strong>
            {near && (
              <span className={styles.nearby}>
                {near.distanceKm < 25
                  ? ` · ${near.city.name}`
                  : ` · ${Math.round(near.distanceKm)} km from ${near.city.name}`}
              </span>
            )}
          </>
        ) : (
          'Search a city or click the map'
        )}
      </p>
    </div>
  );
}

export { project, unproject, MAP_WIDTH, MAP_HEIGHT };
