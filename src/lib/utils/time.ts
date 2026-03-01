/**
 * Returns a human-readable relative time string (e.g. "3 分钟前", "2 小时后").
 * Works with ISO date strings or Date objects.
 * Supports both past and future dates.
 */
export function formatDistanceToNow(date: string | Date | null | undefined): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  const abs = Math.abs(ms);
  const suffix = ms >= 0 ? '前' : '后';
  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return ms >= 0 ? '刚刚' : '即将';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天${suffix}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月${suffix}`;
  return `${Math.floor(months / 12)} 年${suffix}`;
}
