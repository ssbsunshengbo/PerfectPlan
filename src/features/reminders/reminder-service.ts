import { getDatabase } from "../database/database";
import {
  reminderStatuses,
  type DueReminder,
  type ReminderRecord,
  type ReminderStatus,
} from "./reminder-types";

type ReminderRow = {
  created_at: string;
  id: string;
  remind_at: string;
  status: string;
  task_id: string;
  updated_at: string;
};

type DueReminderRow = ReminderRow & { task_title: string };

function now(): string {
  return new Date().toISOString();
}

function toReminderStatus(status: string): ReminderStatus {
  if (!reminderStatuses.includes(status as ReminderStatus)) {
    throw new Error(`数据库中存在未知提醒状态：${status}`);
  }
  return status as ReminderStatus;
}

function toReminderRecord(row: ReminderRow): ReminderRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    remindAt: row.remind_at,
    status: toReminderStatus(row.status),
    taskId: row.task_id,
    updatedAt: row.updated_at,
  };
}

function normalizeReminderAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error("提醒时间无效");
  return new Date(timestamp).toISOString();
}

async function requireActiveRootTask(taskId: string): Promise<void> {
  const database = await getDatabase();
  const rows = await database.select<Array<{ id: string }>>(
    "SELECT id FROM tasks WHERE id = $1 AND status = 'active' AND parent_task_id IS NULL LIMIT 1",
    [taskId],
  );
  if (!rows[0]) throw new Error("只能为未完成的主任务设置提醒");
}

export const reminderService = {
  async getPendingReminderForTask(taskId: string): Promise<ReminderRecord | null> {
    const database = await getDatabase();
    const rows = await database.select<ReminderRow[]>(
      `SELECT id, task_id, remind_at, status, created_at, updated_at
       FROM reminders
       WHERE task_id = $1 AND status = 'pending'
       ORDER BY remind_at ASC
       LIMIT 1`,
      [taskId],
    );
    return rows[0] ? toReminderRecord(rows[0]) : null;
  },

  async setTaskReminder(taskId: string, remindAt: string | null): Promise<ReminderRecord | null> {
    await requireActiveRootTask(taskId);
    const database = await getDatabase();
    const updatedAt = now();

    await database.execute(
      "UPDATE reminders SET status = 'dismissed', updated_at = $1 WHERE task_id = $2 AND status = 'pending'",
      [updatedAt, taskId],
    );
    if (!remindAt) return null;

    const reminderId = crypto.randomUUID();
    await database.execute(
      `INSERT INTO reminders (id, task_id, remind_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $4)`,
      [reminderId, taskId, normalizeReminderAt(remindAt), updatedAt],
    );

    return reminderService.getPendingReminderForTask(taskId);
  },

  async claimDueReminders(referenceTime = now()): Promise<DueReminder[]> {
    const database = await getDatabase();
    const claimedAt = normalizeReminderAt(referenceTime);
    const rows = await database.select<DueReminderRow[]>(
      `SELECT reminders.id, reminders.task_id, reminders.remind_at, reminders.status,
              reminders.created_at, reminders.updated_at, tasks.title AS task_title
       FROM reminders
       INNER JOIN tasks ON tasks.id = reminders.task_id
       WHERE reminders.status = 'pending'
         AND reminders.remind_at <= $1
         AND tasks.status = 'active'
         AND tasks.parent_task_id IS NULL
       ORDER BY reminders.remind_at ASC`,
      [claimedAt],
    );
    if (rows.length === 0) return [];

    await Promise.all(
      rows.map((row) =>
        database.execute(
          "UPDATE reminders SET status = 'delivered', updated_at = $1 WHERE id = $2 AND status = 'pending'",
          [claimedAt, row.id],
        ),
      ),
    );
    return rows.map((row) => ({ ...toReminderRecord(row), taskTitle: row.task_title }));
  },

  async carryReminderToRecurringTask(
    sourceTaskId: string,
    sourceScheduledStartAt: string | null,
    nextTaskId: string,
    nextScheduledStartAt: string | null,
  ): Promise<ReminderRecord | null> {
    const reminder = await reminderService.getPendingReminderForTask(sourceTaskId);
    if (!reminder || !sourceScheduledStartAt || !nextScheduledStartAt) return null;

    const sourceStart = Date.parse(sourceScheduledStartAt);
    const nextStart = Date.parse(nextScheduledStartAt);
    const reminderTime = Date.parse(reminder.remindAt);
    if ([sourceStart, nextStart, reminderTime].some(Number.isNaN)) return null;

    return reminderService.setTaskReminder(
      nextTaskId,
      new Date(nextStart + reminderTime - sourceStart).toISOString(),
    );
  },
};
