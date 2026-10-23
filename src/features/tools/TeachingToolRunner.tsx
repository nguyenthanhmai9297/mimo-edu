import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CountdownTool } from './CountdownTool';
import { RandomPickerTool } from './RandomPickerTool';
import { findTool } from './toolCatalog';
import { ToolStage } from './ToolStage';

const TOOL_COMPONENTS: Record<string, React.FC<{ presenting: boolean }>> = {
  'goi-ten': RandomPickerTool,
  'dong-ho': CountdownTool,
};

/** /admin/tools/:toolId – opens a built-in tool; anything else goes back to the catalogue. */
export const TeachingToolRunner: React.FC = () => {
  const { toolId } = useParams();
  const tool = findTool(toolId);
  const Component = toolId ? TOOL_COMPONENTS[toolId] : undefined;
  if (!tool || tool.status !== 'ready' || !Component) return <Navigate to="/admin/tools" replace />;
  return <ToolStage tool={tool}>{(presenting) => <Component presenting={presenting} />}</ToolStage>;
};
