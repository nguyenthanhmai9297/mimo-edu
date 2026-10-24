import React from 'react';
import katex from 'katex';
import { Image as ImageIcon } from 'lucide-react';
import { RichTextContent } from '../../types/domain';
import { parseInlineSegments } from '../../utils/inlineMarks';
import { GeometryRenderer } from './GeometryRenderer';

interface RichContentRendererProps {
  content?: RichTextContent | null;
  className?: string;
  /** Let paragraphs and lists take the font size of `className` (e.g. large projector text). */
  inheritSize?: boolean;
}

/**
 * Renders text that may contain inline $...$ LaTeX (via KaTeX) and **bold** / *italic* marks.
 */
function renderInlineTextWithMath(text: string): React.ReactNode[] {
  if (!text) return [];
  return parseInlineSegments(text).map((seg, idx) => {
    if (seg.kind === 'text') {
      if (seg.bold && seg.italic) return <strong key={idx}><em>{seg.text}</em></strong>;
      if (seg.bold) return <strong key={idx}>{seg.text}</strong>;
      if (seg.italic) return <em key={idx}>{seg.text}</em>;
      return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
    }
    try {
      const html = katex.renderToString(seg.latex, {
        throwOnError: false,
        displayMode: false,
      });
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block align-middle"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      return (
        <code
          key={idx}
          className="rounded bg-amber-100 px-1 font-mono text-xs text-slate-900"
        >
          {seg.latex}
        </code>
      );
    }
  });
}

export const RichContentRenderer: React.FC<RichContentRendererProps> = ({
  content,
  className = '',
  inheritSize = false,
}) => {
  if (!content || !Array.isArray(content.blocks) || content.blocks.length === 0) {
    return (
      <span className="text-sm italic text-slate-400">Chưa có nội dung</span>
    );
  }

  return (
    <div className={`space-y-2.5 text-slate-900 leading-relaxed ${className}`}>
      {content.blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          const alignClass =
            block.align === 'center'
              ? 'text-center'
              : block.align === 'right'
              ? 'text-right'
              : 'text-left';
          const fontStyle = `${block.bold ? 'font-bold' : ''} ${
            block.italic ? 'italic' : ''
          }`;

          return (
            <p
              key={index}
              className={`${inheritSize ? '' : 'text-[15px]'} break-words ${alignClass} ${fontStyle}`}
            >
              {renderInlineTextWithMath(block.text)}
            </p>
          );
        }

        if (block.type === 'math') {
          try {
            const html = katex.renderToString(block.latex || '', {
              throwOnError: false,
              displayMode: !block.inline,
            });
            return (
              <div
                key={index}
                className={
                  block.inline
                    ? 'inline-block px-1'
                    : 'my-2 overflow-x-auto rounded-xl bg-slate-50/80 px-3 py-2 text-center'
                }
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <pre
                key={index}
                className="rounded-xl bg-amber-50 p-2 font-mono text-xs text-slate-800"
              >
                {block.latex}
              </pre>
            );
          }
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={index}
              className={`ml-5 space-y-1 ${inheritSize ? '' : 'text-[15px]'} ${
                block.ordered ? 'list-decimal' : 'list-disc'
              }`}
            >
              {(block.items || []).map((item, i) => (
                <li key={i}>{renderInlineTextWithMath(item)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'image') {
          return (
            <figure
              key={index}
              className="my-3 inline-block max-w-full overflow-hidden rounded-2xl border-2 border-slate-800 bg-white p-2"
            >
              {block.url ? (
                <img
                  src={block.url}
                  alt={block.alt || 'Hình minh họa Toán học'}
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-auto max-w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              {block.caption && (
                <figcaption className="mt-1.5 text-center text-xs text-slate-600">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }

        if (block.type === 'geometry') {
          return <GeometryRenderer key={index} drawing={block.drawing} />;
        }

        if (block.type === 'table') {
          return (
            <div key={index} className="my-2 max-w-full overflow-x-auto">
              <table className={`border-collapse ${inheritSize ? '' : 'text-[15px]'}`}>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.cells.map((cell, c) => {
                        const Cell = block.header && r === 0 ? 'th' : 'td';
                        return (
                          <Cell
                            key={c}
                            className={`border border-slate-400 px-3 py-1.5 text-center ${
                              Cell === 'th' ? 'bg-slate-100 font-bold' : ''
                            }`}
                          >
                            {renderInlineTextWithMath(cell)}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
