import { useCallback, useState } from 'react';
import templates from '../templates/index';
import TemplateThumbnail from './TemplateThumbnail';
import Toast from '../../components/Toast';
import { BusyButton, LOADING_COPY } from '@/ui/loading';
import styles from '../styles/craftsman.module.css';

const DIFFICULTY_COLORS = {
  beginner: '#51cf66',
  intermediate: '#ffd43b',
  advanced: '#ff6b6b',
};

export default function TemplateGallery({ onLoadTemplate, onBack }) {
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const clearToast = useCallback(() => setToast(null), []);

  const handleLoad = useCallback(
    async (template) => {
      if (loading) return;
      setLoading(template.id);
      try {
        const module = await template.load();
        const workspace = module.default || module;
        onLoadTemplate(workspace);
      } catch (err) {
        setToast({ message: `Failed to load template: ${err.message}`, type: 'error' });
      } finally {
        setLoading(null);
      }
    },
    [loading, onLoadTemplate],
  );

  return (
    <div className={styles.templateGallery}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className={styles.sidebarTitle}>Template Gallery</h2>
        {onBack && (
          <button type="button" className={styles.galleryBackBtn} onClick={onBack}>
            Back
          </button>
        )}
      </div>
      <p className={styles.hint}>
        Pick a starter project. All templates come with materials assigned and are ready to customize.
      </p>

      <div className={styles.templateGrid}>
        {templates.map((t) => (
          // The card keeps its size while its module loads; the other cards
          // stay pickable only once this one has landed.
          <BusyButton
            key={t.id}
            className={styles.templateCard}
            busy={loading === t.id}
            busyLabel={LOADING_COPY.templateCard}
            spinnerTone="dark"
            disabled={Boolean(loading) && loading !== t.id}
            onClick={() => handleLoad(t)}
          >
            <span className={styles.templateCardBody}>
              <TemplateThumbnail templateId={t.id} />
              <span className={styles.templateCardName}>{t.name}</span>
              <span className={styles.templateCardDesc}>{t.description}</span>
              <span className={styles.templateCardMeta}>
                <span className={styles.templateCardBadge} style={{ color: DIFFICULTY_COLORS[t.difficulty] }}>
                  {t.difficulty}
                </span>
                <span>{t.estimatedTime}</span>
              </span>
            </span>
          </BusyButton>
        ))}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={clearToast} />}
    </div>
  );
}
