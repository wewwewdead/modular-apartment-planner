import { useSketch } from '../app/SketchProvider';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { useSketchProject } from '../SketchWorkspace';
import { getDefaultParams } from '../domain/templates/templateRegistry';
import { createAssembly } from '../domain/assemblyModels';
import { createSketchObject } from '../domain/objectModels';
import { SKETCH_TOOLS } from '../domain/defaults';
import { generateId } from '@/domain/ids';
import styles from './SketchEmptyState.module.css';

export default function SketchEmptyState() {
  const { dispatch } = useSketch();
  const { dispatch: editorDispatch } = useSketchEditor();
  const { setShowTemplateDialog } = useSketchProject();

  const handleExampleObject = () => {
    const objectId = generateId('obj');
    dispatch({
      type: 'TEMPLATE_GENERATE',
      templateType: 'desk',
      params: getDefaultParams('desk'),
      objectId,
    });
    editorDispatch({ type: 'SELECT_OBJECT', id: objectId, objectType: 'object' });
    editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
    editorDispatch({ type: 'DISMISS_EMPTY_STATE' });
  };

  const handleFreeCanvasObject = () => {
    const object = createSketchObject('Custom Object', {
      id: generateId('obj'),
      category: 'general',
      summary: 'Free-canvas custom object',
    });
    const assembly = createAssembly('Module 1', {
      objectId: object.id,
      category: 'general',
      description: 'Primary editable module',
    });
    dispatch({ type: 'OBJECT_CREATE', object, assemblies: [assembly] });
    editorDispatch({ type: 'DISMISS_EMPTY_STATE' });
    editorDispatch({ type: 'SET_TOOL', tool: SKETCH_TOOLS.SOLID });
    editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: assembly.id });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.title}>Design an object</h2>
        <p className={styles.subtitle}>
          Start with an empty object and module, sketch freeform solids directly in 3D, or use a template as a starter kit.
        </p>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleFreeCanvasObject}>
            Start Free Canvas
          </button>
          <button className={styles.btnPrimary} onClick={() => setShowTemplateDialog(true)}>
            Create from Template
          </button>
          <button className={styles.btnSecondary} onClick={handleExampleObject}>
            Load Example Desk
          </button>
        </div>
      </div>
    </div>
  );
}
