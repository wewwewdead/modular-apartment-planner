const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
const box = 'icon';

function I({ children, className }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className || box}>
      {children}
    </svg>
  );
}

export function NewIcon(props) {
  return <I {...props}><path d="M6 3h5l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...p} /><path d="M11 3v4h4" {...p} /></I>;
}

export function SaveIcon(props) {
  return <I {...props}><path d="M5 3h8l3 3v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...p} /><path d="M7 3v4h5V3" {...p} /><rect x="6" y="11" width="8" height="5" rx="0.5" {...p} /></I>;
}

export function LoadIcon(props) {
  return <I {...props}><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1" {...p} /><path d="M3 7h14a1 1 0 0 1 1 1l-1.5 8a1 1 0 0 1-1 .8H4.5a1 1 0 0 1-1-.8L2 8a1 1 0 0 1 1-1z" {...p} /></I>;
}

export function UndoIcon(props) {
  return <I {...props}><path d="M7 5 3.5 8.5 7 12" {...p} /><path d="M4 8.5h6.5A4.5 4.5 0 0 1 15 13v1" {...p} /></I>;
}

export function RedoIcon(props) {
  return <I {...props}><path d="M13 5l3.5 3.5L13 12" {...p} /><path d="M16 8.5H9.5A4.5 4.5 0 0 0 5 13v1" {...p} /></I>;
}

export function CopyIcon(props) {
  return <I {...props}><rect x="7" y="7" width="9" height="10" rx="1" {...p} /><path d="M4 13V5a1 1 0 0 1 1-1h7" {...p} /></I>;
}

export function CutIcon(props) {
  return <I {...props}><circle cx="7" cy="15" r="2" {...p} /><circle cx="13" cy="15" r="2" {...p} /><path d="M8.5 13.5 14 4" {...p} /><path d="M11.5 13.5 6 4" {...p} /></I>;
}

export function PasteIcon(props) {
  return <I {...props}><path d="M8 4H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" {...p} /><rect x="8" y="2" width="4" height="3" rx="0.5" {...p} /><rect x="9" y="7" width="8" height="6" rx="1" {...p} /></I>;
}

export function SelectIcon(props) {
  return <I {...props}><path d="M5 3l2 14 3-5 5-3L5 3z" {...p} /></I>;
}

export function DimensionIcon(props) {
  return <I {...props}><path d="M4 6v8" {...p} /><path d="M16 6v8" {...p} /><path d="M4 10h12" {...p} /><path d="M6 8.5 4 10l2 1.5" {...p} /><path d="M14 8.5l2 1.5-2 1.5" {...p} /></I>;
}

export function WallIcon(props) {
  return <I {...props}><rect x="3" y="7" width="14" height="6" rx="0.5" {...p} /><path d="M7 7v6M13 7v6" {...p} strokeDasharray="2 2" /></I>;
}

export function BeamIcon(props) {
  return <I {...props}><rect x="2" y="8" width="16" height="4" rx="0.5" {...p} /><circle cx="5" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" /></I>;
}

export function TrussDrawIcon(props) {
  return (
    <I {...props}>
      <line x1="3" y1="13" x2="17" y2="13" {...p} />
      <path d="M4 13 10 6l6 7" {...p} />
      <path d="M6.5 10h7" {...p} strokeDasharray="2 2" />
      <circle cx="4" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}

export function StairIcon(props) {
  return <I {...props}><path d="M4 16h3v-3h3v-3h3v-3h3V4" {...p} /></I>;
}

export function SectionCutIcon(props) {
  return <I {...props}><path d="M10 3v14" {...p} strokeDasharray="3 2" /><path d="M7 5l3-2 3 2" {...p} /><path d="M7 15l3 2 3-2" {...p} /></I>;
}

export function SlabIcon(props) {
  return <I {...props}><path d="M3 12l7-4 7 4-7 4-7-4z" {...p} /><path d="M3 12v2l7 4 7-4v-2" {...p} /></I>;
}

export function RoomIcon(props) {
  return <I {...props}><rect x="4" y="4" width="12" height="12" rx="1" {...p} /><path d="M4 10h12" {...p} strokeDasharray="2 2" /><path d="M10 4v12" {...p} strokeDasharray="2 2" /></I>;
}

export function DoorIcon(props) {
  return <I {...props}><path d="M5 17V4" {...p} /><path d="M5 4a12 12 0 0 1 10 0" {...p} /><path d="M15 4v13" {...p} /></I>;
}

export function WindowIcon(props) {
  return <I {...props}><rect x="4" y="6" width="12" height="8" rx="1" {...p} /><path d="M10 6v8" {...p} /><path d="M4 10h12" {...p} /></I>;
}

export function ColumnIcon(props) {
  return <I {...props}><rect x="7" y="3" width="6" height="14" rx="0.5" {...p} /><path d="M7 6h6M7 14h6" {...p} /></I>;
}

export function LandingIcon(props) {
  return <I {...props}><path d="M3 14l4-4h6l4 4" {...p} /><rect x="6" y="8" width="8" height="4" rx="0.5" {...p} /></I>;
}

export function RailingIcon(props) {
  return <I {...props}><line x1="3" y1="10" x2="17" y2="10" {...p} /><circle cx="3" cy="10" r="1.5" {...p} /><circle cx="17" cy="10" r="1.5" {...p} /><line x1="6" y1="7" x2="6" y2="13" {...p} /><line x1="10" y1="7" x2="10" y2="13" {...p} /><line x1="14" y1="7" x2="14" y2="13" {...p} /></I>;
}

export function RoofIcon(props) {
  return <I {...props}><path d="M3 11h14" {...p} /><path d="M5 11V7h10v4" {...p} /><path d="M4 7l6-4 6 4" {...p} /></I>;
}

export function ParapetIcon(props) {
  return <I {...props}><path d="M4 13h12" {...p} /><path d="M4 13V7h2v3h8V7h2v6" {...p} /></I>;
}

export function DrainIcon(props) {
  return <I {...props}><circle cx="10" cy="9" r="4" {...p} /><path d="M10 13v4" {...p} /><path d="M8 15l2 2 2-2" {...p} /></I>;
}

export function OpeningIcon(props) {
  return <I {...props}><rect x="4" y="4" width="12" height="12" rx="1" {...p} /><path d="M7 7h6v6H7z" {...p} strokeDasharray="2 2" /></I>;
}

export function GridIcon(props) {
  return <I {...props}><rect x="3" y="3" width="14" height="14" rx="1" {...p} /><path d="M3 7.67h14M3 12.33h14M7.67 3v14M12.33 3v14" {...p} /></I>;
}

export function SnapIcon(props) {
  return <I {...props}><circle cx="10" cy="10" r="3" {...p} /><path d="M10 3v3M10 14v3M3 10h3M14 10h3" {...p} /></I>;
}

export function DetectRoomsIcon(props) {
  return <I {...props}><rect x="3" y="3" width="6" height="6" rx="0.5" {...p} /><rect x="11" y="3" width="6" height="6" rx="0.5" {...p} /><rect x="3" y="11" width="6" height="6" rx="0.5" {...p} /><path d="M12 13l2 2 4-4" {...p} /></I>;
}

export function PlanViewIcon(props) {
  return <I {...props}><rect x="3" y="3" width="14" height="14" rx="1" {...p} /><path d="M3 10h14M10 3v14" {...p} /></I>;
}

export function ElevationIcon(props) {
  return <I {...props}><path d="M3 16h14" {...p} /><rect x="5" y="6" width="10" height="10" rx="0.5" {...p} /><path d="M3 6l7-3 7 3" {...p} /></I>;
}

export function SectionViewIcon(props) {
  return <I {...props}><rect x="3" y="5" width="14" height="11" rx="1" {...p} /><path d="M10 5v11" {...p} strokeDasharray="2 2" /><path d="M3 10h14" {...p} /></I>;
}

export function SheetsIcon(props) {
  return <I {...props}><rect x="5" y="2" width="11" height="14" rx="1" {...p} /><path d="M4 6H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" {...p} /><path d="M8 6h5M8 9h5M8 12h3" {...p} /></I>;
}

export function SidebarIcon(props) {
  return <I {...props}><rect x="3" y="4" width="14" height="12" rx="1.5" {...p} strokeWidth={1.3} /><path d="M7.5 4v12" stroke="currentColor" strokeWidth={1.3} fill="none" /></I>;
}

export function PropertiesIcon(props) {
  return <I {...props}><rect x="3" y="4" width="14" height="12" rx="1.5" {...p} strokeWidth={1.3} /><path d="M12.5 4v12" stroke="currentColor" strokeWidth={1.3} fill="none" /></I>;
}

export function DownloadIcon(props) {
  return <I {...props}><path d="M10 3v10" {...p} /><path d="M6 9l4 4 4-4" {...p} /><path d="M4 15h12" {...p} /></I>;
}

export function CloseIcon(props) {
  return <I {...props}><path d="M6 6l8 8M14 6l-8 8" {...p} /></I>;
}

export function ExpandIcon(props) {
  return <I {...props}><path d="M4 12v4h4" {...p} /><path d="M16 8V4h-4" {...p} /><path d="M4 16l5-5" {...p} /><path d="M16 4l-5 5" {...p} /></I>;
}

export function CollapseIcon(props) {
  return <I {...props}><path d="M9 15v-4H5" {...p} /><path d="M11 5v4h4" {...p} /><path d="M5 15l4-4" {...p} /><path d="M15 5l-4 4" {...p} /></I>;
}

export function CenterViewIcon(props) {
  return (
    <I {...props}>
      <circle cx="10" cy="10" r="4.5" {...p} />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" {...p} />
    </I>
  );
}

// Fixture icons (plan-view symbols — architecturally detailed)
export function KitchenTopIcon(props) {
  return (
    <I {...props}>
      <rect x="2" y="5" width="16" height="10" rx="0.5" {...p} />
      {/* 4 burners */}
      <circle cx="5" cy="8" r="1.2" {...p} /><circle cx="5" cy="12" r="1.2" {...p} />
      <circle cx="9" cy="8" r="1.2" {...p} /><circle cx="9" cy="12" r="1.2" {...p} />
      {/* Sink + drain */}
      <rect x="13" y="7" width="3.5" height="6" rx="1" {...p} />
      <circle cx="14.75" cy="10" r="0.5" fill="currentColor" stroke="none" />
    </I>
  );
}

export function ToiletIcon(props) {
  return (
    <I {...props}>
      {/* Cistern + flush line */}
      <rect x="6" y="3" width="8" height="5" rx="1" {...p} />
      <line x1="9" y1="4" x2="11" y2="4" {...p} strokeWidth={1} />
      {/* Bowl + inner seat rim */}
      <ellipse cx="10" cy="13" rx="4" ry="4.5" {...p} />
      <ellipse cx="10" cy="13" rx="2.8" ry="3.2" {...p} strokeWidth={0.8} />
    </I>
  );
}

export function LavatoryIcon(props) {
  return (
    <I {...props}>
      {/* Counter */}
      <rect x="4" y="4" width="12" height="12" rx="1" {...p} />
      {/* Basin ellipse */}
      <ellipse cx="10" cy="10" rx="3.5" ry="3" {...p} />
      {/* Faucet line + drain dot */}
      <line x1="10" y1="5.5" x2="10" y2="7" {...p} strokeWidth={1} />
      <circle cx="10" cy="10" r="0.5" fill="currentColor" stroke="none" />
    </I>
  );
}

export function TableIcon(props) {
  return (
    <I {...props}>
      <rect x="3" y="4" width="14" height="12" rx="0.5" {...p} />
      {/* 4 leg rings with center dots */}
      {[[5, 6], [15, 6], [5, 14], [15, 14]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="1.2" {...p} strokeWidth={1} />
          <circle cx={cx} cy={cy} r="0.4" fill="currentColor" stroke="none" />
        </g>
      ))}
    </I>
  );
}

export function TVIcon(props) {
  return (
    <I {...props}>
      {/* Screen */}
      <rect x="2" y="7" width="16" height="5" rx="0.5" {...p} />
      {/* Inner bezel */}
      <rect x="3" y="7.8" width="14" height="3.4" rx="0.3" {...p} strokeWidth={0.8} />
      {/* Stand mount + base */}
      <line x1="10" y1="12" x2="10" y2="14" {...p} />
      <line x1="7" y1="14" x2="13" y2="14" {...p} />
      {/* Power LED dot */}
      <circle cx="16.5" cy="11" r="0.4" fill="currentColor" stroke="none" />
    </I>
  );
}

export function SofaIcon(props) {
  return (
    <I {...props}>
      <rect x="2" y="5" width="16" height="10" rx="1" {...p} />
      {/* Backrest line */}
      <line x1="2" y1="8" x2="18" y2="8" {...p} />
      {/* Armrest lines */}
      <line x1="4" y1="8" x2="4" y2="15" {...p} />
      <line x1="16" y1="8" x2="16" y2="15" {...p} />
      {/* Cushion dividers */}
      <line x1="8" y1="8.5" x2="8" y2="14.5" {...p} strokeWidth={0.8} strokeDasharray="1.5 1" />
      <line x1="12" y1="8.5" x2="12" y2="14.5" {...p} strokeWidth={0.8} strokeDasharray="1.5 1" />
    </I>
  );
}

export function BedIcon(props) {
  return (
    <I {...props}>
      {/* Bed frame */}
      <rect x="3" y="3" width="14" height="14" rx="0.5" {...p} />
      {/* Headboard bar */}
      <rect x="3" y="3" width="14" height="2.5" rx="0.5" {...p} strokeWidth={1.8} />
      {/* Two pillows */}
      <rect x="4.5" y="6.5" width="4.5" height="3" rx="1.2" {...p} />
      <rect x="11" y="6.5" width="4.5" height="3" rx="1.2" {...p} />
    </I>
  );
}
