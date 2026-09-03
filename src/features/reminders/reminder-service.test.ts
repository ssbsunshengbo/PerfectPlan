import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import { reminderService } from "./reminder-service";

vi.mock("../database/database", () => ({ getDatabase: vi.fn() }));

const execute = vi.fn();
const select = vi.fn();

describe("reminderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("replaces an existing pending reminder with one local pending reminder", async () => {
    select.mockResolvedValueOnce([{ id: "task-1" }]).mockResolvedValueOnce([
      {
        created_at: "2026-09-01T00:00:00.000Z",
        id: "reminder-1",
        remind_at: "2026-09-02T01:00:00.000Z",
        status: "pending",
        task_id: "task-1",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    const reminder = await reminderService.setTaskReminder("task-1", "2026-09-02T01:00:00.000Z");

    expect(reminder?.status).toBe("pending");
    expect(execute.mock.calls[0]?.[0]).toContain("status = 'dismissed'");
    expect(execute.mock.calls[1]?.[0]).toContain("INSERT INTO reminders");
  });

  it("claims due reminders once and marks them delivered", async () => {
    select.mockResolvedValueOnce([
      {
        created_at: "2026-09-01T00:00:00.000Z",
        id: "reminder-1",
        remind_at: "2026-09-02T01:00:00.000Z",
        status: "pending",
        task_id: "task-1",
        task_title: "整理本周计划",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    const reminders = await reminderService.claimDueReminders("2026-09-02T02:00:00.000Z");

    expect(reminders).toEqual([
      expect.objectContaining({ id: "reminder-1", taskTitle: "整理本周计划" }),
    ]);
    expect(execute.mock.calls[0]?.[0]).toContain("status = 'delivered'");
  });

  it("carries a recurring task reminder forward by the same relative offset", async () => {
    select
      .mockResolvedValueOnce([
        {
          created_at: "2026-09-01T00:00:00.000Z",
          id: "reminder-1",
          remind_at: "2026-09-02T08:45:00.000Z",
          status: "delivered",
          task_id: "task-1",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ id: "task-2" }])
      .mockResolvedValueOnce([
        {
          created_at: "2026-09-01T00:00:00.000Z",
          id: "reminder-2",
          remind_at: "2026-09-03T08:45:00.000Z",
          status: "pending",
          task_id: "task-2",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ]);

    const reminder = await reminderService.carryReminderToRecurringTask(
      "task-1",
      "2026-09-02T09:00:00.000Z",
      "task-2",
      "2026-09-03T09:00:00.000Z",
    );

    expect(reminder?.taskId).toBe("task-2");
    expect(execute.mock.calls[1]?.[1]?.[2]).toBe("2026-09-03T08:45:00.000Z");
  });

  it("snoozes an active task by replacing its pending reminder", async () => {
    const futureReminderAt = new Date(Date.now() + 60 * 60_000).toISOString();
    select.mockResolvedValueOnce([{ id: "task-1" }]).mockResolvedValueOnce([
      {
        created_at: "2026-09-01T00:00:00.000Z",
        id: "reminder-2",
        remind_at: futureReminderAt,
        status: "pending",
        task_id: "task-1",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    const reminder = await reminderService.snoozeReminder("task-1", futureReminderAt);

    expect(reminder?.status).toBe("pending");
    expect(execute.mock.calls[0]?.[0]).toContain("status = 'dismissed'");
  });
});
