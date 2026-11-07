import { isHrHead, type LeaveViewer } from "./leave";

/**
 * Company holiday rules. Pure. Everyone signed in may read the calendar; only the HR head may change it
 * (Administrator role grants nothing, RULES 2.7). Holidays are informational: they do not alter leave
 * day counts because the counting rules (weekends, holidays) are not confirmed.
 */

export const MAX_HOLIDAY_NAME = 100;

export function canManageHolidays(u: LeaveViewer): boolean {
  return isHrHead(u);
}

export function validateHoliday(name: string, dateStr: string): string | null {
  const n = name.trim();
  if (!n) return "Give the holiday a name.";
  if (n.length > MAX_HOLIDAY_NAME) return `The name is too long (max ${MAX_HOLIDAY_NAME}).`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "Choose a date.";
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateStr) return "The date is not valid.";
  const year = Number(dateStr.slice(0, 4));
  if (year < 2000 || year > 2100) return "Choose a year between 2000 and 2100.";
  return null;
}

type H = { date: Date; name: string };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Holidays inside the inclusive range, in date order. */
export function holidaysInRange<T extends H>(holidays: T[], start: Date, end: Date): T[] {
  return holidays.filter((h) => day(h.date) >= day(start) && day(h.date) <= day(end)).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Holidays on or after `todayStr`, soonest first. */
export function upcomingHolidays<T extends H>(holidays: T[], todayStr: string, limit = 5): T[] {
  return holidays.filter((h) => day(h.date) >= todayStr).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, Math.max(0, limit));
}

/** Plain-language gap, e.g. "today", "tomorrow", "in 12 days". */
export function untilLabel(dateStr: string, todayStr: string): string {
  const n = Math.round((new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${todayStr}T00:00:00Z`).getTime()) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? "" : "s"} ago`;
}
