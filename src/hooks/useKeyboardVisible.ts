'use client';

import { useEffect, useState } from 'react';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;
    const handler = () => {
      // If visual viewport height is significantly smaller than window height,
      // the software keyboard is likely open
      const threshold = window.innerHeight * 0.75;
      setVisible(vv.height < threshold);
    };

    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  return visible;
}
