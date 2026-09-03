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

  it("keeps completed tasks available to the calendar", async () => {
    select.mockResolvedValueOnce([{ ...taskRow, status: "completed" }]);

    const tasks = await taskService.listCalendarTasks();

    expect(tasks[0]?.status).toBe("completed");
    expect(select.mock.calls[0]?.[0]).toContain("status IN ('active', 'completed')");
  });

  it("keeps completed root tasks available in the task list", async () => {
    select.mockResolvedValueOnce([{ ...taskRow, status: "completed" }]);

    const tasks = await taskService.listTasks();

    expect(tasks[0]?.status).toBe("completed");
    expect(select.mock.calls[0]?.[0]).toContain("status IN ('active', 'completed')");
  });

  it("marks a one-off task complete and returns the persisted task", async () => {
    select
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...taskRow, status: "completed" }]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const result = await taskService.completeTask("task-1");

    expect(result.task.status).toBe("completed");
    expect(result.nextTaskId).toBeNull();
    expect(execute.mock.calls[0]?.[0]).toContain("SET status = $1");
    expect(execute.mock.calls[0]?.[1]?.[0]).toBe("completed");
  });

  it("moves a repeat rule to the next instance only when the current task is completed", async () => {
    const recurringTask = {
      ...taskRow,
      due_date: "2026-09-05",
      estimated_minutes: 30,
      scheduled_date: "2026-09-04",
      scheduled_start_at: "2026-09-04T01:30:00.000Z",
    };
    const recurrenceRule = {
      id: "rule-1",
      task_id: "task-1",
      frequency: "weekly",
      interval_count: 1,
      weekdays: "[5]",
      day_of_month: null,
      until_date: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    select
      .mockResolvedValueOnce([recurringTask])
      .mockResolvedValueOnce([recurrenceRule])
      .mockResolvedValueOnce([{ ...recurringTask, status: "completed" }]);
    execute.mockResolvedValue({ rowsAffected: 1 });

    const result = await taskService.completeTask("task-1");

    expect(result.task.status).toBe("completed");
    expect(result.nextTaskId).toBeTruthy();
    expect(execute.mock.calls[0]?.[0]).toBe("BEGIN IMMEDIATE");
    expect(execute.mock.calls[1]?.[0]).toContain("WHERE id = $4 AND status = 'active'");
    expect(execute.mock.calls[3]?.[0]).toContain("INSERT INTO tasks");
    expect(execute.mock.calls[3]?.[1]?.[6]).toBe("2026-09-11");
    expect(execute.mock.calls[4]?.[0]).toContain("INSERT INTO task_tags");
    expect(execute.mock.calls[5]?.[0]).toContain("INSERT INTO recurrence_rules");
    expect(execute.mock.calls[6]?.[0]).toBe("COMMIT");
  });

  it.each([
    ["daily", null, null, "2026-09-05"],
    ["weekdays", null, null, "2026-09-07"],
    ["weekly", "[5]", null, "2026-09-11"],
    ["monthly", null, 4, "2026-10-04"],
  ] as const)(
    "calculates the next %s occurrence",
    async (frequency, weekdays, dayOfMonth, expectedDate) => {
      const recurringTask = { ...taskRow, scheduled_date: "2026-09-04" };
      const recurrenceRule = {
        id: "rule-1",
        task_id: "task-1",
        frequency,
        interval_count: 1,
        weekdays,
        day_of_month: dayOfMonth,
        until_date: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      };
      select.mockReset();
      execute.mockReset();
      select
        .mockResolvedValueOnce([recurringTask])
        .mockResolvedValueOnce([recurrenceRule])
        .mockResolvedValueOnce([{ ...recurringTask, status: "completed" }]);
      execute.mockResolvedValue({ rowsAffected: 1 });

      await taskService.completeTask("task-1");

      expect(execute.mock.calls[3]?.[1]?.[6]).toBe(expectedDate);
    },
  );

  it("requires a plan date before enabling a repeat rule", async () => {
    select.mockResolvedValueOnce([taskRow]);

    await expect(
      taskService.updateRecurrenceRule("task-1", { frequency: "daily" }),
    ).rejects.toThrow("设置重复前，请先选择计划日期");
    expect(execute).not.toHaveBeenCalled();
  });

  it("undoes a recurring completion by moving the rule back to the restored task", async () => {
    const recurrenceRule = {
      id: "rule-1",
      task_id: "next-task-1",
      frequency: "daily",
      interval_count: 1,
      weekdays: null,
      day_of_month: null,
      until_date: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    select
      .mockResolvedValueOnce([recurrenceRule])
      .mockResolvedValueOnce([{ ...taskRow, status: "active", completed_at: null }]);
    execute.mockResolvedValue({ rowsAffected: 1 });

    const task = await taskService.undoRecurringCompletion("task-1", "next-task-1");

    expect(task.status).toBe("active");
    expect(execute.mock.calls[0]?.[0]).toBe("BEGIN IMMEDIATE");
    expect(execute.mock.calls[1]?.[0]).toContain("status = 'completed'");
    expect(execute.mock.calls[2]?.[0]).toContain("status = 'active'");
    expect(execute.mock.calls[3]?.[0]).toContain("DELETE FROM recurrence_rules");
    expect(execute.mock.calls[4]?.[0]).toContain("INSERT INTO recurrence_rules");
    expect(execute.mock.calls[5]?.[0]).toBe("COMMIT");
  });

  it("moves an accidentally created task to the trash for undo", async () => {
    select.mockResolvedValueOnce([
      { ...taskRow, status: "trashed", deleted_at: "2026-09-01T00:00:00.000Z" },
    ]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const task = await taskService.trashTask("task-1");

    expect(task.status).toBe("trashed");
    expect(execute.mock.calls[0]?.[0]).toContain("SET status = $1, deleted_at = $2");
    expect(execute.mock.calls[0]?.[0]).toContain("OR parent_task_id = $4");
    expect(execute.mock.calls[0]?.[1]?.[0]).toBe("trashed");
  });

  it("lists only root tasks from the recycle bin", async () => {
    select.mockResolvedValueOnce([{ ...taskRow, status: "trashed", deleted_at: "2026-09-01" }]);

    const tasks = await taskService.listTrashedTasks();

    expect(tasks).toHaveLength(1);
    expect(select.mock.calls[0]?.[0]).toContain("status = 'trashed' AND parent_task_id IS NULL");
  });

  it("loads active and completed subtasks for visible parent tasks in one query", async () => {
    select.mockResolvedValueOnce([
      { ...taskRow, id: "subtask-1", parent_task_id: "task-1", title: "整理资料" },
      { ...taskRow, id: "subtask-2", parent_task_id: "task-2", title: "发送邮件" },
    ]);

    const subtasksByParentId = await taskService.listSubtasksByParentIds([
      "task-1",
      "task-2",
      "task-1",
    ]);

    expect(select.mock.calls[0]?.[0]).toContain("parent_task_id IN ($1, $2)");
    expect(select.mock.calls[0]?.[0]).toContain("status IN ('active', 'completed')");
    expect(select.mock.calls[0]?.[1]).toEqual(["task-1", "task-2"]);
    expect(subtasksByParentId.get("task-1")?.[0]?.title).toBe("整理资料");
    expect(subtasksByParentId.get("task-2")?.[0]?.title).toBe("发送邮件");
  });

  it("restores a task and its direct subtasks", async () => {
    select.mockResolvedValueOnce([taskRow]);
    execute.mockResolvedValueOnce({ rowsAffected: 2 });

    const task = await taskService.restoreTask("task-1");

    expect(task.status).toBe("active");
    expect(execute.mock.calls[0]?.[0]).toContain("OR parent_task_id = $3");
  });

  it("lists active root tasks associated with a tag", async () => {
    select.mockResolvedValueOnce([taskRow]);

    const tasks = await taskService.listActiveTasksByTag("tag-1");

    expect(tasks).toHaveLength(1);
    expect(select.mock.calls[0]?.[0]).toContain("INNER JOIN task_tags");
    expect(select.mock.calls[0]?.[1]).toEqual(["tag-1"]);
  });

  it("lists scheduled and overdue active root tasks for a local date", async () => {
    select.mockResolvedValueOnce([taskRow]).mockResolvedValueOnce([taskRow]);

    await taskService.listActiveTasksScheduledOn("2026-09-01");
    await taskService.listOverdueActiveTasks("2026-09-01");

    expect(select.mock.calls[0]?.[0]).toContain("scheduled_date = $1");
    expect(select.mock.calls[0]?.[1]).toEqual(["2026-09-01"]);
    expect(select.mock.calls[1]?.[0]).toContain("due_date < $1");
    expect(select.mock.calls[1]?.[1]).toEqual(["2026-09-01"]);
  });

  it("lists upcoming tasks that are scheduled or due in the selected date range", async () => {
    select.mockResolvedValueOnce([taskRow]);

    const tasks = await taskService.listUpcomingTasks("2026-09-01", "2026-09-07");

    expect(tasks).toHaveLength(1);
    expect(select.mock.calls[0]?.[0]).toContain("scheduled_date BETWEEN $1 AND $2");
    expect(select.mock.calls[0]?.[0]).toContain("OR due_date BETWEEN $1 AND $2");
    expect(select.mock.calls[0]?.[1]).toEqual(["2026-09-01", "2026-09-07"]);
  });

  it("rejects an invalid upcoming date range before accessing the database", async () => {
    await expect(taskService.listUpcomingTasks("2026-09-08", "2026-09-01")).rejects.toThrow(
      "日期范围无效",
    );
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("uses local-day boundaries when listing completed tasks", async () => {
    select.mockResolvedValueOnce([
      { ...taskRow, completed_at: "2026-09-01T01:00:00.000Z", status: "completed" },
    ]);

    const tasks = await taskService.listCompletedTasksOn("2026-09-01");

    expect(tasks).toHaveLength(1);
    expect(select.mock.calls[0]?.[0]).toContain("completed_at >= $1");
    expect(select.mock.calls[0]?.[0]).toContain("completed_at < $2");
    expect(select.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it("searches active and completed task titles and notes with project, priority and tag filters", async () => {
    select.mockResolvedValueOnce([taskRow]);

    const tasks = await taskService.searchTasks({
      priority: 2,
      projectId: "project-1",
      query: "计划_2026%",
      tagId: "tag-1",
    });

    expect(tasks).toHaveLength(1);
    expect(select.mock.calls[0]?.[0]).toContain("status IN ('active', 'completed')");
    expect(select.mock.calls[0]?.[0]).toContain("title LIKE $1 ESCAPE '\\'");
    expect(select.mock.calls[0]?.[0]).toContain("project_id IS $2");
    expect(select.mock.calls[0]?.[0]).toContain("priority = $3");
    expect(select.mock.calls[0]?.[0]).toContain("EXISTS (SELECT 1 FROM task_tags");
    expect(select.mock.calls[0]?.[1]).toEqual(["%计划\\_2026\\%%", "project-1", 2, "tag-1"]);
  });

  it("updates task notes, priority and scheduling fields together", async () => {
    const updatedRow = {
      ...taskRow,
      notes: "先整理需求，再安排时间",
      priority: 3,
      scheduled_date: "2026-09-03",
      scheduled_start_at: "2026-09-03T01:30:00.000Z",
      estimated_minutes: 45,
      due_date: "2026-09-04",
    };
    select.mockResolvedValueOnce([taskRow]).mockResolvedValueOnce([updatedRow]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const task = await taskService.updateTask("task-1", {
      dueDate: "2026-09-04",
      estimatedMinutes: 45,
      notes: "先整理需求，再安排时间",
      priority: 3,
      scheduledDate: "2026-09-03",
      scheduledStartAt: "2026-09-03T01:30:00.000Z",
    });

    expect(task).toMatchObject({
      dueDate: "2026-09-04",
      estimatedMinutes: 45,
      notes: "先整理需求，再安排时间",
      priority: 3,
      scheduledDate: "2026-09-03",
    });
    expect(execute.mock.calls[0]?.[0]).toContain("scheduled_start_at = $4");
  });

  it("rejects a time block that would cross into the next local day", async () => {
    select.mockResolvedValueOnce([taskRow]);
    const startAt = new Date(2026, 8, 3, 23, 30).toISOString();

    await expect(
      taskService.updateTask("task-1", {
        estimatedMinutes: 60,
        scheduledDate: "2026-09-03",
        scheduledStartAt: startAt,
      }),
    ).rejects.toThrow("计划时长不能跨越到下一天");

    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a scheduled timestamp that falls outside its local plan date", async () => {
    select.mockResolvedValueOnce([taskRow]);
    const startAt = new Date(2026, 8, 4, 0, 30).toISOString();

    await expect(
      taskService.updateTask("task-1", {
        scheduledDate: "2026-09-03",
        scheduledStartAt: startAt,
      }),
    ).rejects.toThrow("计划开始时间必须位于所选计划日期内");

    expect(execute).not.toHaveBeenCalled();
  });

  it("creates a one-level subtask that inherits its parent project", async () => {
    select
      .mockResolvedValueOnce([{ ...taskRow, project_id: "project-1" }])
      .mockResolvedValueOnce([
        { ...taskRow, id: "subtask-1", parent_task_id: "task-1", project_id: "project-1" },
      ]);

    await taskService.createSubtask("task-1", "整理设计稿");

    expect(execute.mock.calls[0]?.[0]).toContain("INSERT INTO tasks");
    expect(execute.mock.calls[0]?.[1]?.slice(1, 7)).toEqual([
      "整理设计稿",
      "",
      "active",
      0,
      "project-1",
      "task-1",
    ]);
  });
});
