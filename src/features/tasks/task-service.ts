import { getDatabase } from "../database/database";
import {
  taskPriorities,
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

function now(): string {
  return new Date().toISOString();
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

    if (updates.length === 0) {
      return requireTask(taskId);
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

  async completeTask(taskId: string): Promise<TaskRecord> {
    const database = await getDatabase();
    const completedAt = now();
    const result = await database.execute(
      `UPDATE tasks
       SET status = $1, completed_at = $2, deleted_at = NULL, updated_at = $3
       WHERE id = $4`,
      ["completed", completedAt, completedAt, taskId],
    );

    if (result.rowsAffected === 0) {
      throw new TaskNotFoundError(taskId);
    }

    return requireTask(taskId);
  },

  async trashTask(taskId: string): Promise<TaskRecord> {
    const database = await getDatabase();
    const deletedAt = now();
    const result = await database.execute(
      `UPDATE tasks
       SET status = $1, deleted_at = $2, updated_at = $3
       WHERE id = $4`,
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
       WHERE id = $3`,
      ["active", updatedAt, taskId],
    );

    if (result.rowsAffected === 0) {
      throw new TaskNotFoundError(taskId);
    }

    return requireTask(taskId);
  },
};
