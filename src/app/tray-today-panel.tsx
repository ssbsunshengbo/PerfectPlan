import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dailyPlanService } from "../features/daily-plan/daily-plan-service";
import { taskService } from "../features/tasks/task-service";
import { projectService } from "../features/projects/project-service";
import type { ProjectRecord } from "../features/projects/project-types";
import {
  getDisplayTagColor,
  getTagSuggestions,
  insertTagToken,
  parseTaskTagTokens,
} from "../features/tags/tag-input";
import { tagService } from "../features/tags/tag-service";
import type { TagRecord } from "../features/tags/tag-types";
import type { TaskRecord } from "../features/tasks/task-types";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function TrayTodayPanel() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [projectsById, setProjectsById] = useState<Map<string, ProjectRecord>>(new Map());
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localDate();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [focus, scheduled, overdue, projects, availableTags] = await Promise.all([
        dailyPlanService.listFocusTasks(today),
        taskService.listActiveTasksScheduledOn(today),
        taskService.listOverdueActiveTasks(today),
        projectService.listActiveProjects(),
        tagService.listTags(),
      ]);
      const seen = new Set<string>();
      setTasks(
        [...focus, ...scheduled, ...overdue].filter(
          (task) => !seen.has(task.id) && Boolean(seen.add(task.id)),
        ),
      );
      setProjectsById(new Map(projects.map((project) => [project.id, project])));
      setTags(availableTags);
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
      await invoke("hide_today_panel");
    } catch (reason) {
      setError(`无法隐藏面板：${String(reason)}`);
    }
  }

  async function openTask(task: TaskRecord) {
    try {
      await invoke("open_task_from_tray", { taskId: task.id });
    } catch (reason) {
      setError(`无法打开任务：${String(reason)}`);
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

  async function createTodayTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { tagIds, title } = parseTaskTagTokens(newTaskTitle, tags);
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const task = await taskService.createTask({ title });
      await Promise.all(tagIds.map((tagId) => tagService.attachTagToTask(task.id, tagId)));
      await taskService.updateTask(task.id, { scheduledDate: today });
      setNewTaskTitle("");
      await load();
    } catch (reason) {
      setError(`无法添加任务：${String(reason)}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="tray-today-panel">
      <header className="tray-header">
        <div className="tray-heading">
          <div>
            <h1>今天</h1>
            <p className="tray-date">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </p>
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
      <form className="tray-quick-add" onSubmit={(event) => void createTodayTask(event)}>
        <span aria-hidden="true">＋</span>
        <div className="tray-tag-input-wrap">
          <input
            aria-label="添加到今天的任务"
            disabled={isCreating}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="添加任务 #标签"
            value={newTaskTitle}
          />
          {getTagSuggestions(newTaskTitle, tags).length > 0 ? (
            <div aria-label="选择标签" className="tray-tag-suggestion-menu" role="listbox">
              {getTagSuggestions(newTaskTitle, tags).map((tag) => (
                <button
                  key={tag.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setNewTaskTitle((currentTitle) => insertTagToken(currentTitle, tag))
                  }
                  role="option"
                  style={{ "--tag-color": getDisplayTagColor(tag) } as React.CSSProperties}
                  type="button"
                >
                  <i aria-hidden="true" />#{tag.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </form>
      <div className="tray-section-heading">
        <span>待完成</span>
        <span>{isLoading ? "" : `${tasks.length} 项`}</span>
      </div>
      {isLoading ? (
        <p className="tray-empty">正在读取今日计划…</p>
      ) : tasks.length ? (
        <ul className="tray-task-list">
          {tasks.slice(0, 5).map((task) => {
            const project = task.projectId ? projectsById.get(task.projectId) : null;
            return (
              <li key={task.id}>
                <button
                  aria-label={`完成任务：${task.title}`}
                  className="tray-complete"
                  onClick={() => void complete(task)}
                  disabled={updatingTaskId === task.id}
                  type="button"
                />
                <button
                  className="tray-task-title"
                  onClick={() => void openTask(task)}
                  type="button"
                >
                  {task.title}
                </button>
                {project ? (
                  <span
                    className="tray-project-pill"
                    style={{ "--project-color": project.color ?? "#8b92a0" } as React.CSSProperties}
                  >
                    {project.name}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tray-empty">今天没有待完成任务。</p>
      )}
      {error ? <p className="tray-error">{error}</p> : null}
      <footer>
        <span>点击任务即可在此处查看和编辑</span>
        <button className="tray-new-task" onClick={() => void hidePanel()} type="button">
          收起
        </button>
      </footer>
    </main>
  );
}
