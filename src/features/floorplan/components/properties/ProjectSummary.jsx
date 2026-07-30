import { memo } from 'react';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';
import { AnnotationSettingsProperties } from './DimensionProperties';

function ProjectSummary({ project, floor, dispatch }) {
  return (
    <div>
      <div className={styles.title}>Project Summary</div>
      <InputField
        label="Name"
        value={project.name}
        onChange={(value) => dispatch({ type: 'PROJECT_SET_NAME', name: value })}
      />
      <InputField
        label="Address"
        value={project.address || ''}
        onChange={(value) => dispatch({ type: 'PROJECT_UPDATE', updates: { address: value } })}
      />
      <InputField
        label="Drawn By"
        value={project.documentDefaults?.drawnBy || ''}
        onChange={(value) =>
          dispatch({
            type: 'PROJECT_UPDATE',
            updates: {
              documentDefaults: {
                ...(project.documentDefaults || {}),
                drawnBy: value,
              },
            },
          })
        }
      />
      <InputField
        label="Checked"
        value={project.documentDefaults?.checkedBy || ''}
        onChange={(value) =>
          dispatch({
            type: 'PROJECT_UPDATE',
            updates: {
              documentDefaults: {
                ...(project.documentDefaults || {}),
                checkedBy: value,
              },
            },
          })
        }
      />
      <div className={styles.summary}>
        <p>Name: {project.name}</p>
        <p>Floors: {project.floors.length}</p>
        <p>Truss Systems: {(project.trussSystems || []).length}</p>
        <p>Sheets: {(project.sheets || []).length}</p>
        {floor && (
          <>
            <p>Slabs: {(floor.slabs || []).length}</p>
            <p>Walls: {floor.walls.length}</p>
            <p>Annotations: {(floor.annotations || []).length}</p>
            <p>Beams: {(floor.beams || []).length}</p>
            <p>Stairs: {(floor.stairs || []).length}</p>
            <p>Section Cuts: {(floor.sectionCuts || []).length}</p>
            <p>Doors: {floor.doors.length}</p>
            <p>Windows: {floor.windows.length}</p>
            <p>Columns: {(floor.columns || []).length}</p>
          </>
        )}
      </div>
      {floor && <AnnotationSettingsProperties floor={floor} dispatch={dispatch} />}
    </div>
  );
}

export default memo(ProjectSummary);
