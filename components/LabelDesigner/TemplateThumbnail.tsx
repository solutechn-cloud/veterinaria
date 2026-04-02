
import React, { useState, useEffect, memo } from 'react';
import { LabelTemplate } from '../../types';
import { renderToHTML } from '../../services/TemplateRenderer';

const MM_TO_PX = 3.7795;
const CM_TO_PX = 37.795;

// Fixed size of the gallery card preview area
const CONTAINER_W = 200;
const CONTAINER_H = 160;

interface TemplateThumbnailProps {
  template: LabelTemplate;
}

const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ template }) => {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Generate preview HTML with empty context (variables stay as {{placeholders}})
    renderToHTML(template, {})
      .then(h => { if (!cancelled) setHtml(h); })
      .catch(() => { if (!cancelled) setHtml(''); });
    return () => { cancelled = true; };
  }, [template.id]); // only regenerate when template ID changes

  const scaleFactor = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
  const pageW = template.width  * scaleFactor;
  const pageH = template.height * scaleFactor;
  const thumbScale = Math.min(CONTAINER_W / pageW, CONTAINER_H / pageH) * 0.92;

  // Loading state
  if (html === null) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-400 rounded-full animate-spin"/>
      </div>
    );
  }

  // Error / empty state — let parent render its default icon
  if (!html) return null;

  return (
    <div className="w-full h-full overflow-hidden flex items-center justify-center">
      <div
        style={{
          width: `${pageW * thumbScale}px`,
          height: `${pageH * thumbScale}px`,
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            transform: `scale(${thumbScale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
            width: `${pageW}px`,
            height: `${pageH}px`,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          <iframe
            srcDoc={html}
            style={{ width: `${pageW}px`, height: `${pageH}px`, border: 'none', display: 'block' }}
            title={`Vista previa: ${template.name}`}
            scrolling="no"
          />
        </div>
      </div>
    </div>
  );
};

export default memo(TemplateThumbnail);
