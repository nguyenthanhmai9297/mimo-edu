import React, { useMemo } from 'react';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { richTextFromAIText } from '../../utils/richText';

/** Renders practice text: $...$ formulas and line breaks. */
export const PracticeText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const content = useMemo(() => richTextFromAIText(text), [text]);
  return <RichContentRenderer content={content} className={className} />;
};
