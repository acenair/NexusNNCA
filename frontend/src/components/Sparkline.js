import React from 'react';

/** Tiny SVG trend line for KPI cards. <Sparkline data={[1,2,3]} color="#0e6db4" /> */
const Sparkline = ({ data = [], color = '#0e6db4', width = 92, height = 30 }) => {
  if (!data.length || data.every(v => v === 0)) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)]);
  const line = pts.map(p => p.map(n => Math.round(n * 10) / 10).join(',')).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const gid = `sg-${color.replace('#', '')}-${Math.round(max)}`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
};

export default Sparkline;
