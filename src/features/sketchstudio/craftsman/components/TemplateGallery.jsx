import { useCallback, useState } from 'react';
import templates from '../templates/index';
import TemplateThumbnail from './TemplateThumbnail';
import styles from '../styles/craftsman.module.css';

const DIFFICULTY_COLORS = {
  beginner: '#51cf66',
  intermediate: '#ffd43b',
  advanced: '#ff6b6b',
};

export default function TemplateGallery({ onLoadTemplate, onBack }) {
  const [loading, setLoading] = useState(null);

  const handleLoad = useCallback(async (template) => {
    if (loading) return;
    setLoading(template.id);
    try {
      const module = await template.load();
      const workspace = module.default || module;
      onLoadTemplate(workspace);
    } catch (err) {
      alert(`Failed to load template: ${err.message}`);
    } finally {
      setLoading(null);
    }
  }, [loading, onLoadTemplate]);

  return (
    <div className={styles.templateGallery}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className={styles.sidebarTitle}>Template Gallery</h2>
        {onBack && (
          <button type="button" className={styles.galleryBackBtn} onClick={onBack}>Back</button>
        )}
      </div>
      <p className={styles.hint}>Pick a starter project. All templates come with materials assigned and are ready to customize.</p>

      <div className={styles.templateGrid}>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.templateCard}
            onClick={() => handleLoad(t)}
            disabled={loading === t.id}
          >
            <TemplateThumbnail templateId={t.id} />
            <span className={styles.templateCardName}>
              {loading === t.id ? 'Loading...' : t.name}
            </span>
            <span className={styles.templateCardDesc}>{t.description}</span>
            <div className={styles.templateCardMeta}>
              <span className={styles.templateCardBadge} style={{ color: DIFFICULTY_COLORS[t.difficulty] }}>
                {t.difficulty}
              </span>
              <span>{t.estimatedTime}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
