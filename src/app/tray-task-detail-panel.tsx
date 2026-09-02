import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { projectService } from "../features/projects/project-service";
import type { ProjectRecord } from "../features/projects/project-types";
import { taskService } from "../features/tasks/task-service";
import type { TaskRecord } from "../features/tasks/task-types";

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function TrayTaskDetailPanel() {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTask = useCallback(async (taskId: string) => {
    setError(null);
    try {
      const nextTask = await taskService.getTask(taskId);
      if (!nextTask) throw new Error("找不到这个任务。");
      setTask(nextTask);
      setTitle(nextTask.title);
      setNotes(nextTask.notes);
      setProject(nextTask.projectId ? await projectService.getProject(nextTask.projectId) : null);
    } catch (reason) {
      setError(`无法读取任务：${String(reason)}`);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("tray-open-task-detail", (event) => {
      void loadTask(event.payload);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [loadTask]);

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
      await invoke("hide_tray_detail");
    } catch (reason) {
      setError(`无法收起详情：${String(reason)}`);
    }
  }

  async function saveTask() {
    if (!task || !title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const updatedTask = await taskService.updateTask(task.id, { title, notes });
      setTask(updatedTask);
      setTitle(updatedTask.title);
      setNotes(updatedTask.notes);
    } catch (reason) {
      setError(`无法保存：${String(reason)}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function scheduleTask(scheduledDate: string | null) {
    if (!task) return;
    setIsSaving(true);
    setError(null);
    try {
      const updatedTask = await taskService.updateTask(task.id, {
        scheduledDate,
        scheduledStartAt: null,
      });
      setTask(updatedTask);
    } catch (reason) {
      setError(`无法调整日期：${String(reason)}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function completeTask() {
    if (!task) return;
    setIsSaving(true);
    setError(null);
    try {
      await taskService.completeTask(task.id);
      await hidePanel();
    } catch (reason) {
      setError(`无法完成任务：${String(reason)}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="tray-task-detail-panel">
      <header className="tray-detail-header">
        <span className="tray-detail-kicker">任务详情</span>
        <button
          aria-label="收起任务详情"
          className="tray-close"
          onClick={() => void hidePanel()}
          type="button"
        >
          ×
        </button>
      </header>
      {task ? (
        <>
          <input
            aria-label="任务标题"
            className="tray-detail-title"
            disabled={isSaving}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <div className="tray-detail-meta">
            {project ? (
              <span
                className="tray-project-pill"
                style={{ "--project-color": project.color ?? "#8b92a0" } as React.CSSProperties}
              >
                {project.name}
              </span>
            ) : (
              <span className="tray-detail-muted">未归属项目</span>
            )}
          </div>
          <label className="tray-detail-notes">
            <span>备注</span>
            <textarea
              disabled={isSaving}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="写下需要记住的内容"
              value={notes}
            />
          </label>
          <section className="tray-detail-schedule" aria-label="快速安排日期">
            <span>安排到</span>
            <div>
              <button
                className={task.scheduledDate === localDate() ? "is-active" : ""}
                disabled={isSaving}
                onClick={() => void scheduleTask(localDate())}
                type="button"
              >
                今天
              </button>
              <button
                className={task.scheduledDate === localDate(1) ? "is-active" : ""}
                disabled={isSaving}
                onClick={() => void scheduleTask(localDate(1))}
                type="button"
              >
                明天
              </button>
              <button
                className={!task.scheduledDate ? "is-active" : ""}
                disabled={isSaving}
                onClick={() => void scheduleTask(null)}
                type="button"
              >
                未排期
              </button>
            </div>
          </section>
          {error ? <p className="tray-error">{error}</p> : null}
          <footer className="tray-detail-footer">
            <button
              className="tray-detail-complete"
              disabled={isSaving}
              onClick={() => void completeTask()}
              type="button"
            >
              完成
            </button>
            <button
              className="tray-detail-save"
              disabled={isSaving || !title.trim()}
              onClick={() => void saveTask()}
              type="button"
            >
              保存
            </button>
          </footer>
        </>
      ) : (
        <p className="tray-empty">选择一项任务，即可在这里快速查看和编辑。</p>
      )}
    </main>
  );
}
