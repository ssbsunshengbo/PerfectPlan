export const reminderStatuses = ["pending", "delivered", "dismissed"] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];

export type ReminderRecord = {
  createdAt: string;
  id: string;
  remindAt: string;
  status: ReminderStatus;
  taskId: string;
  updatedAt: string;
};

export type DueReminder = ReminderRecord & {
  taskTitle: string;
};
