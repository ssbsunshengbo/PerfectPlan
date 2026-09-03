import { describe, expect, it } from "vitest";

import {
  CALENDAR_LAST_START_MINUTES,
  getCalendarConflictTaskIds,
  getCalendarDayLoadMinutes,
  getCalendarTaskLayouts,
  getCalendarTimeOptions,
  hasCalendarTimezoneMismatch,
  isCalendarTimeOutsideGrid,
  minutesFromCalendarStartAt,
  snapCalendarDuration,
  snapCalendarStart,
  toCalendarStartAt,
  toTimeValue,
} from "./calendar-scheduling";

describe("calendar scheduling", () => {
  it("snaps time-grid drops to 30-minute increments and keeps them within one day", () => {
    expect(snapCalendarStart(6 * 60 + 8)).toBe(6 * 60);
    expect(snapCalendarStart(23 * 60 + 45)).toBe(CALENDAR_LAST_START_MINUTES);
    expect(snapCalendarStart(2 * 60)).toBe(6 * 60);
  });

  it("keeps resized blocks at least 30 minutes and never across midnight", () => {
    expect(snapCalendarDuration(9 * 60, 19)).toBe(30);
    expect(snapCalendarDuration(23 * 60 + 30, 90)).toBe(30);
    expect(snapCalendarDuration(20 * 60, 47)).toBe(60);
  });

  it("creates and reads a local calendar start time", () => {
    const startAt = toCalendarStartAt("2026-09-02", 9 * 60 + 30);

    expect(minutesFromCalendarStartAt(startAt)).toBe(9 * 60 + 30);
    expect(toTimeValue(9 * 60 + 30)).toBe("09:30");
  });

  it("offers the final valid start time at 23:30", () => {
    const options = getCalendarTimeOptions();

    expect(options[0]).toEqual({ label: "06:00", value: 360 });
    expect(options[options.length - 1]).toEqual({
      label: "23:30",
      value: CALENDAR_LAST_START_MINUTES,
    });
  });

  it("counts all planned work for the day, including all-day tasks", () => {
    expect(
      getCalendarDayLoadMinutes(
        [
          { estimatedMinutes: 90, id: "timed", scheduledDate: "2026-09-02", scheduledStartAt: "x" },
          {
            estimatedMinutes: null,
            id: "all-day",
            scheduledDate: "2026-09-02",
            scheduledStartAt: null,
          },
          {
            estimatedMinutes: 120,
            id: "other-day",
            scheduledDate: "2026-09-03",
            scheduledStartAt: null,
          },
        ],
        "2026-09-02",
      ),
    ).toBe(120);
  });

  it("marks overlapping blocks and lays them out side by side", () => {
    const tasks = [
      {
        estimatedMinutes: 60,
        id: "first",
        scheduledDate: "2026-09-02",
        scheduledStartAt: toCalendarStartAt("2026-09-02", 9 * 60),
      },
      {
        estimatedMinutes: 60,
        id: "second",
        scheduledDate: "2026-09-02",
        scheduledStartAt: toCalendarStartAt("2026-09-02", 9 * 60 + 30),
      },
      {
        estimatedMinutes: 30,
        id: "third",
        scheduledDate: "2026-09-02",
        scheduledStartAt: toCalendarStartAt("2026-09-02", 11 * 60),
      },
    ];

    expect(getCalendarConflictTaskIds(tasks)).toEqual(new Set(["first", "second"]));
    expect(getCalendarTaskLayouts(tasks)).toEqual([
      { columnCount: 2, columnIndex: 0, id: "first" },
      { columnCount: 2, columnIndex: 1, id: "second" },
      { columnCount: 1, columnIndex: 0, id: "third" },
    ]);
  });

  it("identifies timezone-mismatched and out-of-grid legacy time blocks", () => {
    const mismatched = {
      estimatedMinutes: 30,
      id: "mismatch",
      scheduledDate: "1999-01-01",
      scheduledStartAt: toCalendarStartAt("2026-09-02", 9 * 60),
    };

    expect(hasCalendarTimezoneMismatch(mismatched)).toBe(true);
    expect(
      isCalendarTimeOutsideGrid({
        ...mismatched,
        estimatedMinutes: 60,
        scheduledDate: "2026-09-02",
        scheduledStartAt: toCalendarStartAt("2026-09-02", 23 * 60 + 30),
      }),
    ).toBe(true);
  });
});
