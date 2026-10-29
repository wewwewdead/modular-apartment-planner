import { useState } from 'react';

// Material names only: choosing a grade does not change stock dimensions or
// assign unverified strength, density or cost properties to the solid.
const MATERIAL_GROUPS = {
  Metals: [
    'Aluminum',
    'Aluminum 5052',
    'Aluminum 6061',
    'Aluminum 6063',
    'Steel',
    'Mild steel',
    'SPCC',
    'Galvanized steel',
    'Stainless steel',
    'Stainless steel 304',
    'Stainless steel 316',
    'Brass',
    'Copper',
    'Titanium',
  ],
  'Wood & sheet goods': [
    'Plywood',
    'Birch plywood',
    'Marine plywood',
    'MDF',
    'Particle board',
    'Pine',
    'Oak',
    'Walnut',
    'Bamboo',
  ],
  Plastics: ['ABS', 'Acrylic', 'Polycarbonate', 'Nylon', 'HDPE', 'PVC', 'PTFE', 'PETG', 'PLA'],
  Other: ['Rubber', 'Silicone', 'Glass'],
};
const builtins = Object.values(MATERIAL_GROUPS).flat();
const CUSTOM = '__custom_material__';

export default function MaterialSelect({ label = 'Material', value = '', onChange, projectMaterials = [] }) {
  const [search, setSearch] = useState('');
  const [customFor, setCustomFor] = useState(null);
  const custom = (!builtins.includes(value) && value !== '') || customFor === value;
  const groups = {
    ...MATERIAL_GROUPS,
    'Project materials': [...new Set(projectMaterials)].filter(
      (name) => typeof name === 'string' && name && !builtins.includes(name),
    ),
  };
  const query = search.trim().toLowerCase().replaceAll('aluminium', 'aluminum');
  const filtered = Object.entries(groups).map(([group, names]) => [
    group,
    names.filter((name) => name.toLowerCase().replaceAll('aluminium', 'aluminum').includes(query)),
  ]);
  const listed = filtered.flatMap(([, names]) => names);
  return (
    <div className="cad-material-picker">
      <label className="cad-field">
        {label}
        <select
          aria-label={label}
          value={custom ? CUSTOM : value || ''}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomFor(value);
              return;
            }
            setCustomFor(null);
            setSearch('');
            onChange(e.target.value);
          }}
        >
          <option value="">Unspecified — choose a material</option>
          {value && !listed.includes(value) && <option value={value}>{value} (current)</option>}
          {filtered
            .filter(([, names]) => names.length)
            .map(([group, names]) => (
              <optgroup key={group} label={group}>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
          <option value={CUSTOM}>Custom material…</option>
        </select>
      </label>
      <details>
        <summary>Search materials</summary>
        <label className="cad-field">
          Search {label.toLowerCase()}
          <input
            type="search"
            value={search}
            placeholder="e.g. aluminum, SPCC, plywood"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {query && !listed.length && (
          <p className="cad-help">No matching materials. Choose Custom material to enter your own.</p>
        )}
      </details>
      {custom && (
        <label className="cad-field">
          Custom {label.toLowerCase()}
          <input
            key={value}
            defaultValue={value}
            placeholder="Material, grade or finish"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== value) onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
      )}
    </div>
  );
}
