import SketchStudioLayout from '@/features/sketchstudio/components/SketchStudioLayout';
import useSketchStudio from '@/features/sketchstudio/hooks/useSketchStudio';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import '@/features/sketchstudio/styles/sketchstudio.css';

function SketchStudioContent() {
  const sketchStudio = useSketchStudio();

  return <SketchStudioLayout {...sketchStudio} />;
}

export default function SketchStudio() {
  return (
    <ConfirmDialogProvider>
      <SketchStudioContent />
    </ConfirmDialogProvider>
  );
}
