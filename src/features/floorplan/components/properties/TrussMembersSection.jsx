import { useMemo } from 'react';
import {
  TRUSS_MEMBER_KEYS,
  TRUSS_MEMBER_PRESETS,
  TRUSS_MEMBER_PRESET_KEYS,
  TRUSS_PURLIN_ROLES,
  deriveTrussRiseFromPitch,
  getTrussMemberPresetSizes,
  getTrussProfileOptions,
  normalizeTrussHeel,
  normalizeTrussLabelPrefix,
  normalizeTrussMemberSizes,
  resolveTrussType,
} from '@/domain/trussModels';
import { formatSlopeReadout } from '@/domain/roofCoveringCatalog';
import { buildTrussProfile } from '@/truss/profile';
import { listWebPatternsForShape } from '@/truss/webPatterns';
import { buildTrussInstanceWarnings, resolveCarriedCovering, suggestPurlinsFromCovering } from '@/truss/trussAdvice';
import { Hint, NumberField, Readout, Section, SelectField, Stack, Status, TextField, panelKitStyles } from './PanelKit';
import styles from '../PropertiesPanel.module.css';

/*
 * RT-3 truss accuracy panels (docs/roof-truss-industrial.md §7.6), PanelKit
 * sections in the old-style truss panels (the pattern of
 * TrussEndClosuresSection): Members and the purlin role on the SYSTEM, the
 * profile (pitch in degrees, web pattern, scissor ratio, readouts, advice) on
 * the INSTANCE. Every derived figure is a Readout; nothing is stored that the
 * normalizers would not fill.
 */

const MEMBER_ROW_LABELS = { topChord: 'Top chord', bottomChord: 'Bottom chord', web: 'Webs' };
const ROLE_LABELS = { purlin: 'Purlins', batten: 'Battens' };

function presetLabel(key) {
  return key === 'custom' ? 'Custom' : TRUSS_MEMBER_PRESETS[key]?.label || key;
}

/** System panel: member sizes, raised heel, label prefix. */
export function TrussMembersSection({ trussSystem, updateSystem, u }) {
  const sizes = normalizeTrussMemberSizes(trussSystem.memberSizes);
  const heel = normalizeTrussHeel(trussSystem.heel);
  const prefix = normalizeTrussLabelPrefix(trussSystem.labelPrefix);
  const setSize = (memberKey, field, value) => {
    const next = Math.max(10, u.fromDisplay(value));
    updateSystem({
      memberSizes: { ...sizes, preset: 'custom', [memberKey]: { ...sizes[memberKey], [field]: next } },
    });
  };
  const summary = `${presetLabel(sizes.preset)}${heel.raised > 0 ? ` · raised heel ${u.toDisplay(heel.raised)} ${u.suffix}` : ''}`;

  return (
    <div className={panelKitStyles.gutter} data-truss-members="">
      <Section id="truss-members" title="Members" summary={summary}>
        <SelectField
          label="Preset"
          value={sizes.preset}
          onChange={(preset) =>
            updateSystem({
              memberSizes:
                preset === 'custom' ? { ...sizes, preset } : { ...getTrussMemberPresetSizes(preset), preset },
            })
          }
        >
          {TRUSS_MEMBER_PRESET_KEYS.map((key) => (
            <option key={key} value={key}>
              {presetLabel(key)}
            </option>
          ))}
        </SelectField>
        {TRUSS_MEMBER_KEYS.map((memberKey) => (
          <div key={memberKey} data-member-row={memberKey}>
            <div className={styles.subtitle}>{MEMBER_ROW_LABELS[memberKey]}</div>
            <NumberField
              label="Depth"
              unit={u.suffix}
              step={u.step(5)}
              value={u.toDisplay(sizes[memberKey].depth)}
              onChange={(value) => setSize(memberKey, 'depth', value)}
            />
            <NumberField
              label="Width"
              unit={u.suffix}
              step={u.step(5)}
              value={u.toDisplay(sizes[memberKey].width)}
              onChange={(value) => setSize(memberKey, 'width', value)}
            />
          </div>
        ))}
        <Hint>
          Depth lies in the truss plane, width across it. Metal presets set sizes only; the material stays per truss.
        </Hint>
        <NumberField
          label="Raised heel"
          unit={u.suffix}
          step={u.step(50)}
          value={u.toDisplay(heel.raised)}
          onChange={(value) => updateSystem({ heel: { raised: Math.max(0, u.fromDisplay(value)) } })}
        />
        <TextField
          label="Label prefix"
          value={prefix}
          onChange={(value) => updateSystem({ labelPrefix: normalizeTrussLabelPrefix(value) })}
        />
        <Hint>
          Trusses read {prefix}1, {prefix}2 … on the layout plan; an infilled end copy reads GE (gable end frame).
        </Hint>
      </Section>
    </div>
  );
}

/** System panel, inside Purlins: role and "Suggest from covering". */
export function TrussPurlinRoleSection({ trussSystem, roofSystem, updatePurlins }) {
  const purlinSystem = trussSystem.purlinSystem || {};
  const carried = resolveCarriedCovering(trussSystem, roofSystem);
  const suggestion = carried ? suggestPurlinsFromCovering(carried.covering) : null;
  return (
    <div className={panelKitStyles.gutter} data-truss-purlin-role="">
      <SelectField
        label="Role"
        value={TRUSS_PURLIN_ROLES.includes(purlinSystem.role) ? purlinSystem.role : 'purlin'}
        onChange={(role) => updatePurlins({ role })}
      >
        {TRUSS_PURLIN_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </SelectField>
      <Stack>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!suggestion}
          onClick={() => suggestion && updatePurlins(suggestion)}
        >
          Suggest from covering
        </button>
      </Stack>
      {suggestion ? (
        <Hint>
          {carried.product.label}: {ROLE_LABELS[suggestion.role].toLowerCase()} {suggestion.width} × {suggestion.depth}{' '}
          at {suggestion.spacing} mm. Applied only when you press the button.
        </Hint>
      ) : (
        <Hint>
          {carried
            ? 'This covering sits on a deck or is the structure itself: no purlins to suggest.'
            : 'Attach a roof to this truss system to size purlins from its covering.'}
        </Hint>
      )}
    </div>
  );
}

/** Instance panel: pitch in degrees, web pattern, scissor ratio, readouts and advice. */
export function TrussProfileSection({ trussSystem, trussInstance, updateInstance, roofSystem, u }) {
  const trussType = resolveTrussType(trussInstance.trussTypeId);
  const shape = trussType.shape || trussType.family;
  const family = trussType.family;
  const profile = useMemo(
    () => buildTrussProfile(trussInstance, undefined, getTrussProfileOptions(trussSystem)),
    [trussInstance, trussSystem],
  );
  const metrics = profile.metrics;
  const patterns = listWebPatternsForShape(shape);
  const warnings = buildTrussInstanceWarnings({ trussSystem, trussInstance, profile, roofSystem });
  const length = (value) => `${u.toDisplay(value || 0)}`;
  const summary = `${formatSlopeReadout(metrics.pitch || 0)} · heel ${length(metrics.heelHeight)} ${u.suffix}`;

  return (
    <div className={panelKitStyles.gutter} data-truss-profile="">
      <Section id="truss-instance-profile" title="Profile" summary={summary}>
        {family !== 'flat' ? (
          <NumberField
            label="Pitch"
            unit="°"
            step={0.5}
            value={Number((metrics.pitchDegrees || 0).toFixed(2))}
            onChange={(value) => {
              // Degrees are an INPUT only: they write rise (the source of truth)
              // and the matching percent; no degree value is stored.
              const degrees = Math.min(80, Math.max(0, Number(value) || 0));
              const percent = Math.tan((degrees * Math.PI) / 180) * 100;
              updateInstance({
                rise: deriveTrussRiseFromPitch(percent, trussInstance.span, family),
                pitch: percent,
              });
            }}
          />
        ) : null}
        {patterns.length ? (
          <SelectField
            label="Web pattern"
            value={profile.webPatternKey || ''}
            onChange={(key) => updateInstance({ webPatternKey: key || null })}
          >
            {patterns.map((pattern) => (
              <option key={pattern.key} value={pattern.key}>
                {pattern.label}
              </option>
            ))}
          </SelectField>
        ) : (
          <Hint>
            This shape keeps its panel layout; named web patterns are for gable, scissor, mono and flat trusses.
          </Hint>
        )}
        {shape === 'scissor' ? (
          <NumberField
            label="Scissor ratio"
            step={0.05}
            value={Number(trussInstance.scissorBottomPitchRatio ?? 0.5)}
            onChange={(value) =>
              updateInstance({ scissorBottomPitchRatio: Math.min(0.9, Math.max(0, Number(value) || 0)) })
            }
          />
        ) : null}
        <Readout label="Pitch" value={family === 'flat' ? 'Flat' : formatSlopeReadout(metrics.pitch || 0)} />
        <Readout label="Heel height" value={length(metrics.heelHeight)} unit={u.suffix} />
        <Readout label="Overall height" value={length(metrics.overallHeight)} unit={u.suffix} />
        <Readout label="Out to out" value={length(metrics.outToOut)} unit={u.suffix} />
        <Readout
          label="Members"
          value={`${profile.members.length} (${profile.members.filter((member) => member.memberType === 'web').length} webs)`}
        />
        {warnings.map((warning) => (
          <Status key={warning} tone="warning">
            {warning}
          </Status>
        ))}
        <Hint>
          End copies closed by an infill are drawn as gable end frames (studs at 600) in 3D and on the plan (GE).
        </Hint>
      </Section>
    </div>
  );
}
