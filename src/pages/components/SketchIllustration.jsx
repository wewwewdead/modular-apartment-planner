export default function SketchIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Rectangle */}
      <rect
        x="25"
        y="30"
        width="50"
        height="35"
        stroke="var(--color-workspace-sketch)"
        strokeWidth="2"
        fill="var(--color-workspace-sketch-subtle)"
        rx="2"
      />

      {/* Circle */}
      <circle
        cx="140"
        cy="45"
        r="28"
        stroke="var(--color-workspace-sketch)"
        strokeWidth="2"
        fill="none"
      />

      {/* Triangle */}
      <polygon
        points="45,130 75,85 105,130"
        stroke="var(--color-workspace-sketch)"
        strokeWidth="2"
        fill="var(--color-workspace-sketch-subtle)"
        strokeLinejoin="round"
      />

      {/* Diagonal line */}
      <line
        x1="115"
        y1="90"
        x2="175"
        y2="130"
        stroke="var(--color-workspace-sketch)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Bezier curve */}
      <path
        d="M 120 110 Q 145 75 170 105"
        stroke="var(--color-workspace-sketch)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="4 3"
      />

      {/* Small accent dots */}
      <circle cx="25" cy="30" r="2.5" fill="var(--color-workspace-sketch)" opacity="0.6" />
      <circle cx="75" cy="30" r="2.5" fill="var(--color-workspace-sketch)" opacity="0.6" />
      <circle cx="75" cy="65" r="2.5" fill="var(--color-workspace-sketch)" opacity="0.6" />
      <circle cx="25" cy="65" r="2.5" fill="var(--color-workspace-sketch)" opacity="0.6" />

      {/* Grid dots for texture */}
      {[50, 100, 150].map((x) =>
        [25, 75, 125].map((y) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="0.6"
            fill="var(--color-grid-major)"
            opacity="0.4"
          />
        ))
      )}

      {/* Dimension text */}
      <text
        x="50"
        y="25"
        textAnchor="middle"
        fontSize="5"
        fill="var(--color-text-secondary)"
        fontFamily="var(--font-blueprint)"
      >
        50x35
      </text>
    </svg>
  );
}
