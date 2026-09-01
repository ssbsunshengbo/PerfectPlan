import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import { normalizeTaskTitle, taskService } from "./task-service";

vi.mock("../database/database", () => ({
  getDatabase: vi.fn(),
}));

const taskRow = {
  id: "task-1",
  title: "整理本周计划",
  notes: "",
  status: "active",
  priority: 0,
  project_id: null,
  parent_task_id: null,
  scheduled_date: null,
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

describe("taskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("trims a new task title before persisting it", async () => {
    select.mockResolvedValueOnce([taskRow]);

    await taskService.createTask({ title: "  整理本周计划  " });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("INSERT INTO tasks");
    expect(execute.mock.calls[0]?.[1]?.slice(1, 5)).toEqual(["整理本周计划", "", "active", 0]);
  });

  it("rejects an empty task title before accessing the database", async () => {
    expect(() => normalizeTaskTitle("  ")).toThrow("任务标题不能为空");

    await expect(taskService.createTask({ title: "  " })).rejects.toThrow("任务标题不能为空");
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("marks a task complete and returns the persisted task", async () => {
    select.mockResolvedValueOnce([{ ...taskRow, status: "completed" }]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const task = await taskService.completeTask("task-1");

    expect(task.status).toBe("completed");
    expect(execute.mock.calls[0]?.[0]).toContain("SET status = $1");
    expect(execute.mock.calls[0]?.[1]?.[0]).toBe("completed");
  });

  it("moves an accidentally created task to the trash for undo", async () => {
    select.mockResolvedValueOnce([
      { ...taskRow, status: "trashed", deleted_at: "2026-09-01T00:00:00.000Z" },
    ]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const task = await taskService.trashTask("task-1");

    expect(task.status).toBe("trashed");
    expect(execute.mock.calls[0]?.[0]).toContain("SET status = $1, deleted_at = $2");
    expect(execute.mock.calls[0]?.[1]?.[0]).toBe("trashed");
  });
});
