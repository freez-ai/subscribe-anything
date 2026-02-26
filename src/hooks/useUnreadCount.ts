'use client';

import { useEffect, useState, useCallback } from 'react';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/message-cards/unread-count');
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
      }
    } catch {
      // ignore network errors silently
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const timer = setInterval(fetchCount, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchCount]);

  return { count, refresh: fetchCount };
}
