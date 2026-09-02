import { useCallback, useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
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
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("tray-show-today", () => {
      setError(null);
      void load();
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.add("tray-window");
    document.body.classList.add("tray-window");
    return () => {
      document.documentElement.classList.remove("tray-window");
      document.body.classList.remove("tray-window");
    };
  }, []);

  async function hidePanel() {
    try {
      await getCurrentWindow().hide();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法隐藏面板，请重试。");
    }
  }

  async function openMain() {
    try {
      const main = await WebviewWindow.getByLabel("main");
      await main?.show();
      await main?.setFocus();
      await hidePanel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法打开完整计划，请重试。");
    }
  }

  async function quickAdd() {
    try {
      const main = await WebviewWindow.getByLabel("main");
      await main?.show();
      await main?.setFocus();
      await emit("tray-open-quick-add");
      await hidePanel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法新建任务，请重试。");
    }
  }

  async function openTask(task: TaskRecord) {
    try {
      const main = await WebviewWindow.getByLabel("main");
      await main?.show();
      await main?.setFocus();
      await emit("tray-open-task", task.id);
      await hidePanel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法打开任务，请重试。");
    }
  }

  async function complete(task: TaskRecord) {
    setUpdatingTaskId(task.id);
    setError(null);
    try {
      await taskService.completeTask(task.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法完成任务，请重试。");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <main className="tray-today-panel">
      <header className="tray-header">
        <div className="tray-heading">
          <span className="tray-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <p className="tray-date">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </p>
            <h1>今天</h1>
          </div>
        </div>
        <button
          aria-label="隐藏今日面板"
          className="tray-close"
          onClick={() => void hidePanel()}
          type="button"
        >
          ×
        </button>
      </header>
      <section className="tray-summary" aria-label="今日任务摘要">
        <strong>{isLoading ? "—" : tasks.length}</strong>
        <span>项待完成</span>
      </section>
      {isLoading ? (
        <p className="tray-empty">正在读取今日计划…</p>
      ) : tasks.length ? (
        <ul className="tray-task-list">
          {tasks.slice(0, 6).map((task) => (
            <li key={task.id}>
              <button
                aria-label={`完成任务：${task.title}`}
                className="tray-complete"
                onClick={() => void complete(task)}
                disabled={updatingTaskId === task.id}
                type="button"
              />
              <button className="tray-task-title" onClick={() => void openTask(task)} type="button">
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tray-empty">今天没有待完成任务。</p>
      )}
      {error ? <p className="tray-error">{error}</p> : null}
      <footer>
        <button className="tray-new-task" onClick={() => void quickAdd()} type="button">
          <span aria-hidden="true">＋</span> 新建任务
        </button>
        <button className="tray-open-main" onClick={() => void openMain()} type="button">
          打开完整计划 <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </main>
  );
}
