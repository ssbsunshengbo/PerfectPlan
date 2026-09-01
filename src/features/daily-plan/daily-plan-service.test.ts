import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import { dailyPlanService } from "./daily-plan-service";

vi.mock("../database/database", () => ({
  getDatabase: vi.fn(),
}));

const taskRow = {
  id: "task-1",
  title: "完成今日重点",
  notes: "",
  status: "active",
  priority: 2,
  project_id: null,
  parent_task_id: null,
  scheduled_date: "2026-09-01",
  scheduled_start_at: null,
  estimated_minutes: null,
  due_date: null,
  completed_at: null,
  deleted_at: null,
  sort_order: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const execute = vi.fn();
const select = vi.fn();

describe("dailyPlanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("lists active root tasks selected as a day's focus", async () => {
    select.mockResolvedValueOnce([taskRow]);

    const tasks = await dailyPlanService.listFocusTasks("2026-09-01");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: "task-1", priority: 2 });
    expect(select.mock.calls[0]?.[0]).toContain("INNER JOIN tasks");
    expect(select.mock.calls[0]?.[0]).toContain("daily_plan_entries.is_focus = 1");
    expect(select.mock.calls[0]?.[1]).toEqual(["2026-09-01"]);
  });

  it("adds only an active root task to the daily focus without creating duplicates", async () => {
    select.mockResolvedValueOnce([{ task_id: "task-1" }]);

    await dailyPlanService.addFocusTask("task-1", "2026-09-01");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("INSERT OR IGNORE INTO daily_plan_entries");
    expect(execute.mock.calls[0]?.[1]?.slice(1, 3)).toEqual(["task-1", "2026-09-01"]);
  });

  it("removes a task from one day's focus only", async () => {
    await dailyPlanService.removeFocusTask("task-1", "2026-09-01");

    expect(execute.mock.calls[0]?.[0]).toContain("DELETE FROM daily_plan_entries");
    expect(execute.mock.calls[0]?.[1]).toEqual(["task-1", "2026-09-01"]);
  });
});
