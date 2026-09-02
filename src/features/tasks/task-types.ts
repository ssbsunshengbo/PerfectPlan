export const taskStatuses = ["active", "completed", "trashed"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = [0, 1, 2, 3] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export type TaskRecord = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string | null;
  parentTaskId: string | null;
  scheduledDate: string | null;
  scheduledStartAt: string | null;
  estimatedMinutes: number | null;
  dueDate: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const recurrenceFrequencies = ["daily", "weekdays", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

export type RecurrenceRule = {
  id: string;
  taskId: string;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  weekdays: number[];
  dayOfMonth: number | null;
  untilDate: string | null;
  createdAt: string;
  updatedAt: string;
};
