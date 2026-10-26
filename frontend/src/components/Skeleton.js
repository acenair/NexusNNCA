import React from 'react';

/** Pulsing skeleton blocks. <Skeleton kpi={6} /> or <Skeleton rows={5} cols={4} /> */
const Bar = ({ w, h = 12, style }) => (
  <div className="af-skel" style={{ width: w, height: h, borderRadius: 6, ...style }} />
);

const Skeleton = ({ kpi = 0, rows = 0, cols = 1, cards = 0 }) => (
  <div aria-busy="true">
    {kpi > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpi}, 1fr)`, gap: 14, marginBottom: 16 }}>
        {Array.from({ length: kpi }, (_, i) => (
          <div className="af-card" key={i}>
            <Bar w="60%" h={10} />
            <Bar w="55%" h={24} style={{ margin: '12px 0 8px' }} />
            <Bar w="80%" h={9} />
          </div>
        ))}
      </div>
    )}
    {cards > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards}, 1fr)`, gap: 14, marginBottom: 16 }}>
        {Array.from({ length: cards }, (_, i) => (
          <div className="af-card" key={i}><Bar w="45%" h={12} /><Bar w="90%" h={9} style={{ marginTop: 10 }} /><Bar w="70%" h={9} style={{ marginTop: 6 }} /></div>
        ))}
      </div>
    )}
    {rows > 0 && (
      <div className="af-card">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, padding: '13px 4px', borderBottom: '1px solid var(--line)' }}>
            {Array.from({ length: cols }, (_, c) => (
              <Bar key={c} w={`${55 + ((r * 7 + c * 13) % 35)}%`} h={10} />
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default Skeleton;
