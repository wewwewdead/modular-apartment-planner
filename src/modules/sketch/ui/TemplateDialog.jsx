import { useState } from 'react';
import Modal from '@/ui/Modal';
import { templateList, getDefaultParams } from '../domain/templates/templateRegistry';
import { SKETCH_OBJECT_CATEGORIES } from '../domain/defaults';
import TemplateParamsForm from './TemplateParamsForm';
import styles from './TemplateDialog.module.css';

const FREE_CANVAS_TYPE = '__free_canvas__';

const TEMPLATE_ICONS = {
  table: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <rect x="4" y="6" width="32" height="4" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="6" y="10" width="3" height="24" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="31" y="10" width="3" height="24" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  cabinet: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <rect x="4" y="4" width="32" height="32" rx="2" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" />
      <line x1="20" y1="4" x2="20" y2="36" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="17" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="23" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  desk: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <rect x="2" y="8" width="36" height="4" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="3" y="12" width="4" height="22" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="33" y="12" width="4" height="22" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  shelf: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <rect x="6" y="2" width="3" height="36" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="31" y="2" width="3" height="36" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="9" y="4" width="22" height="2" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="9" y="14" width="22" height="2" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="9" y="24" width="22" height="2" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="9" y="34" width="22" height="2" rx="0.5" fill="currentColor" opacity="0.4" />
    </svg>
  ),
  bed: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <rect x="6" y="16" width="28" height="8" rx="2" fill="currentColor" opacity="0.65" />
      <rect x="4" y="10" width="5" height="18" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="31" y="18" width="3" height="14" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="8" y="24" width="3" height="10" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="29" y="24" width="3" height="10" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  ),
  boat: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <path d="M5 24h30l-4 7H9z" fill="currentColor" opacity="0.22" />
      <path d="M6 24c4-8 9-12 14-12s10 4 14 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 24h24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <path d="M20 12v10" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <path d="M6 24h28l-2 6H8z" fill="currentColor" opacity="0.22" />
      <path d="M8 24l5-8h12l7 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 24h28" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <circle cx="12" cy="31" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="28" cy="31" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  [FREE_CANVAS_TYPE]: (
    <svg viewBox="0 0 40 40" className={styles.cardIcon}>
      <path d="M7 30l7-18 9 7 10-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="30" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="14" cy="12" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="23" cy="19" r="2" fill="currentColor" opacity="0.45" />
      <circle cx="33" cy="8" r="2" fill="currentColor" opacity="0.45" />
    </svg>
  ),
};

const createOptions = [
  {
    type: FREE_CANVAS_TYPE,
    label: 'Free Canvas Object',
    description: 'Start with an empty object and first module, then sketch any shape directly in 3D.',
  },
  ...templateList,
];

export default function TemplateDialog({ onClose, onGenerate }) {
  const [selectedType, setSelectedType] = useState(null);
  const [params, setParams] = useState({});

  const handleSelectTemplate = (type) => {
    setSelectedType(type);
    if (type === FREE_CANVAS_TYPE) {
      setParams({
        objectName: 'Custom Object',
        moduleName: 'Module 1',
        category: 'general',
      });
      return;
    }
    setParams(getDefaultParams(type));
  };

  const handleParamChange = (key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = () => {
    onGenerate(selectedType, params);
    onClose();
  };

  const selectedTemplate = selectedType === FREE_CANVAS_TYPE
    ? { type: FREE_CANVAS_TYPE, label: 'Free Canvas Object' }
    : selectedType
      ? templateList.find((t) => t.type === selectedType)
      : null;

  return (
    <Modal title="Create from Template" onClose={onClose}>
      {!selectedTemplate ? (
        <div className={styles.grid}>
          {createOptions.map((tmpl) => (
            <button
              key={tmpl.type}
              className={styles.card}
              onClick={() => handleSelectTemplate(tmpl.type)}
            >
              {TEMPLATE_ICONS[tmpl.type] || null}
              <span className={styles.cardLabel}>{tmpl.label}</span>
              <span className={styles.cardDesc}>{tmpl.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.paramView}>
          <div className={styles.paramHeader}>
            <button className={styles.backBtn} onClick={() => setSelectedType(null)}>
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <span className={styles.paramTitle}>{selectedTemplate.label}</span>
          </div>

          {selectedType === FREE_CANVAS_TYPE ? (
            <div className={styles.manualForm}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Object Name</span>
                <input
                  className={styles.textInput}
                  value={params.objectName || ''}
                  onChange={(event) => handleParamChange('objectName', event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>First Module</span>
                <input
                  className={styles.textInput}
                  value={params.moduleName || ''}
                  onChange={(event) => handleParamChange('moduleName', event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Category</span>
                <select
                  className={styles.selectInput}
                  value={params.category || 'general'}
                  onChange={(event) => handleParamChange('category', event.target.value)}
                >
                  {SKETCH_OBJECT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category[0].toUpperCase() + category.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <TemplateParamsForm
              parameters={selectedTemplate.parameters}
              values={params}
              onChange={handleParamChange}
            />
          )}

          <button className={styles.createBtn} onClick={handleCreate}>
            {selectedType === FREE_CANVAS_TYPE ? 'Create Free Canvas Object' : `Create ${selectedTemplate.label}`}
          </button>
        </div>
      )}
    </Modal>
  );
}
