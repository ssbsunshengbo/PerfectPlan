export const CALENDAR_GRID_START_MINUTES = 6 * 60;
export const CALENDAR_LAST_START_MINUTES = 23 * 60 + 30;
export const CALENDAR_MIN_DURATION_MINUTES = 30;
export const CALENDAR_SNAP_MINUTES = 15;

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function toTimeValue(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function toCalendarStartAt(localDate: string, totalMinutes: number): string {
  const date = parseLocalDate(localDate);
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date.toISOString();
}

export function minutesFromCalendarStartAt(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

export function snapCalendarStart(totalMinutes: number): number {
  const snapped = Math.round(totalMinutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
  return Math.min(CALENDAR_LAST_START_MINUTES, Math.max(CALENDAR_GRID_START_MINUTES, snapped));
}

export function snapCalendarDuration(startMinutes: number, durationMinutes: number): number {
  const maximum = 24 * 60 - startMinutes;
  const snapped = Math.round(durationMinutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
  return Math.min(maximum, Math.max(CALENDAR_MIN_DURATION_MINUTES, snapped));
}

export function getCalendarTimeOptions(): Array<{ label: string; value: number }> {
  const count = (CALENDAR_LAST_START_MINUTES - CALENDAR_GRID_START_MINUTES) / CALENDAR_SNAP_MINUTES;
  return Array.from({ length: count + 1 }, (_, index) => {
    const value = CALENDAR_GRID_START_MINUTES + index * CALENDAR_SNAP_MINUTES;
    return { label: toTimeValue(value), value };
  });
}
