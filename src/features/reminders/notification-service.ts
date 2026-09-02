import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type NotificationPermissionState = "denied" | "granted" | "unknown";

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    return (await isPermissionGranted()) ? "granted" : "unknown";
  } catch {
    return "denied";
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    return (await requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function sendTaskReminderNotification(taskTitle: string): void {
  sendNotification({
    body: "现在安排一点时间处理它吧。",
    title: `提醒：${taskTitle}`,
  });
}
