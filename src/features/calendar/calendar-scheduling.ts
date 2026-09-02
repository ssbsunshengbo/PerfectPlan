export const CALENDAR_GRID_START_MINUTES = 6 * 60;
export const CALENDAR_LAST_START_MINUTES = 23 * 60 + 30;
export const CALENDAR_MIN_DURATION_MINUTES = 30;
export const CALENDAR_SNAP_MINUTES = 15;
export const CALENDAR_OVERLOAD_MINUTES = 8 * 60;

export type CalendarTaskTimeInput = {
  estimatedMinutes: number | null;
  id: string;
  scheduledDate: string | null;
  scheduledStartAt: string | null;
};

export type CalendarTaskLayout = {
  columnCount: number;
  columnIndex: number;
  id: string;
};

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

export function getCalendarDayLoadMinutes(
  tasks: CalendarTaskTimeInput[],
  localDate: string,
): number {
  return tasks
    .filter((task) => task.scheduledDate === localDate)
    .reduce((total, task) => total + (task.estimatedMinutes ?? CALENDAR_MIN_DURATION_MINUTES), 0);
}

export function hasCalendarTimezoneMismatch(task: CalendarTaskTimeInput): boolean {
  if (!task.scheduledDate || !task.scheduledStartAt) return false;
  const start = new Date(task.scheduledStartAt);
  if (Number.isNaN(start.getTime())) return true;
  const localDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate(),
  ).padStart(2, "0")}`;
  return localDate !== task.scheduledDate;
}

export function isCalendarTimeOutsideGrid(task: CalendarTaskTimeInput): boolean {
  const startMinutes = minutesFromCalendarStartAt(task.scheduledStartAt);
  if (startMinutes === null) return false;
  const duration = task.estimatedMinutes ?? CALENDAR_MIN_DURATION_MINUTES;
  return startMinutes < CALENDAR_GRID_START_MINUTES || startMinutes + duration > 24 * 60;
}

function getTaskRange(task: CalendarTaskTimeInput): { end: number; start: number } | null {
  const start = minutesFromCalendarStartAt(task.scheduledStartAt);
  if (start === null) return null;
  return { end: start + (task.estimatedMinutes ?? CALENDAR_MIN_DURATION_MINUTES), start };
}

export function getCalendarTaskLayouts(tasks: CalendarTaskTimeInput[]): CalendarTaskLayout[] {
  const timedTasks = tasks
    .map((task) => ({ range: getTaskRange(task), task }))
    .filter(
      (entry): entry is { range: { end: number; start: number }; task: CalendarTaskTimeInput } =>
        entry.range !== null,
    )
    .sort(
      (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
    );
  const layouts: CalendarTaskLayout[] = [];
  let active: Array<{ end: number; layout: CalendarTaskLayout }> = [];
  let cluster: CalendarTaskLayout[] = [];
  let clusterColumnCount = 0;

  function finalizeCluster() {
    cluster.forEach((layout) => {
      layout.columnCount = Math.max(clusterColumnCount, 1);
    });
    cluster = [];
    clusterColumnCount = 0;
  }

  timedTasks.forEach(({ range, task }) => {
    active = active.filter((entry) => entry.end > range.start);
    if (active.length === 0 && cluster.length > 0) finalizeCluster();

    const usedColumns = new Set(active.map((entry) => entry.layout.columnIndex));
    let columnIndex = 0;
    while (usedColumns.has(columnIndex)) columnIndex += 1;
    const layout = { columnCount: 1, columnIndex, id: task.id };
    active.push({ end: range.end, layout });
    cluster.push(layout);
    clusterColumnCount = Math.max(clusterColumnCount, active.length);
    layouts.push(layout);
  });
  if (cluster.length > 0) finalizeCluster();

  return layouts;
}

export function getCalendarConflictTaskIds(tasks: CalendarTaskTimeInput[]): Set<string> {
  return new Set(
    getCalendarTaskLayouts(tasks)
      .filter((layout) => layout.columnCount > 1)
      .map((layout) => layout.id),
  );
}
