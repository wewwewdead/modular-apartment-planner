function baseLayer(layer) {
  return {
    visible: true,
    locked: false,
    ...layer,
  };
}

function baseEntity(entity) {
  return {
    layerId: 'default',
    locked: false,
    visible: true,
    meta: {},
    ...entity,
  };
}

const sampleDocument = {
  version: 1,
  id: 'doc-1',
  name: 'Untitled Sketch',
  units: 'mm',
  metadata: {
    authoringApp: 'SketchStudio',
  },
  objectDefinition: {
    category: null,
    origin: { x: 0, y: 0 },
    tags: [],
  },
  constraints: [],
  layers: [
    baseLayer({
      id: 'default',
      name: 'Default',
    }),
    baseLayer({
      id: 'dimensions',
      name: 'Dimensions',
    }),
    baseLayer({
      id: 'furniture',
      name: 'Furniture',
    }),
  ],
  entities: [],
};

export default sampleDocument;
