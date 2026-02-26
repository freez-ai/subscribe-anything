/**
 * Returns a human-readable relative time string (e.g. "3 分钟前", "2 小时前").
 * Works with ISO date strings or Date objects.
 */
export function formatDistanceToNow(date: string | Date | null | undefined): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 0) return '刚刚';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}
