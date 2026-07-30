import { memo } from 'react';
import { sectionCutLength } from '@/geometry/sectionCutGeometry';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function SectionCutProperties({ sectionCut, dispatch, floorId, editorDispatch, u }) {
  const updateSectionCut = (updates) => {
    dispatch({ type: 'SECTION_UPDATE', floorId, sectionCut: { id: sectionCut.id, ...updates } });
  };
  const len = sectionCutLength(sectionCut);

  return (
    <div>
      <div className={styles.title}>Section Cut</div>
      <InputField label="Label" value={sectionCut.label} onChange={(value) => updateSectionCut({ label: value })} />
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(sectionCut.startPoint.x)}
        onChange={(value) =>
          updateSectionCut({
            startPoint: { ...sectionCut.startPoint, x: u.fromDisplay(value) },
          })
        }
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(sectionCut.startPoint.y)}
        onChange={(value) =>
          updateSectionCut({
            startPoint: { ...sectionCut.startPoint, y: u.fromDisplay(value) },
          })
        }
      />
      <div className={styles.subtitle}>End Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(sectionCut.endPoint.x)}
        onChange={(value) =>
          updateSectionCut({
            endPoint: { ...sectionCut.endPoint, x: u.fromDisplay(value) },
          })
        }
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(sectionCut.endPoint.y)}
        onChange={(value) =>
          updateSectionCut({
            endPoint: { ...sectionCut.endPoint, y: u.fromDisplay(value) },
          })
        }
      />
      <div className={styles.subtitle}>Properties</div>
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(sectionCut.depth)}
        onChange={(value) => updateSectionCut({ depth: Math.max(100, u.fromDisplay(value)) })}
      />
      <InputField label="Length" type="number" suffix={u.suffix} value={u.toDisplay(len)} readOnly />
      <button
        className={styles.actionBtn}
        onClick={() => updateSectionCut({ direction: sectionCut.direction === -1 ? 1 : -1 })}
      >
        Flip section direction
      </button>
      <button
        className={styles.actionBtn}
        onClick={() => editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'section_view', sectionCutId: sectionCut.id })}
      >
        Open section view
      </button>
    </div>
  );
}

export default memo(SectionCutProperties);
