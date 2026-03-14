export default function PhaseSelector({
  phaseId,
  phases = [],
  onChange,
  label = 'Phase',
  unassignedLabel = 'Unassigned',
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</label>
      <select
        value={phaseId || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          flex: 1,
          height: '28px',
          padding: '0 4px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          background: 'var(--color-surface-elevated)',
        }}
      >
        <option value="">{unassignedLabel}</option>
        {phases.map((phase) => (
          <option key={phase.id} value={phase.id}>{phase.name}</option>
        ))}
      </select>
    </div>
  );
}
