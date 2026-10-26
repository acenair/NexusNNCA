import React from 'react';

const PALETTE = ['#01457C', '#0e6db4', '#0e7ec4', '#2e93d9', '#168ed2', '#77cfc4'];

/** Deterministic initials avatar from a name. <Avatar name="Falcon Trading LLC" size={30} /> */
const Avatar = ({ name = '', size = 28, style }) => {
  const clean = String(name).replace(/\(Demo\)/i, '').trim();
  const hash = [...clean].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const bg = PALETTE[hash % PALETTE.length];
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] || '') + (words[1]?.[0] || words[0]?.[1] || '')).toUpperCase() || '?';
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(9, size * 0.36), fontWeight: 700, flexShrink: 0, letterSpacing: 0.3, ...style,
    }}>{initials}</span>
  );
};

export default Avatar;
