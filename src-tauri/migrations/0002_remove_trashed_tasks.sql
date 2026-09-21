-- Recycle Bin has been removed. Clean dependent rows explicitly so this
-- migration remains safe even if SQLite foreign-key enforcement was disabled
-- by an older application process.
DELETE FROM task_tags
WHERE task_id IN (SELECT id FROM tasks WHERE status = 'trashed');

DELETE FROM daily_plan_entries
WHERE task_id IN (SELECT id FROM tasks WHERE status = 'trashed');

DELETE FROM reminders
WHERE task_id IN (SELECT id FROM tasks WHERE status = 'trashed');

DELETE FROM recurrence_rules
WHERE task_id IN (SELECT id FROM tasks WHERE status = 'trashed');

DELETE FROM task_change_log
WHERE task_id IN (SELECT id FROM tasks WHERE status = 'trashed');

DELETE FROM tasks WHERE status = 'trashed';
