import useScrollReveal from './useScrollReveal';
import styles from './FeatureGrid.module.css';

const features = [
  {
    label: 'Millimeter precision',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 17V1h16" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="5" y1="1" x2="5" y2="4" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="9" y1="1" x2="9" y2="6" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="13" y1="1" x2="13" y2="4" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="5" x2="4" y2="5" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="9" x2="6" y2="9" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="13" x2="4" y2="13" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Phase-based planning',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="3" width="5" height="12" rx="1" stroke="var(--color-accent)" strokeWidth="1.5" />
        <rect x="6.5" y="6" width="5" height="9" rx="1" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.6" />
        <rect x="12" y="9" width="5" height="6" rx="1" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.35" />
      </svg>
    ),
  },
  {
    label: '3D preview',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 1L16 5v8l-7 4L2 13V5l7-4z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 9l7-4" stroke="var(--color-accent)" strokeWidth="1" />
        <path d="M9 9L2 5" stroke="var(--color-accent)" strokeWidth="1" />
        <path d="M9 9v8" stroke="var(--color-accent)" strokeWidth="1" />
      </svg>
    ),
  },
  {
    label: 'Sheet documentation',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="1" width="14" height="16" rx="2" stroke="var(--color-accent)" strokeWidth="1.5" />
        <line x1="5" y1="5" x2="13" y2="5" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="5" y1="8" x2="13" y2="8" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
        <line x1="5" y1="11" x2="10" y2="11" stroke="var(--color-accent)" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Export workflows',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 2v9" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.5 8L9 11.5 12.5 8" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 14h12" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 14v2h12v-2" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Keyboard-first',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="4" width="16" height="10" rx="2" stroke="var(--color-accent)" strokeWidth="1.5" />
        <rect x="4" y="7" width="2" height="2" rx="0.5" fill="var(--color-accent)" opacity="0.5" />
        <rect x="8" y="7" width="2" height="2" rx="0.5" fill="var(--color-accent)" opacity="0.5" />
        <rect x="12" y="7" width="2" height="2" rx="0.5" fill="var(--color-accent)" opacity="0.5" />
        <rect x="5" y="10.5" width="8" height="1.5" rx="0.5" fill="var(--color-accent)" opacity="0.3" />
      </svg>
    ),
  },
];

function FeatureItem({ label, icon }) {
  const ref = useScrollReveal();

  return (
    <div className={styles.item} ref={ref}>
      <div className={styles.iconWrap}>{icon}</div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

export default function FeatureGrid() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.heading}>Built for architects and planners</p>
        <div className={styles.grid}>
          {features.map((feature) => (
            <FeatureItem key={feature.label} label={feature.label} icon={feature.icon} />
          ))}
        </div>
      </div>
    </section>
  );
}
