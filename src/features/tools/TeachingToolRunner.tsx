import React, { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CountdownTool } from './CountdownTool';
import { MimoQuizTool } from './MimoQuizTool';
import { RandomPickerTool } from './RandomPickerTool';
import { TugOfWarTool } from './TugOfWarTool';
import { findTool } from './toolCatalog';
import { ToolStage } from './ToolStage';

// The mind map pulls in a diagram library, so it is only downloaded when opened
const MindMapTool = lazy(() => import('./MindMapTool').then((m) => ({ default: m.MindMapTool })));

const TOOL_COMPONENTS: Record<string, React.FC<{ presenting: boolean }>> = {
  'goi-ten': RandomPickerTool,
  'dong-ho': CountdownTool,
  'keo-co': TugOfWarTool,
  'so-do-tu-duy': MindMapTool,
  'mimo-quiz': MimoQuizTool,
};

/** /admin/tools/:toolId – opens a built-in tool; anything else goes back to the catalogue. */
export const TeachingToolRunner: React.FC = () => {
  const { toolId } = useParams();
  const tool = findTool(toolId);
  const Component = toolId ? TOOL_COMPONENTS[toolId] : undefined;
  if (!tool || tool.status !== 'ready' || !Component) return <Navigate to="/admin/tools" replace />;
  return (
    <ToolStage tool={tool}>
      {(presenting) => (
        <Suspense fallback={<p className="py-10 text-center text-sm text-[#5E6C84]">Đang mở công cụ…</p>}>
          <Component presenting={presenting} />
        </Suspense>
      )}
    </ToolStage>
  );
};
