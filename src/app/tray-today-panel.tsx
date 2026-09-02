import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { dailyPlanService } from "../features/daily-plan/daily-plan-service";
import { taskService } from "../features/tasks/task-service";
import type { TaskRecord } from "../features/tasks/task-types";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function TrayTodayPanel() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const today = localDate();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [focus, scheduled, overdue] = await Promise.all([
        dailyPlanService.listFocusTasks(today),
        taskService.listActiveTasksScheduledOn(today),
        taskService.listOverdueActiveTasks(today),
      ]);
      const seen = new Set<string>();
      setTasks(
        [...focus, ...scheduled, ...overdue].filter(
          (task) => !seen.has(task.id) && Boolean(seen.add(task.id)),
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void moveWindow(Position.TrayCenter).catch(() => undefined);
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openMain() {
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.setFocus();
    await getCurrentWindow().hide();
  }

  async function complete(task: TaskRecord) {
    await taskService.completeTask(task.id);
    await load();
  }

  return (
    <main className="tray-today-panel">
      <header>
        <div>
          <p>PERFECTPLAN</p>
          <h1>今天</h1>
        </div>
        <button
          aria-label="隐藏今日面板"
          onClick={() => void getCurrentWindow().hide()}
          type="button"
        >
          ×
        </button>
      </header>
      <p className="tray-date">
        {new Intl.DateTimeFormat("zh-CN", {
          month: "long",
          day: "numeric",
          weekday: "long",
        }).format(new Date())}
      </p>
      {isLoading ? (
        <p className="tray-empty">正在读取今日计划…</p>
      ) : tasks.length ? (
        <ul>
          {tasks.slice(0, 6).map((task) => (
            <li key={task.id}>
              <button
                aria-label={`完成任务：${task.title}`}
                className="tray-complete"
                onClick={() => void complete(task)}
                type="button"
              />
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tray-empty">今天没有待完成任务。</p>
      )}
      <footer>
        <button onClick={() => void openMain()} type="button">
          打开完整计划 <span>↗</span>
        </button>
      </footer>
    </main>
  );
}
