import { useMemo, useState } from 'react';
import { useSketch } from '../app/SketchProvider';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { useSketchProject } from '../SketchWorkspace';
import { createAssembly } from '../domain/assemblyModels';
import { buildObjectTree } from '../domain/objectModels';
import { CONSTRUCTION_ANNOTATION_TYPES, getConstructionAnnotations } from '../domain/constructionModels';
import { createSheet } from '@/domain/sheetModels';
import { generateAssemblySheet, generateObjectSheet } from '../sheets/sketchSheetTemplates';
import styles from './SketchSidebar.module.css';

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <path d="M3 5h10M6 5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.5 5l.5 8a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5l.5-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AssemblyIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5" y="5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ObjectIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="3" x2="10" y2="13" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <rect x="1" y="3" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <path d="M3 11.5L11.5 3l1.5 1.5L4.5 13H3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.8 4.7l1.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg viewBox="0 0 16 16" className={`${styles.layerActionIcon} ${styles.expandToggle}`} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <rect x="2" y="1" width="12" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function TemplateIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.layerActionIcon}>
      <rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TreeItem({ children, depth = 0, isSelected, onClick }) {
  return (
    <div
      className={`${styles.layerItem} ${isSelected ? styles.layerItemActive : ''}`}
      style={depth > 0 ? { paddingLeft: `${8 + depth * 16}px` } : undefined}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

function PartItem({ part, depth, isSelected, onSelect, onDelete, onClone, allowActions = true }) {
  return (
    <TreeItem depth={depth} isSelected={isSelected} onClick={() => onSelect(part.id)}>
      <div className={styles.layerInfo}>
        <span className={styles.categoryBadge}>{part.type}</span>
        <span className={styles.layerName}>{part.name}</span>
      </div>
      {allowActions && (
        <div className={styles.layerActions}>
          <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); onClone(part.id); }} aria-label="Duplicate Part" title="Duplicate Part">
            <CloneIcon />
          </button>
          <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); onDelete(part.id); }} aria-label="Delete Part" title="Delete Part">
            <TrashIcon />
          </button>
        </div>
      )}
    </TreeItem>
  );
}

function AssemblyBadges({ assembly }) {
  if (!assembly) return null;

  const badges = [];
  if (assembly.componentLabel) badges.push(assembly.componentLabel);
  if (assembly.instanceMode === 'linked') badges.push('linked');
  if (assembly.mirrorSourceAssemblyId) badges.push('mirror');
  if (assembly.patternType) badges.push(assembly.patternType);

  if (badges.length === 0) return null;

  return badges.map((badge) => (
    <span key={`${assembly.id}-${badge}`} className={styles.categoryBadge}>{badge}</span>
  ));
}

export default function SketchSidebar() {
  const { project, dispatch } = useSketch();
  const {
    activeAssemblyId,
    selectedId,
    selectedType,
    workspaceMode,
    activeSheetId,
    dispatch: editorDispatch,
  } = useSketchEditor();
  const { setShowTemplateDialog } = useSketchProject();
  const [expandedIds, setExpandedIds] = useState(new Set());

  const objects = project.objects || [];
  const objectTrees = useMemo(
    () => objects.map((object) => ({ object, tree: buildObjectTree(project, object) })),
    [objects, project]
  );
  const manualAssemblies = (project.assemblies || []).filter((assembly) => !assembly.objectId);
  const allParts = project.parts.filter((part) => part.type !== 'dimension');
  const manualParts = allParts.filter((part) => !part.objectId && !part.assemblyId);
  const constructionAnnotations = getConstructionAnnotations(project.annotations || []);
  const sheets = project.sheets || [];

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterModelMode = () => {
    if (workspaceMode === 'sheet') {
      editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' });
    }
  };

  const handleSelectObject = (objectId) => {
    enterModelMode();
    editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
    editorDispatch({ type: 'SELECT_OBJECT', id: objectId, objectType: 'object' });
  };

  const handleSelectAssembly = (assemblyId) => {
    enterModelMode();
    editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId });
    editorDispatch({ type: 'SELECT_OBJECT', id: assemblyId, objectType: 'assembly' });
  };

  const handleSelectPart = (partId) => {
    enterModelMode();
    editorDispatch({ type: 'SELECT_OBJECT', id: partId, objectType: 'part' });
  };

  const handleSelectAnnotation = (annotationId) => {
    enterModelMode();
    editorDispatch({ type: 'SELECT_OBJECT', id: annotationId, objectType: 'annotation' });
  };

  const handleDeletePart = (partId) => {
    dispatch({ type: 'PART_DELETE', partId });
    if (selectedId === partId) editorDispatch({ type: 'DESELECT' });
  };

  const handleClonePart = (partId) => {
    dispatch({ type: 'PART_CLONE', partId });
  };

  const handleDeleteAnnotation = (annotationId) => {
    dispatch({ type: 'ANNOTATION_DELETE', annotationId });
    if (selectedId === annotationId) editorDispatch({ type: 'DESELECT' });
  };

  const handleToggleAnnotation = (annotation) => {
    if (!annotation) return;
    if (annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE) {
      dispatch({
        type: 'ANNOTATION_UPDATE',
        annotation: {
          id: annotation.id,
          enabled: !(annotation.enabled ?? true),
        },
      });
      return;
    }

    dispatch({
      type: 'ANNOTATION_UPDATE',
      annotation: {
        id: annotation.id,
        visible: annotation.visible === false,
      },
    });
  };

  const handleDeleteObject = (objectId) => {
    dispatch({ type: 'OBJECT_DELETE', objectId });
    const selectedAssembly = selectedType === 'assembly'
      ? project.assemblies.find((assembly) => assembly.id === selectedId)
      : null;
    const selectedPart = selectedType === 'part'
      ? project.parts.find((part) => part.id === selectedId)
      : null;
    if (
      selectedId === objectId
      || selectedAssembly?.objectId === objectId
      || selectedPart?.objectId === objectId
    ) {
      editorDispatch({ type: 'DESELECT' });
      editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
    }
  };

  const handleDetachObject = (objectId) => {
    dispatch({ type: 'OBJECT_DETACH', objectId });
    editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
    if (selectedId === objectId) {
      editorDispatch({ type: 'DESELECT' });
    }
  };

  const handleGenerateObjectSheet = (objectId) => {
    const sheet = generateObjectSheet(project, objectId);
    dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
    editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
  };

  const handleAddModuleToObject = (objectId) => {
    const object = objects.find((entry) => entry.id === objectId);
    if (!object) return;
    const existingCount = (project.assemblies || []).filter((assembly) => assembly.objectId === objectId).length;
    const assembly = createAssembly(`Module ${existingCount + 1}`, {
      objectId,
      category: object.category || 'general',
      description: `${object.name} module`,
      source: 'manual',
      sortIndex: existingCount,
    });
    dispatch({ type: 'ASSEMBLY_ADD', assembly });
    enterModelMode();
    editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: assembly.id });
  };

  const handleAddAssembly = () => {
    const assembly = createAssembly(`Assembly ${manualAssemblies.length + 1}`);
    dispatch({ type: 'ASSEMBLY_ADD', assembly });
    editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: assembly.id });
    editorDispatch({ type: 'SELECT_OBJECT', id: assembly.id, objectType: 'assembly' });
  };

  const handleDeleteAssembly = (assemblyId) => {
    dispatch({ type: 'ASSEMBLY_DELETE_WITH_PARTS', assemblyId });
    if (activeAssemblyId === assemblyId || selectedId === assemblyId) {
      editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
      editorDispatch({ type: 'DESELECT' });
    }
  };

  const handleCloneAssembly = (assemblyId) => {
    dispatch({ type: 'ASSEMBLY_CLONE', assemblyId });
  };

  const handleEditAssembly = (assemblyId) => {
    enterModelMode();
    editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId });
  };

  const handleGenerateAssemblySheet = (assemblyId) => {
    const sheet = generateAssemblySheet(project, assemblyId);
    dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
    editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
  };

  const handleAddSheet = () => {
    const sheet = createSheet(`Sheet ${sheets.length + 1}`, {
      number: `S${String(sheets.length + 1).padStart(2, '0')}`,
      drawingName: `Sheet ${sheets.length + 1}`,
    });
    dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
    editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
  };

  const renderGeneratedNode = (node, objectId, depth = 0) => {
    const object = objects.find((entry) => entry.id === objectId);
    if (!node) return null;
    if (node.kind === 'assembly') {
      const assembly = project.assemblies.find((entry) => entry.id === node.assemblyId);
      const isExpanded = expandedIds.has(node.id);
      const isSelected = selectedType === 'assembly' && selectedId === node.assemblyId;
      const childCount = (node.children || []).length;
      return (
        <div key={node.id}>
          <TreeItem depth={depth} isSelected={isSelected} onClick={() => handleSelectAssembly(node.assemblyId)}>
            <div className={styles.layerInfo}>
              <button className={styles.expandBtn} onClick={(event) => { event.stopPropagation(); toggleExpand(node.id); }} aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                <ChevronIcon expanded={isExpanded} />
              </button>
              <AssemblyIcon />
              <span className={styles.layerName}>{node.name}</span>
              <AssemblyBadges assembly={assembly} />
              {childCount > 0 && <span className={styles.shapeCount}>{childCount}</span>}
            </div>
            {object?.editingPolicy !== 'parametric' && (
              <div className={styles.layerActions}>
                <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleEditAssembly(node.assemblyId); }} aria-label="Edit Module" title="Edit Module">
                  <EditIcon />
                </button>
                <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleCloneAssembly(node.assemblyId); }} aria-label="Duplicate Module" title="Duplicate Module">
                  <CloneIcon />
                </button>
                <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleDeleteAssembly(node.assemblyId); }} aria-label="Delete Module" title="Delete Module">
                  <TrashIcon />
                </button>
              </div>
            )}
          </TreeItem>
          {isExpanded && node.children?.length > 0 && (
            <div className={styles.indent}>
              {node.children.map((child) => renderGeneratedNode(child, objectId, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const part = project.parts.find((entry) => entry.id === node.partId);
    if (!part) return null;
    return (
      <PartItem
        key={node.id}
        part={part}
        depth={depth}
        isSelected={selectedType === 'part' && selectedId === part.id}
        onSelect={handleSelectPart}
        onDelete={handleDeletePart}
        onClone={handleClonePart}
        allowActions={object?.editingPolicy !== 'parametric'}
      />
    );
  };

  const renderManualAssemblyParts = (assemblyId, depth = 1) => {
    const parts = allParts.filter((part) => part.assemblyId === assemblyId && !part.objectId);
    return parts.map((part) => (
      <PartItem
        key={part.id}
        part={part}
        depth={depth}
        isSelected={selectedType === 'part' && selectedId === part.id}
        onSelect={handleSelectPart}
        onDelete={handleDeletePart}
        onClone={handleClonePart}
      />
    ));
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionTitle}>Objects</span>
          <span className={styles.count}>{objects.length}</span>
          <button className={styles.addBtn} onClick={() => setShowTemplateDialog(true)} aria-label="Create Object" title="Create Object">
            <TemplateIcon />
          </button>
        </div>

        <div className={styles.layerList}>
          {objectTrees.map(({ object, tree }) => {
            const isExpanded = expandedIds.has(object.id);
            const isSelected = selectedType === 'object' && selectedId === object.id;
            return (
              <div key={object.id}>
                <TreeItem depth={0} isSelected={isSelected} onClick={() => handleSelectObject(object.id)}>
                  <div className={styles.layerInfo}>
                    <button className={styles.expandBtn} onClick={(event) => { event.stopPropagation(); toggleExpand(object.id); }} aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                      <ChevronIcon expanded={isExpanded} />
                    </button>
                    <ObjectIcon />
                    <span className={styles.layerName}>{object.name}</span>
                    <span className={styles.categoryBadge}>{object.templateType || object.category}</span>
                    <span className={styles.shapeCount}>{object.partIds.length}</span>
                  </div>
                  <div className={styles.layerActions}>
                    {object.editingPolicy !== 'parametric' && (
                      <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleAddModuleToObject(object.id); }} aria-label="Add Module" title="Add Module">
                        <PlusIcon />
                      </button>
                    )}
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleGenerateObjectSheet(object.id); }} aria-label="Generate Object Sheet" title="Generate Object Sheet">
                      <SheetIcon />
                    </button>
                    {object.editingPolicy === 'parametric' && (
                      <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleDetachObject(object.id); }} aria-label="Detach Object" title="Detach Object">
                        <CloneIcon />
                      </button>
                    )}
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleDeleteObject(object.id); }} aria-label="Delete Object" title="Delete Object">
                      <TrashIcon />
                    </button>
                  </div>
                </TreeItem>
                {isExpanded && tree?.children?.length > 0 && (
                  <div className={styles.indent}>
                    {tree.children.map((child) => renderGeneratedNode(child, object.id, 1))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionTitle}>Loose Modules</span>
          <span className={styles.count}>{manualAssemblies.length}</span>
          <button className={styles.addBtn} onClick={handleAddAssembly} aria-label="Add Module" title="Add Module">+</button>
        </div>

        <div className={styles.layerList}>
          {manualAssemblies.map((assembly) => {
            const isExpanded = expandedIds.has(assembly.id);
            const isSelected = selectedType === 'assembly' && selectedId === assembly.id;
            const partCount = allParts.filter((part) => part.assemblyId === assembly.id).length;
            return (
              <div key={assembly.id}>
                <TreeItem depth={0} isSelected={isSelected} onClick={() => handleSelectAssembly(assembly.id)}>
                  <div className={styles.layerInfo}>
                    <button className={styles.expandBtn} onClick={(event) => { event.stopPropagation(); toggleExpand(assembly.id); }} aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                      <ChevronIcon expanded={isExpanded} />
                    </button>
                    <AssemblyIcon />
                    <span className={styles.layerName}>{assembly.name}</span>
                    <AssemblyBadges assembly={assembly} />
                    {partCount > 0 && <span className={styles.shapeCount}>{partCount}</span>}
                  </div>
                  <div className={styles.layerActions}>
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleEditAssembly(assembly.id); }} aria-label="Edit Module" title="Edit Module">
                      <EditIcon />
                    </button>
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleGenerateAssemblySheet(assembly.id); }} aria-label="Generate Module Sheet" title="Generate Module Sheet">
                      <SheetIcon />
                    </button>
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleCloneAssembly(assembly.id); }} aria-label="Duplicate Module" title="Duplicate Module">
                      <CloneIcon />
                    </button>
                    <button className={styles.layerActionBtn} onClick={(event) => { event.stopPropagation(); handleDeleteAssembly(assembly.id); }} aria-label="Delete Module" title="Delete Module">
                      <TrashIcon />
                    </button>
                  </div>
                </TreeItem>
                {isExpanded && (
                  <div className={styles.indent}>
                    {renderManualAssemblyParts(assembly.id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionTitle}>Loose Parts</span>
          <span className={styles.count}>{manualParts.length}</span>
        </div>

        <div className={styles.layerList}>
          {manualParts.map((part) => (
            <PartItem
              key={part.id}
              part={part}
              depth={0}
              isSelected={selectedType === 'part' && selectedId === part.id}
              onSelect={handleSelectPart}
              onDelete={handleDeletePart}
              onClone={handleClonePart}
            />
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionTitle}>Construction</span>
          <span className={styles.count}>{constructionAnnotations.length}</span>
        </div>
        <div className={styles.sectionHint}>
          Guides, reference planes, and section planes stay in the editor and do not export as build geometry.
        </div>

        <div className={styles.layerList}>
          {constructionAnnotations.map((annotation) => {
            const active = annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
              ? annotation.enabled !== false
              : annotation.visible !== false;

            return (
              <TreeItem
                key={annotation.id}
                depth={0}
                isSelected={selectedType === 'annotation' && selectedId === annotation.id}
                onClick={() => handleSelectAnnotation(annotation.id)}
              >
                <div className={styles.layerInfo}>
                  <span className={styles.categoryBadge}>{annotation.type.replaceAll('_', ' ')}</span>
                  <span className={styles.layerName}>{annotation.label || 'Construction Aid'}</span>
                </div>
                <div className={styles.layerActions}>
                  <button
                    className={styles.layerActionBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleAnnotation(annotation);
                    }}
                    aria-label={active ? 'Disable construction aid' : 'Enable construction aid'}
                    title={active ? 'Disable construction aid' : 'Enable construction aid'}
                  >
                    {active ? 'On' : 'Off'}
                  </button>
                  <button
                    className={styles.layerActionBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteAnnotation(annotation.id);
                    }}
                    aria-label="Delete construction aid"
                    title="Delete construction aid"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </TreeItem>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionTitle}>Sheets</span>
          <span className={styles.count}>{sheets.length}</span>
          <button className={styles.addBtn} onClick={handleAddSheet} aria-label="Add Sheet" title="Add Sheet">+</button>
        </div>

        <div className={styles.layerList}>
          {sheets.map((sheet) => {
            const isSelected = workspaceMode === 'sheet' && activeSheetId === sheet.id;
            return (
              <TreeItem
                key={sheet.id}
                depth={0}
                isSelected={isSelected}
                onClick={() => {
                  editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
                  editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
                }}
              >
                <div className={styles.layerInfo}>
                  <SheetIcon />
                  <span className={styles.layerName}>{sheet.title || sheet.drawingName || 'Sheet'}</span>
                  {(sheet.viewports || []).length > 0 && <span className={styles.shapeCount}>{sheet.viewports.length}v</span>}
                </div>
                <div className={styles.layerActions}>
                  <button className={styles.layerActionBtn} onClick={(event) => {
                    event.stopPropagation();
                    dispatch({ type: 'SKETCH_SHEET_DELETE', sheetId: sheet.id });
                    if (activeSheetId === sheet.id) {
                      editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' });
                      editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: null });
                    }
                  }} aria-label="Delete Sheet" title="Delete Sheet">
                    <TrashIcon />
                  </button>
                </div>
              </TreeItem>
            );
          })}
        </div>
      </div>
    </div>
  );
}
