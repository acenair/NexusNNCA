import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedNumber — counts up from the previous value to the new one.
 * <AnimatedNumber value={1234.5} format={(n) => 'AED ' + Math.round(n).toLocaleString()} />
 * Falls back to the plain formatted value if the browser reduces motion.
 */
const AnimatedNumber = ({ value = 0, format = (n) => String(n), duration = 450 }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = Number(prevRef.current) || 0;
    const to = Number(value) || 0;
    prevRef.current = to;
    if (from === to) { setDisplay(to); return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to); return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{format(display)}</>;
};

export default AnimatedNumber;
