import { createRoom } from '@/domain/models';
import { findRoomFaceAtPoint, roomPolygonKey } from '@/geometry/roomDetection';

function findExistingRoomForFace(rooms, face) {
  if (!face) return null;
  return rooms.find(room => roomPolygonKey(room.points) === face.key) || null;
}

export function createRoomPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const face = findRoomFaceAtPoint(floor.walls, floor.columns || [], modelPos);
      if (!face) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'No enclosed room found here.' });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { previewPoints: null } });
        return;
      }

      const existingRoom = findExistingRoomForFace(floor.rooms, face);
      if (existingRoom) {
        editorDispatch({ type: 'SELECT_OBJECT', id: existingRoom.id, objectType: 'room' });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'A room already exists in this space.' });
        return;
      }

      const room = createRoom(`Room ${floor.rooms.length + 1}`, face.points);
      dispatch({ type: 'ROOM_ADD', floorId: activeFloorId, room });
      editorDispatch({ type: 'SELECT_OBJECT', id: room.id, objectType: 'room' });
      editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { previewPoints: face.points } });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: `Created ${room.name}.` });
    },

    onMouseMove(modelPos) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const face = findRoomFaceAtPoint(floor.walls, floor.columns || [], modelPos);
      const previewPoints = face && !findExistingRoomForFace(floor.rooms, face)
        ? face.points
        : null;

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { previewPoints },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { previewPoints: null },
      });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
