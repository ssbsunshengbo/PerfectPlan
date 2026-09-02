import { describe, expect, it } from "vitest";

import {
  CALENDAR_LAST_START_MINUTES,
  getCalendarTimeOptions,
  minutesFromCalendarStartAt,
  snapCalendarDuration,
  snapCalendarStart,
  toCalendarStartAt,
  toTimeValue,
} from "./calendar-scheduling";

describe("calendar scheduling", () => {
  it("snaps time-grid drops to 15-minute increments and keeps them within one day", () => {
    expect(snapCalendarStart(6 * 60 + 8)).toBe(6 * 60 + 15);
    expect(snapCalendarStart(23 * 60 + 45)).toBe(CALENDAR_LAST_START_MINUTES);
    expect(snapCalendarStart(2 * 60)).toBe(6 * 60);
  });

  it("keeps resized blocks at least 30 minutes and never across midnight", () => {
    expect(snapCalendarDuration(9 * 60, 19)).toBe(30);
    expect(snapCalendarDuration(23 * 60 + 30, 90)).toBe(30);
    expect(snapCalendarDuration(20 * 60, 47)).toBe(45);
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
});
