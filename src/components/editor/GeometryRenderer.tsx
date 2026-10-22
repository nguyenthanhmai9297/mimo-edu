import React from 'react';
import { GeometryDrawingData, GeometryPoint } from '../../types/domain';

interface GeometryRendererProps {
  drawing: GeometryDrawingData;
  className?: string;
}

export const GeometryRenderer: React.FC<GeometryRendererProps> = ({
  drawing,
  className = '',
}) => {
  const pointMap = new Map<string, GeometryPoint>();
  for (const pt of drawing.points || []) {
    pointMap.set(pt.id, pt);
  }

  const width = drawing.width || 360;
  const height = drawing.height || 240;

  return (
    <figure
      className={`my-3 inline-block max-w-full rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-[0_3px_0_0_#1E293B] ${className}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto max-h-64 w-full max-w-md select-none overflow-visible"
        role="img"
        aria-label={drawing.caption || 'Hình vẽ hình học'}
      >
        <defs>
          <pattern
            id="geom-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#geom-grid)" rx="12" />

        {/* Render Geometric Elements */}
        {(drawing.elements || []).map((el) => {
          const pts = el.pointIds
            .map((id) => pointMap.get(id))
            .filter((p): p is GeometryPoint => Boolean(p));
          const strokeColor = el.color || '#1E293B';
          const dashArray = el.dashed ? '6 4' : undefined;

          if (el.type === 'segment' && pts.length >= 2) {
            return (
              <line
                key={el.id}
                x1={pts[0].x}
                y1={pts[0].y}
                x2={pts[1].x}
                y2={pts[1].y}
                stroke={strokeColor}
                strokeWidth={2.5}
                strokeDasharray={dashArray}
                strokeLinecap="round"
              />
            );
          }

          if (el.type === 'ray' && pts.length >= 2) {
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const len = Math.hypot(dx, dy) || 1;
            const extX = pts[1].x + (dx / len) * 45;
            const extY = pts[1].y + (dy / len) * 45;
            return (
              <line
                key={el.id}
                x1={pts[0].x}
                y1={pts[0].y}
                x2={extX}
                y2={extY}
                stroke={strokeColor}
                strokeWidth={2.5}
                strokeDasharray={dashArray}
                strokeLinecap="round"
              />
            );
          }

          if (el.type === 'line' && pts.length >= 2) {
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const len = Math.hypot(dx, dy) || 1;
            const startX = pts[0].x - (dx / len) * 45;
            const startY = pts[0].y - (dy / len) * 45;
            const endX = pts[1].x + (dx / len) * 45;
            const endY = pts[1].y + (dy / len) * 45;
            return (
              <line
                key={el.id}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={strokeColor}
                strokeWidth={2.5}
                strokeDasharray={dashArray}
                strokeLinecap="round"
              />
            );
          }

          if (
            (el.type === 'triangle' && pts.length >= 3) ||
            (el.type === 'quadrilateral' && pts.length >= 4)
          ) {
            const polyPoints = pts.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <polygon
                key={el.id}
                points={polyPoints}
                fill="rgba(37, 99, 235, 0.08)"
                stroke={strokeColor}
                strokeWidth={2.5}
                strokeDasharray={dashArray}
                strokeLinejoin="round"
              />
            );
          }

          if (el.type === 'circle' && pts.length >= 2) {
            const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            return (
              <circle
                key={el.id}
                cx={pts[0].x}
                cy={pts[0].y}
                r={r}
                fill="rgba(249, 115, 22, 0.07)"
                stroke={strokeColor}
                strokeWidth={2.5}
                strokeDasharray={dashArray}
              />
            );
          }

          if (el.type === 'angle' && pts.length >= 3) {
            // Vertex is pts[1], rays toward pts[0] and pts[2]
            const v = pts[1];
            const p1 = pts[0];
            const p2 = pts[2];
            const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
            const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
            const radius = 22;
            const x1 = v.x + radius * Math.cos(a1);
            const y1 = v.y + radius * Math.sin(a1);
            const x2 = v.x + radius * Math.cos(a2);
            const y2 = v.y + radius * Math.sin(a2);
            const midAngle = (a1 + a2) / 2;
            const labelX = v.x + (radius + 14) * Math.cos(midAngle);
            const labelY = v.y + (radius + 14) * Math.sin(midAngle);

            return (
              <g key={el.id}>
                <path
                  d={`M ${v.x} ${v.y} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                  fill="rgba(234, 179, 8, 0.28)"
                  stroke="#D97706"
                  strokeWidth={1.8}
                />
                {el.angleValue && (
                  <text
                    x={labelX}
                    y={labelY}
                    fontSize="11"
                    fontWeight="700"
                    fill="#B45309"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {el.angleValue}
                  </text>
                )}
              </g>
            );
          }

          return null;
        })}

        {/* Render Labeled Points */}
        {(drawing.points || []).map((pt) => (
          <g key={pt.id}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={4.5}
              fill="#FFFFFF"
              stroke="#0F172A"
              strokeWidth={2.5}
            />
            <text
              x={pt.x + 10}
              y={pt.y - 8}
              fontSize="14"
              fontWeight="800"
              fill="#0F172A"
              className="font-display"
            >
              {pt.label}
            </text>
          </g>
        ))}
      </svg>
      {drawing.caption && (
        <figcaption className="mt-1.5 text-center text-xs font-medium text-slate-600">
          {drawing.caption}
        </figcaption>
      )}
    </figure>
  );
};
