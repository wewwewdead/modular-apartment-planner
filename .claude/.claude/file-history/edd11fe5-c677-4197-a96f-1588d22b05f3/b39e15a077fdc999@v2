import { useMemo } from 'react';
import FloorplanWorkspace from '@floorplan';
import { deserializeProject } from '@/persistence/deserialize';
import demoData from './playground-demo.json';

export default function PlaygroundPage() {
  const demoProject = useMemo(() => {
    const { project } = deserializeProject(demoData);
    return project;
  }, []);

  return (
    <FloorplanWorkspace initialProject={demoProject} isPlayground={true} />
  );
}
