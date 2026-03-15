export default function FloorplanIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer walls */}
      <rect
        x="20"
        y="15"
        width="160"
        height="120"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="4"
        fill="none"
        rx="1"
      />

      {/* Interior wall — horizontal divider */}
      <line
        x1="20"
        y1="70"
        x2="120"
        y2="70"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="3"
      />

      {/* Interior wall — vertical divider */}
      <line
        x1="120"
        y1="15"
        x2="120"
        y2="135"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="3"
      />

      {/* Door arc — bottom-left room */}
      <path
        d="M 60 135 A 22 22 0 0 1 82 135"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="2 2"
      />
      {/* Door opening */}
      <line
        x1="60"
        y1="135"
        x2="60"
        y2="113"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="1.5"
      />

      {/* Window marks — right wall */}
      <line
        x1="180"
        y1="40"
        x2="180"
        y2="60"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="2"
        strokeDasharray="3 2"
      />
      <line
        x1="176"
        y1="40"
        x2="176"
        y2="60"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="1"
      />
      <line
        x1="184"
        y1="40"
        x2="184"
        y2="60"
        stroke="var(--color-workspace-floorplan)"
        strokeWidth="1"
      />

      {/* Dimension line — top */}
      <line
        x1="24"
        y1="8"
        x2="176"
        y2="8"
        stroke="var(--color-text-secondary)"
        strokeWidth="0.5"
      />
      <line x1="24" y1="5" x2="24" y2="11" stroke="var(--color-text-secondary)" strokeWidth="0.5" />
      <line x1="176" y1="5" x2="176" y2="11" stroke="var(--color-text-secondary)" strokeWidth="0.5" />
      <text
        x="100"
        y="7"
        textAnchor="middle"
        fontSize="5"
        fill="var(--color-text-secondary)"
        fontFamily="var(--font-blueprint)"
      >
        6000
      </text>

      {/* Room labels */}
      <text
        x="65"
        y="48"
        textAnchor="middle"
        fontSize="7"
        fill="var(--color-text-secondary)"
        fontFamily="var(--font-ui)"
        fontWeight="500"
      >
        Living
      </text>
      <text
        x="65"
        y="108"
        textAnchor="middle"
        fontSize="7"
        fill="var(--color-text-secondary)"
        fontFamily="var(--font-ui)"
        fontWeight="500"
      >
        Kitchen
      </text>
      <text
        x="155"
        y="80"
        textAnchor="middle"
        fontSize="7"
        fill="var(--color-text-secondary)"
        fontFamily="var(--font-ui)"
        fontWeight="500"
      >
        Bedroom
      </text>

      {/* Grid dots for texture */}
      {[40, 60, 80, 100].map((x) =>
        [30, 50, 90, 110].map((y) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="0.6"
            fill="var(--color-grid-major)"
            opacity="0.5"
          />
        ))
      )}
    </svg>
  );
}
