import { CronExpressionParser } from 'cron-parser';

export interface CronPreset {
  label: string;
  value: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { label: '每 1 分钟', value: '* * * * *' },
  { label: '每 5 分钟', value: '*/5 * * * *' },
  { label: '每 10 分钟', value: '*/10 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每 1 小时', value: '0 * * * *' },
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每 12 小时', value: '0 */12 * * *' },
  { label: '每天 08:00', value: '0 8 * * *' },
  { label: '每天 20:00', value: '0 20 * * *' },
  { label: '每周一 08:00', value: '0 8 * * 1' },
];

/** Returns true if the cron expression is valid. */
export function validateCron(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

/** Returns the next scheduled Date for the expression, or null if invalid. */
export function nextCronDate(expression: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(expression);
    return interval.next().toDate();
  } catch {
    return null;
  }
}
