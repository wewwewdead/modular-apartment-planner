import SketchStudioLayout from '@/features/sketchstudio/components/SketchStudioLayout';
import useSketchStudio from '@/features/sketchstudio/hooks/useSketchStudio';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import '@/features/sketchstudio/styles/sketchstudio.css';

export default function SketchStudio() {
  const sketchStudio = useSketchStudio();

  return (
    <ConfirmDialogProvider>
      <SketchStudioLayout {...sketchStudio} />
    </ConfirmDialogProvider>
  );
}
