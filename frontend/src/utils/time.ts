import { format } from 'date-fns';

export type TimeFormat = '12h' | '24h';

/** Format a whole-hour number as a display string, e.g. 14 → "14:00" or "2:00 PM" */
export function formatHour(hour: number, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') return `${hour.toString().padStart(2, '0')}:00`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}

/** Format a Date or ISO string as a short time, e.g. "14:30" or "2:30 PM" */
export function formatTime(date: Date | string, timeFormat: TimeFormat): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
}

/** Format a Date or ISO string with date + time, e.g. "Mar 4, 2026 14:30" or "Mar 4, 2026 2:30 PM" */
export function formatDateTime(date: Date | string, timeFormat: TimeFormat): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, timeFormat === '24h' ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy h:mm a');
}
