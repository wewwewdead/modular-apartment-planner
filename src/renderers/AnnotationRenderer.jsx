import { buildAnnotationScene } from '@/annotations/scene';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

export default function AnnotationRenderer({ floor }) {
  const scene = buildAnnotationScene(floor);

  return <BlueprintAnnotationLayer dimensions={scene.dimensions} tags={scene.tags} />;
}
