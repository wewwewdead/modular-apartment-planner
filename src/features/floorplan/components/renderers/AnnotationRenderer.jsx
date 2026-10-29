import { memo } from 'react';
import { buildAnnotationScene } from '@/annotations/scene';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

function AnnotationRenderer({ floor, settingsOverrides = null }) {
  const scene = buildAnnotationScene(floor, settingsOverrides);

  return <BlueprintAnnotationLayer dimensions={scene.dimensions} tags={scene.tags} />;
}

export default memo(AnnotationRenderer);
