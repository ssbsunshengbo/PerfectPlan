import { getDatabase } from "../database/database";
import type { TaskPriority, TaskRecord } from "../tasks/task-types";

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

const qualifiedTaskSelectFields = `
  tasks.id, tasks.title, tasks.notes, tasks.status, tasks.priority, tasks.project_id,
  tasks.parent_task_id, tasks.scheduled_date, tasks.scheduled_start_at,
  tasks.estimated_minutes, tasks.due_date, tasks.completed_at, tasks.deleted_at,
  tasks.sort_order, tasks.created_at, tasks.updated_at
`;

function validateLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("计划日期必须是 YYYY-MM-DD 格式");
  }

  return value;
}

function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TaskRecord["status"],
    priority: row.priority as TaskPriority,
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

export const dailyPlanService = {
  async listFocusTasks(planDate: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${qualifiedTaskSelectFields}
       FROM daily_plan_entries
       INNER JOIN tasks ON tasks.id = daily_plan_entries.task_id
       WHERE daily_plan_entries.plan_date = $1
         AND daily_plan_entries.is_focus = 1
         AND tasks.status = 'active'
         AND tasks.parent_task_id IS NULL
       ORDER BY daily_plan_entries.sort_order ASC, daily_plan_entries.created_at ASC`,
      [validateLocalDate(planDate)],
    );

    return rows.map(toTaskRecord);
  },

  async listCarryoverSuggestions(planDate: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${qualifiedTaskSelectFields}
       FROM daily_plan_entries
       INNER JOIN tasks ON tasks.id = daily_plan_entries.task_id
       WHERE daily_plan_entries.plan_date = $1
         AND daily_plan_entries.is_focus = 0
         AND tasks.status = 'active'
         AND tasks.parent_task_id IS NULL
       ORDER BY daily_plan_entries.created_at ASC`,
      [validateLocalDate(planDate)],
    );

    return rows.map(toTaskRecord);
  },

  async listDailyReviewTasks(planDate: string): Promise<TaskRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${qualifiedTaskSelectFields}
       FROM tasks
       WHERE tasks.status = 'active'
         AND tasks.parent_task_id IS NULL
         AND (
           tasks.scheduled_date = $1
           OR EXISTS (
             SELECT 1 FROM daily_plan_entries
             WHERE daily_plan_entries.task_id = tasks.id
               AND daily_plan_entries.plan_date = $1
               AND daily_plan_entries.is_focus = 1
           )
         )
       ORDER BY tasks.priority DESC, tasks.sort_order ASC, tasks.created_at DESC`,
      [validateLocalDate(planDate)],
    );

    return rows.map(toTaskRecord);
  },

  async createCarryoverSuggestions(taskIds: string[], planDate: string): Promise<void> {
    const database = await getDatabase();
    const targetDate = validateLocalDate(planDate);
    const uniqueTaskIds = [...new Set(taskIds)];
    const createdAt = new Date().toISOString();

    await Promise.all(
      uniqueTaskIds.map((taskId) =>
        database.execute(
          `INSERT OR IGNORE INTO daily_plan_entries (
            id, task_id, plan_date, is_focus, sort_order, created_at, updated_at
          )
          SELECT $1, $2, $3, 0,
                 COALESCE((SELECT MAX(sort_order) + 1 FROM daily_plan_entries WHERE plan_date = $3), 0),
                 $4, $4
          WHERE EXISTS (
            SELECT 1 FROM tasks
            WHERE id = $2 AND status = 'active' AND parent_task_id IS NULL
          )`,
          [crypto.randomUUID(), taskId, targetDate, createdAt],
        ),
      ),
    );
  },

  async addFocusTask(taskId: string, planDate: string): Promise<void> {
    const database = await getDatabase();
    const date = validateLocalDate(planDate);
    const rows = await database.select<Array<{ task_id: string }>>(
      `SELECT id AS task_id
       FROM tasks
       WHERE id = $1 AND status = 'active' AND parent_task_id IS NULL
       LIMIT 1`,
      [taskId],
    );

    if (!rows[0]) throw new Error("只能将未完成的主任务设为今日重点");

    await database.execute(
      `INSERT INTO daily_plan_entries (
        id, task_id, plan_date, is_focus, sort_order, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 1,
        COALESCE((SELECT MAX(sort_order) + 1 FROM daily_plan_entries WHERE plan_date = $3), 0),
        $4, $4
      )
      ON CONFLICT(task_id, plan_date) DO UPDATE SET
        is_focus = 1,
        updated_at = excluded.updated_at`,
      [crypto.randomUUID(), taskId, date, new Date().toISOString()],
    );
  },

  async removeFocusTask(taskId: string, planDate: string): Promise<void> {
    const database = await getDatabase();

    await database.execute(
      `DELETE FROM daily_plan_entries
       WHERE task_id = $1 AND plan_date = $2 AND is_focus = 1`,
      [taskId, validateLocalDate(planDate)],
    );
  },
};
