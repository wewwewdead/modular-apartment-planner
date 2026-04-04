/**
 * Simple SVG thumbnail previews for template gallery cards.
 * Each thumbnail is a hand-drawn outline representing the project type.
 */
const THUMBNAILS = {
  bookshelf: (
    <g>
      <rect x="10" y="5" width="40" height="50" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="20" x2="50" y2="20" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="35" x2="50" y2="35" stroke="currentColor" strokeWidth="1" />
    </g>
  ),
  workbench: (
    <g>
      <rect x="5" y="10" width="50" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="16" x2="10" y2="50" stroke="currentColor" strokeWidth="1.5" />
      <line x1="50" y1="16" x2="50" y2="50" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="35" x2="50" y2="35" stroke="currentColor" strokeWidth="1" />
    </g>
  ),
  storageBox: (
    <g>
      <rect x="10" y="12" width="40" height="30" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="17" x2="50" y2="17" stroke="currentColor" strokeWidth="1" />
      <rect x="25" y="22" width="10" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </g>
  ),
  shelvingUnit: (
    <g>
      <rect x="12" y="5" width="36" height="50" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="18" x2="48" y2="18" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="31" x2="48" y2="31" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="44" x2="48" y2="44" stroke="currentColor" strokeWidth="1" />
    </g>
  ),
  cuttingBoard: (
    <g>
      <rect x="8" y="16" width="44" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="19" y1="16" x2="19" y2="44" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="30" y1="16" x2="30" y2="44" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <line x1="41" y1="16" x2="41" y2="44" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
    </g>
  ),
  plantStand: (
    <g>
      <rect x="15" y="10" width="30" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="18" y1="14" x2="10" y2="50" stroke="currentColor" strokeWidth="1.5" />
      <line x1="42" y1="14" x2="50" y2="50" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),
  toolCart: (
    <g>
      <rect x="10" y="8" width="40" height="38" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="20" x2="50" y2="20" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="32" x2="50" y2="32" stroke="currentColor" strokeWidth="1" />
      <circle cx="16" cy="50" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="44" cy="50" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
    </g>
  ),
  cncTestSheet: (
    <g>
      <rect x="5" y="10" width="50" height="40" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="10" y="15" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="38" cy="20" r="5" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <rect x="10" y="32" width="18" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <rect x="35" y="30" width="8" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </g>
  ),
};

export default function TemplateThumbnail({ templateId }) {
  const content = THUMBNAILS[templateId];
  if (!content) return null;

  return (
    <svg
      viewBox="0 0 60 60"
      width="48"
      height="48"
      fill="none"
      aria-hidden="true"
      style={{ color: 'var(--dark-accent-craftsman)', opacity: 0.7, flexShrink: 0 }}
    >
      {content}
    </svg>
  );
}
