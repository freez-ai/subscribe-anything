'use client';

import { useEffect, useState } from 'react';

export function useSafeArea() {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    const update = () => {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue('--sat-bottom')
        .trim();
      setBottom(parseInt(val) || 0);
    };

    // Expose CSS env() value via a CSS variable trick
    const style = document.createElement('style');
    style.textContent = ':root { --sat-bottom: env(safe-area-inset-bottom); }';
    document.head.appendChild(style);
    update();

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.head.removeChild(style);
    };
  }, []);

  return { bottom };
}
