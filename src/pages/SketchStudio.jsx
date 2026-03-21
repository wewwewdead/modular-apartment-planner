import SketchStudioLayout from '@/features/sketchstudio/components/SketchStudioLayout';
import useSketchStudio from '@/features/sketchstudio/hooks/useSketchStudio';
import '@/features/sketchstudio/styles/sketchstudio.css';

export default function SketchStudio() {
  const sketchStudio = useSketchStudio();

  return <SketchStudioLayout {...sketchStudio} />;
}
