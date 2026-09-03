import { getDatabase } from "../database/database";
import {
  taskPriorities,
  recurrenceFrequencies,
  type RecurrenceFrequency,
  type RecurrenceRule,
  taskStatuses,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from "./task-types";

type TaskRow = {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: number;
  project_id: string | null;
  parent_task_id: string | null;
  scheduled_date: string | null;
  scheduled_start_at: string | null;
  estimated_minutes: number | null;
  due_date: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RecurrenceRuleRow = {
  id: string;
  task_id: string;
  frequency: string;
  interval_count: number;
  weekdays: string | null;
  day_of_month: number | null;
  until_date: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTaskInput = {
  title: string;
  notes?: string;
  priority?: TaskPriority;
  projectId?: string | null;
  parentTaskId?: string | null;
};

export type UpdateTaskInput = {
  title?: string;
  notes?: string;
  priority?: TaskPriority;
  projectId?: string | null;
  scheduledDate?: string | null;
  scheduledStartAt?: string | null;
  estimatedMinutes?: number | null;
  dueDate?: string | null;
};

export type UpdateTaskRecurrenceInput = {
  frequency: RecurrenceFrequency;
};

export type CompleteTaskResult = {
  nextTaskId: string | null;
  task: TaskRecord;
};

export type TaskSearchFilters = {
  projectId?: string | null;
  priority?: TaskPriority;
  query?: string;
  tagId?: string;
};

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`找不到任务：${taskId}`);
    this.name = "TaskNotFoundError";
  }
}

const taskSelectFields = `
  id, title, notes, status, priority, project_id, parent_task_id,
  scheduled_date, scheduled_start_at, estimated_minutes, due_date,
  completed_at, deleted_at, sort_order, created_at, updated_at
`;

export function normalizeTaskTitle(title: string): string {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("任务标题不能为空");
  }

  return normalizedTitle;
}

function escapeLikeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function now(): string {
  return new Date().toISOString();
}

function normalizeLocalDate(value: string | null | undefined, fieldName: string): string | null {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error(`${fieldName}必须是 YYYY-MM-DD 格式`);
  }

  return normalizedValue;
}

function localDateBounds(value: string): [string, string] {
  const normalizedDate = normalizeLocalDate(value, "日期");
  if (!normalizedDate) throw new Error("日期不能为空");

  const [year, month, day] = normalizedDate.split("-").map(Number);
  const start = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const nextDay = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1);

  return [start.toISOString(), nextDay.toISOString()];
}

function normalizeScheduledStartAt(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) return null;
  if (Number.isNaN(Date.parse(normalizedValue))) {
    throw new Error("计划开始时间无效");
  }

  return normalizedValue;
}

function normalizeEstimatedMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("预计时长必须是大于 0 的整数分钟");
  }

  return value;
}

function toLocalDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function toLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addDays(value: string, amount: number): string {
  const date = toLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toLocalDateValue(date);
}

function daysBetween(startDate: string, endDate: string): number {
  return Math.round(
    (toLocalDate(endDate).getTime() - toLocalDate(startDate).getTime()) / 86_400_000,
  );
}

function weekdayForDate(value: string): number {
  const day = toLocalDate(value).getDay();
  return day === 0 ? 7 : day;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function nextOccurrenceDate(task: TaskRecord, rule: RecurrenceRule): string {
  if (!task.scheduledDate) {
    throw new Error("重复任务需要先设置计划日期");
  }

  switch (rule.frequency) {
    case "daily":
      return addDays(task.scheduledDate, rule.intervalCount);
    case "weekdays": {
      let candidate = task.scheduledDate;
      do {
        candidate = addDays(candidate, 1);
      } while (weekdayForDate(candidate) > 5);
      return candidate;
    }
    case "weekly": {
      const weekdays =
        rule.weekdays.length > 0 ? rule.weekdays : [weekdayForDate(task.scheduledDate)];
      let candidate = task.scheduledDate;
      do {
        candidate = addDays(candidate, 1);
      } while (!weekdays.includes(weekdayForDate(candidate)));
      return candidate;
    }
    case "monthly": {
      const current = toLocalDate(task.scheduledDate);
      const nextMonth = current.getMonth() + rule.intervalCount;
      const dayOfMonth = rule.dayOfMonth ?? current.getDate();
      return toLocalDateValue(
        new Date(
          current.getFullYear(),
          nextMonth,
          Math.min(dayOfMonth, daysInMonth(current.getFullYear(), nextMonth)),
        ),
      );
    }
  }
}

function nextScheduledStartAt(currentStartAt: string | null, nextDate: string): string | null {
  if (!currentStartAt) return null;

  const current = new Date(currentStartAt);
  if (Number.isNaN(current.getTime())) return null;
  const next = toLocalDate(nextDate);
  next.setHours(
    current.getHours(),
    current.getMinutes(),
    current.getSeconds(),
    current.getMilliseconds(),
  );
  return next.toISOString();
}

function validateTaskSchedule(
  scheduledDate: string | null,
  scheduledStartAt: string | null,
  estimatedMinutes: number | null,
): void {
  if (!scheduledStartAt) return;
  if (!scheduledDate) throw new Error("设置计划开始时间前，请先选择计划日期");

  const start = new Date(scheduledStartAt);
  if (toLocalDateValue(start) !== scheduledDate) {
    throw new Error("计划开始时间必须位于所选计划日期内");
  }
  if (!estimatedMinutes) return;

  const [year, month, day] = scheduledDate.split("-").map(Number);
  const nextDayStart = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1).getTime();
  const endAt = start.getTime() + estimatedMinutes * 60_000;

  if (endAt > nextDayStart) {
    throw new Error("计划时长不能跨越到下一天");
  }
}

function toTaskStatus(status: string): TaskStatus {
  if (!taskStatuses.includes(status as TaskStatus)) {
    throw new Error(`数据库中存在未知任务状态：${status}`);
  }

  return status as TaskStatus;
}

function toTaskPriority(priority: number): TaskPriority {
  if (!taskPriorities.includes(priority as TaskPriority)) {
    throw new Error(`数据库中存在无效任务优先级：${priority}`);
  }

  return priority as TaskPriority;
}

function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: toTaskStatus(row.status),
    priority: toTaskPriority(row.priority),
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    scheduledDate: row.scheduled_date,
    scheduledStartAt: row.scheduled_start_at,
    estimatedMinutes: row.estimated_minutes,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRecurrenceRule(row: RecurrenceRuleRow): RecurrenceRule {
  if (!recurrenceFrequencies.includes(row.frequency as RecurrenceFrequency)) {
    throw new Error(`数据库中存在未知重复规则：${row.frequency}`);
  }

  let weekdays: number[] = [];
  if (row.weekdays) {
    try {
      const parsed = JSON.parse(row.weekdays);
      if (
        Array.isArray(parsed) &&
        parsed.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      ) {
        weekdays = parsed;
      }
    } catch {
      throw new Error("数据库中存在无效重复星期设置");
    }
  }

  return {
    id: row.id,
    taskId: row.task_id,
    frequency: row.frequency as RecurrenceFrequency,
    intervalCount: row.interval_count,
    weekdays,
    dayOfMonth: row.day_of_month,
    untilDate: row.until_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireTask(taskId: string): Promise<TaskRecord> {
  const task = await taskService.getTask(taskId);

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  return task;
}

export const taskService = {
  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const title = normalizeTaskTitle(input.title);
    const createdAt = now();
    const taskId = crypto.randomUUID();
    const database = await getDatabase();

    await database.execute(
      `INSERT INTO tasks (
        id, title, notes, status, priority, project_id, parent_task_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        taskId,
        title,
        input.notes?.trim() ?? "",
        "active",
        input.priority ?? 0,
        input.projectId ?? null,
        input.parentTaskId ?? null,
        createdAt,
        createdAt,
      ],
    );

    return requireTask(taskId);
  },

  async getTask(taskId: string): Promise<TaskRecord | null> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields} FROM tasks WHERE id = $1 LIMIT 1`,
      [taskId],
    );

    return rows[0] ? toTaskRecord(rows[0]) : null;
  },

  async listActiveTasks(): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'active' AND parent_task_id IS NULL
       ORDER BY sort_order ASC, created_at DESC`,
    );

    return rows.map(toTaskRecord);
  },

  async listTasks(): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status IN ('active', 'completed') AND parent_task_id IS NULL
       ORDER BY status = 'completed' ASC, sort_order ASC, created_at DESC`,
    );

    return rows.map(toTaskRecord);
  },

  async listCalendarTasks(): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status IN ('active', 'completed') AND parent_task_id IS NULL
       ORDER BY scheduled_date ASC, scheduled_start_at ASC, sort_order ASC, created_at DESC`,
    );

    return rows.map(toTaskRecord);
  },

  async listActiveTasksScheduledOn(localDate: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'active' AND parent_task_id IS NULL AND scheduled_date = $1
       ORDER BY priority DESC, sort_order ASC, created_at DESC`,
      [normalizeLocalDate(localDate, "计划日期")],
    );

    return rows.map(toTaskRecord);
  },

  async listOverdueActiveTasks(localDate: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'active'
         AND parent_task_id IS NULL
         AND due_date IS NOT NULL
         AND due_date < $1
       ORDER BY due_date ASC, priority DESC, sort_order ASC`,
      [normalizeLocalDate(localDate, "日期")],
    );

    return rows.map(toTaskRecord);
  },

  async listCompletedTasksOn(localDate: string): Promise<TaskRecord[]> {
    const [startAt, endAt] = localDateBounds(localDate);
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'completed'
         AND parent_task_id IS NULL
         AND completed_at >= $1
         AND completed_at < $2
       ORDER BY completed_at DESC`,
      [startAt, endAt],
    );

    return rows.map(toTaskRecord);
  },

  async listActiveTasksByTag(tagId: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT
         tasks.id, tasks.title, tasks.notes, tasks.status, tasks.priority, tasks.project_id,
         tasks.parent_task_id, tasks.scheduled_date, tasks.scheduled_start_at,
         tasks.estimated_minutes, tasks.due_date, tasks.completed_at, tasks.deleted_at,
         tasks.sort_order, tasks.created_at, tasks.updated_at
       FROM tasks
       INNER JOIN task_tags ON task_tags.task_id = tasks.id
       WHERE tasks.status = 'active'
         AND tasks.parent_task_id IS NULL
         AND task_tags.tag_id = $1
       ORDER BY tasks.sort_order ASC, tasks.created_at DESC`,
      [tagId],
    );

    return rows.map(toTaskRecord);
  },

  async searchTasks(filters: TaskSearchFilters = {}): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const clauses = ["status IN ('active', 'completed')", "parent_task_id IS NULL"];
    const values: Array<string | number | null> = [];

    if (filters.query?.trim()) {
      values.push(`%${escapeLikeQuery(filters.query.trim())}%`);
      const placeholder = `$${values.length}`;
      clauses.push(
        `(title LIKE ${placeholder} ESCAPE '\\' OR notes LIKE ${placeholder} ESCAPE '\\')`,
      );
    }
    if (filters.projectId !== undefined) {
      values.push(filters.projectId);
      clauses.push(`project_id IS $${values.length}`);
    }
    if (filters.priority !== undefined) {
      values.push(filters.priority);
      clauses.push(`priority = $${values.length}`);
    }
    if (filters.tagId) {
      values.push(filters.tagId);
      clauses.push(
        `EXISTS (SELECT 1 FROM task_tags WHERE task_tags.task_id = tasks.id AND task_tags.tag_id = $${values.length})`,
      );
    }

    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE ${clauses.join(" AND ")}
       ORDER BY status = 'completed' ASC, sort_order ASC, created_at DESC`,
      values,
    );

    return rows.map(toTaskRecord);
  },

  async listTrashedTasks(): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'trashed' AND parent_task_id IS NULL
       ORDER BY deleted_at DESC, created_at DESC`,
    );

    return rows.map(toTaskRecord);
  },

  async listActiveSubtasks(parentTaskId: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status = 'active' AND parent_task_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [parentTaskId],
    );

    return rows.map(toTaskRecord);
  },

  async listSubtasks(parentTaskId: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status IN ('active', 'completed') AND parent_task_id = $1
       ORDER BY status = 'completed' ASC, sort_order ASC, created_at ASC`,
      [parentTaskId],
    );

    return rows.map(toTaskRecord);
  },

  async listSubtasksByParentIds(parentTaskIds: string[]): Promise<Map<string, TaskRecord[]>> {
    const uniqueParentTaskIds = [...new Set(parentTaskIds)];
    if (uniqueParentTaskIds.length === 0) return new Map();

    const database = await getDatabase();
    const placeholders = uniqueParentTaskIds.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskSelectFields}
       FROM tasks
       WHERE status IN ('active', 'completed') AND parent_task_id IN (${placeholders})
       ORDER BY parent_task_id ASC, status = 'completed' ASC, sort_order ASC, created_at ASC`,
      uniqueParentTaskIds,
    );

    return rows.reduce((result, row) => {
      if (!row.parent_task_id) return result;

      const currentSubtasks = result.get(row.parent_task_id) ?? [];
      currentSubtasks.push(toTaskRecord(row));
      result.set(row.parent_task_id, currentSubtasks);
      return result;
    }, new Map<string, TaskRecord[]>());
  },

  async createSubtask(parentTaskId: string, title: string): Promise<TaskRecord> {
    const parentTask = await requireTask(parentTaskId);

    return taskService.createTask({
      parentTaskId,
      projectId: parentTask.projectId,
      title,
    });
  },

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskRecord> {
    const updates: Array<{ column: string; value: string | number | null }> = [];

    if ("title" in input) {
      updates.push({ column: "title", value: normalizeTaskTitle(input.title ?? "") });
    }
    if ("notes" in input) {
      updates.push({ column: "notes", value: input.notes?.trim() ?? "" });
    }
    if ("priority" in input) {
      const priority = input.priority;
      if (priority === undefined || !taskPriorities.includes(priority)) {
        throw new Error("任务优先级必须是 0 到 3 之间的整数");
      }
      updates.push({ column: "priority", value: priority });
    }
    if ("projectId" in input) {
      updates.push({ column: "project_id", value: input.projectId ?? null });
    }
    if ("scheduledDate" in input) {
      updates.push({
        column: "scheduled_date",
        value: normalizeLocalDate(input.scheduledDate, "计划日期"),
      });
    }
    if ("scheduledStartAt" in input) {
      updates.push({
        column: "scheduled_start_at",
        value: normalizeScheduledStartAt(input.scheduledStartAt),
      });
    }
    if ("estimatedMinutes" in input) {
      updates.push({
        column: "estimated_minutes",
        value: normalizeEstimatedMinutes(input.estimatedMinutes),
      });
    }
    if ("dueDate" in input) {
      updates.push({ column: "due_date", value: normalizeLocalDate(input.dueDate, "截止日期") });
    }

    if (updates.length === 0) {
      return requireTask(taskId);
    }

    const existingTask = await requireTask(taskId);
    const nextScheduledDate =
      "scheduledDate" in input
        ? normalizeLocalDate(input.scheduledDate, "计划日期")
        : existingTask.scheduledDate;
    const nextScheduledStartAt =
      "scheduledStartAt" in input
        ? normalizeScheduledStartAt(input.scheduledStartAt)
        : existingTask.scheduledStartAt;

    const clearsScheduledStartAt =
      "scheduledDate" in input && nextScheduledDate === null && !("scheduledStartAt" in input);
    const effectiveScheduledStartAt = clearsScheduledStartAt ? null : nextScheduledStartAt;
    const nextEstimatedMinutes =
      "estimatedMinutes" in input
        ? normalizeEstimatedMinutes(input.estimatedMinutes)
        : existingTask.estimatedMinutes;

    validateTaskSchedule(nextScheduledDate, effectiveScheduledStartAt, nextEstimatedMinutes);

    if (clearsScheduledStartAt) {
      updates.push({ column: "scheduled_start_at", value: null });
    }

    updates.push({ column: "updated_at", value: now() });
    const assignments = updates.map(({ column }, index) => `${column} = $${index + 1}`).join(", ");
    const database = await getDatabase();
    const result = await database.execute(
      `UPDATE tasks SET ${assignments} WHERE id = $${updates.length + 1}`,
      [...updates.map(({ value }) => value), taskId],
    );

    if (result.rowsAffected === 0) {
      throw new TaskNotFoundError(taskId);
    }

    return requireTask(taskId);
  },

  async getRecurrenceRule(taskId: string): Promise<RecurrenceRule | null> {
    const database = await getDatabase();
    const rows = await database.select<RecurrenceRuleRow[]>(
      `SELECT id, task_id, frequency, interval_count, weekdays, day_of_month, until_date,
              created_at, updated_at
       FROM recurrence_rules
       WHERE task_id = $1
       LIMIT 1`,
      [taskId],
    );

    return rows[0] ? toRecurrenceRule(rows[0]) : null;
  },

  async updateRecurrenceRule(
    taskId: string,
    input: UpdateTaskRecurrenceInput | null,
  ): Promise<RecurrenceRule | null> {
    const task = await requireTask(taskId);
    const database = await getDatabase();

    if (!input) {
      await database.execute("DELETE FROM recurrence_rules WHERE task_id = $1", [taskId]);
      return null;
    }

    if (!recurrenceFrequencies.includes(input.frequency)) {
      throw new Error("不支持的重复规则");
    }
    if (!task.scheduledDate) {
      throw new Error("设置重复前，请先选择计划日期");
    }

    const createdAt = now();
    const weekdays =
      input.frequency === "weekly" ? JSON.stringify([weekdayForDate(task.scheduledDate)]) : null;
    const dayOfMonth =
      input.frequency === "monthly" ? toLocalDate(task.scheduledDate).getDate() : null;
    const existingRule = await taskService.getRecurrenceRule(taskId);
    const ruleId = existingRule?.id ?? crypto.randomUUID();

    await database.execute(
      `INSERT INTO recurrence_rules (
        id, task_id, frequency, interval_count, weekdays, day_of_month, until_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
      ON CONFLICT(task_id) DO UPDATE SET
        frequency = excluded.frequency,
        interval_count = excluded.interval_count,
        weekdays = excluded.weekdays,
        day_of_month = excluded.day_of_month,
        updated_at = excluded.updated_at`,
      [
        ruleId,
        taskId,
        input.frequency,
        1,
        weekdays,
        dayOfMonth,
        existingRule?.createdAt ?? createdAt,
        createdAt,
      ],
    );

    return taskService.getRecurrenceRule(taskId);
  },

  async completeTask(taskId: string): Promise<CompleteTaskResult> {
    const task = await requireTask(taskId);
    const recurrenceRule = await taskService.getRecurrenceRule(taskId);
    const database = await getDatabase();
    const completedAt = now();

    if (!recurrenceRule) {
      const result = await database.execute(
        `UPDATE tasks
         SET status = $1, completed_at = $2, deleted_at = NULL, updated_at = $3
         WHERE id = $4`,
        ["completed", completedAt, completedAt, taskId],
      );

      if (result.rowsAffected === 0) {
        throw new TaskNotFoundError(taskId);
      }

      return { nextTaskId: null, task: await requireTask(taskId) };
    }

    const nextDate = nextOccurrenceDate(task, recurrenceRule);
    const shouldCreateNext = !recurrenceRule.untilDate || nextDate <= recurrenceRule.untilDate;
    const nextTaskId = shouldCreateNext ? crypto.randomUUID() : null;

    await database.execute("BEGIN IMMEDIATE");
    try {
      const result = await database.execute(
        `UPDATE tasks
         SET status = $1, completed_at = $2, deleted_at = NULL, updated_at = $3
         WHERE id = $4 AND status = 'active'`,
        ["completed", completedAt, completedAt, taskId],
      );

      if (result.rowsAffected === 0) {
        throw new TaskNotFoundError(taskId);
      }

      await database.execute("DELETE FROM recurrence_rules WHERE task_id = $1", [taskId]);

      if (nextTaskId) {
        const nextDueDate =
          task.dueDate && task.scheduledDate
            ? addDays(nextDate, daysBetween(task.scheduledDate, task.dueDate))
            : task.dueDate;
        const nextCreatedAt = now();
        await database.execute(
          `INSERT INTO tasks (
            id, title, notes, status, priority, project_id, parent_task_id,
            scheduled_date, scheduled_start_at, estimated_minutes, due_date,
            sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            nextTaskId,
            task.title,
            task.notes,
            task.priority,
            task.projectId,
            task.parentTaskId,
            nextDate,
            nextScheduledStartAt(task.scheduledStartAt, nextDate),
            task.estimatedMinutes,
            nextDueDate,
            task.sortOrder,
            nextCreatedAt,
            nextCreatedAt,
          ],
        );
        await database.execute(
          `INSERT INTO task_tags (task_id, tag_id, created_at)
           SELECT $1, tag_id, $2 FROM task_tags WHERE task_id = $3`,
          [nextTaskId, nextCreatedAt, taskId],
        );
        await database.execute(
          `INSERT INTO recurrence_rules (
            id, task_id, frequency, interval_count, weekdays, day_of_month, until_date,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            recurrenceRule.id,
            nextTaskId,
            recurrenceRule.frequency,
            recurrenceRule.intervalCount,
            recurrenceRule.weekdays.length ? JSON.stringify(recurrenceRule.weekdays) : null,
            recurrenceRule.dayOfMonth,
            recurrenceRule.untilDate,
            recurrenceRule.createdAt,
            nextCreatedAt,
          ],
        );
      }

      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }

    return { nextTaskId, task: await requireTask(taskId) };
  },

  async undoRecurringCompletion(taskId: string, nextTaskId: string): Promise<TaskRecord> {
    const recurrenceRule = await taskService.getRecurrenceRule(nextTaskId);
    if (!recurrenceRule) {
      throw new Error("找不到可撤销的重复规则");
    }

    const database = await getDatabase();
    const restoredAt = now();
    await database.execute("BEGIN IMMEDIATE");
    try {
      const restoredTask = await database.execute(
        `UPDATE tasks
         SET status = 'active', completed_at = NULL, deleted_at = NULL, updated_at = $1
         WHERE id = $2 AND status = 'completed'`,
        [restoredAt, taskId],
      );
      if (restoredTask.rowsAffected === 0) throw new TaskNotFoundError(taskId);

      const trashedNextTask = await database.execute(
        `UPDATE tasks
         SET status = 'trashed', deleted_at = $1, updated_at = $1
         WHERE id = $2 AND status = 'active'`,
        [restoredAt, nextTaskId],
      );
      if (trashedNextTask.rowsAffected === 0) throw new TaskNotFoundError(nextTaskId);

      await database.execute("DELETE FROM recurrence_rules WHERE task_id = $1", [nextTaskId]);
      await database.execute(
        `INSERT INTO recurrence_rules (
          id, task_id, frequency, interval_count, weekdays, day_of_month, until_date,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recurrenceRule.id,
          taskId,
          recurrenceRule.frequency,
          recurrenceRule.intervalCount,
          recurrenceRule.weekdays.length ? JSON.stringify(recurrenceRule.weekdays) : null,
          recurrenceRule.dayOfMonth,
          recurrenceRule.untilDate,
          recurrenceRule.createdAt,
          restoredAt,
        ],
      );
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }

    return requireTask(taskId);
  },

  async trashTask(taskId: string): Promise<TaskRecord> {
    const database = await getDatabase();
    const deletedAt = now();
    const result = await database.execute(
      `UPDATE tasks
       SET status = $1, deleted_at = $2, updated_at = $3
       WHERE id = $4 OR parent_task_id = $4`,
      ["trashed", deletedAt, deletedAt, taskId],
    );

    if (result.rowsAffected === 0) {
      throw new TaskNotFoundError(taskId);
    }

    return requireTask(taskId);
  },

  async restoreTask(taskId: string): Promise<TaskRecord> {
    const database = await getDatabase();
    const updatedAt = now();
    const result = await database.execute(
      `UPDATE tasks
       SET status = $1, completed_at = NULL, deleted_at = NULL, updated_at = $2
       WHERE id = $3 OR parent_task_id = $3`,
      ["active", updatedAt, taskId],
    );

    if (result.rowsAffected === 0) {
      throw new TaskNotFoundError(taskId);
    }

    return requireTask(taskId);
  },
};
