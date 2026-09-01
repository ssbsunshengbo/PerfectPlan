import { FormEvent, useEffect, useState } from "react";

import "./App.css";
import { getDatabaseHealth } from "./features/database/database";
import { projectService } from "./features/projects/project-service";
import type { ProjectRecord } from "./features/projects/project-types";
import { tagService } from "./features/tags/tag-service";
import type { TagRecord } from "./features/tags/tag-types";
import { TaskDetailDialog } from "./features/tasks/task-detail-dialog";
import { taskService, type UpdateTaskInput } from "./features/tasks/task-service";
import type { TaskRecord } from "./features/tasks/task-types";

type DatabaseState = "loading" | "ready" | "error";

const navigationItems = ["今日", "收集箱", "即将到来", "日历", "项目"] as const;
type NavigationItem = (typeof navigationItems)[number];

function App() {
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const [databaseMessage, setDatabaseMessage] = useState("正在准备本地数据库…");
  const [activeView, setActiveView] = useState<NavigationItem>("收集箱");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [subtasks, setSubtasks] = useState<TaskRecord[]>([]);
  const [taskTags, setTaskTags] = useState<TagRecord[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [isSavingTaskDetails, setIsSavingTaskDetails] = useState(false);
  const [isSavingSubtask, setIsSavingSubtask] = useState(false);
  const [lastCreatedTask, setLastCreatedTask] = useState<Pick<TaskRecord, "id" | "title"> | null>(
    null,
  );
  const [isUndoingCreate, setIsUndoingCreate] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const { foreignKeysEnabled, schemaReady } = await getDatabaseHealth();

        if (!isMounted) return;

        if (!foreignKeysEnabled || !schemaReady) {
          setDatabaseState("error");
          setDatabaseMessage("本地数据库未能完成初始化。请重启应用后重试。");
          return;
        }

        const [activeTasks, activeProjects, availableTags] = await Promise.all([
          taskService.listActiveTasks(),
          projectService.listActiveProjects(),
          tagService.listTags(),
        ]);
        if (!isMounted) return;

        setTasks(activeTasks);
        setProjects(activeProjects);
        setTags(availableTags);
        setDatabaseState("ready");
        setDatabaseMessage("本地数据库已准备完成");
      } catch {
        if (!isMounted) return;
        setDatabaseState("error");
        setDatabaseMessage("无法打开本地数据库。请检查磁盘空间后重试。");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  function closeQuickAdd() {
    if (isSavingTask) return;
    setIsQuickAddOpen(false);
    setNewTaskTitle("");
    setTaskError(null);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskError(null);
    setIsSavingTask(true);

    try {
      const task = await taskService.createTask({ title: newTaskTitle });
      setTasks((currentTasks) => [task, ...currentTasks]);
      setLastCreatedTask({ id: task.id, title: task.title });
      setNewTaskTitle("");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "创建任务失败，请重试。");
    } finally {
      setIsSavingTask(false);
    }
  }

  async function handleCompleteTask(taskId: string) {
    setTaskError(null);

    try {
      await taskService.completeTask(taskId);
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "更新任务失败，请重试。");
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskError(null);
    setIsSavingProject(true);

    try {
      const project = await projectService.createProject(newProjectName);
      setProjects((currentProjects) => [...currentProjects, project]);
      setNewProjectName("");
      setIsProjectCreateOpen(false);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "创建项目失败，请重试。");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleSaveTaskDetails(input: UpdateTaskInput) {
    if (!selectedTask) return;

    setTaskError(null);
    setIsSavingTaskDetails(true);

    try {
      const updatedTask = await taskService.updateTask(selectedTask.id, input);
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      setSelectedTask(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "保存任务失败，请重试。");
    } finally {
      setIsSavingTaskDetails(false);
    }
  }

  async function openTaskDetails(task: TaskRecord) {
    setTaskError(null);
    setSelectedTask(task);
    setSubtasks([]);
    setTaskTags([]);

    try {
      const [activeSubtasks, appliedTags] = await Promise.all([
        taskService.listActiveSubtasks(task.id),
        tagService.listTaskTags(task.id),
      ]);
      setSubtasks(activeSubtasks);
      setTaskTags(appliedTags);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取子任务，请重试。");
    }
  }

  async function handleCreateSubtask(title: string) {
    if (!selectedTask) return;

    setTaskError(null);
    setIsSavingSubtask(true);

    try {
      const subtask = await taskService.createSubtask(selectedTask.id, title);
      setSubtasks((currentSubtasks) => [...currentSubtasks, subtask]);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "添加子任务失败，请重试。");
    } finally {
      setIsSavingSubtask(false);
    }
  }

  async function handleCompleteSubtask(subtaskId: string) {
    setTaskError(null);
    setIsSavingSubtask(true);

    try {
      await taskService.completeTask(subtaskId);
      setSubtasks((currentSubtasks) =>
        currentSubtasks.filter((subtask) => subtask.id !== subtaskId),
      );
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "更新子任务失败，请重试。");
    } finally {
      setIsSavingSubtask(false);
    }
  }

  async function handleCreateTag(name: string) {
    if (!selectedTask) return;

    setTaskError(null);
    setIsSavingTag(true);

    try {
      const tag = await tagService.createTag(name);
      await tagService.attachTagToTask(selectedTask.id, tag.id);
      setTags((currentTags) => [...currentTags, tag]);
      setTaskTags((currentTags) => [...currentTags, tag]);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "创建标签失败，请重试。");
    } finally {
      setIsSavingTag(false);
    }
  }

  async function handleToggleTag(tagId: string) {
    if (!selectedTask) return;

    setTaskError(null);
    setIsSavingTag(true);

    try {
      const attachedTag = taskTags.find((tag) => tag.id === tagId);

      if (attachedTag) {
        await tagService.detachTagFromTask(selectedTask.id, tagId);
        setTaskTags((currentTags) => currentTags.filter((tag) => tag.id !== tagId));
      } else {
        await tagService.attachTagToTask(selectedTask.id, tagId);
        const tag = tags.find((currentTag) => currentTag.id === tagId);
        if (tag) setTaskTags((currentTags) => [...currentTags, tag]);
      }
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "更新标签失败，请重试。");
    } finally {
      setIsSavingTag(false);
    }
  }

  async function handleUndoCreate() {
    if (!lastCreatedTask) return;

    setTaskError(null);
    setIsUndoingCreate(true);

    try {
      await taskService.trashTask(lastCreatedTask.id);
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== lastCreatedTask.id));
      setLastCreatedTask(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "撤销添加失败，请重试。");
    } finally {
      setIsUndoingCreate(false);
    }
  }

  const isInbox = activeView === "收集箱";
  const isProjects = activeView === "项目";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>PerfectPlan</span>
        </div>

        <nav>
          <ul className="navigation-list">
            {navigationItems.map((item) => (
              <li key={item}>
                <button
                  className={item === activeView ? "nav-item is-active" : "nav-item"}
                  onClick={() => setActiveView(item)}
                  type="button"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <button className="command-button" type="button">
          <span>快速查找</span>
          <kbd>⌘ K</kbd>
        </button>

        <p className="sidebar-note">本地优先 · 无需账户</p>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{activeView}</p>
            <h1>{isInbox ? "先记下，稍后再安排" : activeView}</h1>
          </div>
          <button
            className="primary-button"
            disabled={databaseState !== "ready"}
            onClick={() => setIsQuickAddOpen(true)}
            type="button"
          >
            添加任务
          </button>
        </header>

        {isInbox && tasks.length === 0 ? (
          <section className="empty-state" aria-labelledby="empty-state-title">
            <span className="empty-state-icon" aria-hidden="true">
              ✓
            </span>
            <h2 id="empty-state-title">从第一条任务开始</h2>
            <p>快速记下待办事项。它会安全地保存在当前设备，重启应用后仍然存在。</p>
          </section>
        ) : isInbox ? (
          <section className="task-list" aria-labelledby="task-list-title">
            <div className="task-list-heading">
              <div>
                <h2 id="task-list-title">待完成</h2>
                <p>{tasks.length} 条任务保存在此设备</p>
              </div>
            </div>
            <ul>
              {tasks.map((task) => (
                <li className="task-row" key={task.id}>
                  <button
                    aria-label={`完成任务：${task.title}`}
                    className="task-complete-button"
                    onClick={() => void handleCompleteTask(task.id)}
                    type="button"
                  />
                  <button
                    className="task-title"
                    onClick={() => void openTaskDetails(task)}
                    type="button"
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : isProjects ? (
          <section className="project-list" aria-labelledby="project-list-title">
            <div className="task-list-heading">
              <div>
                <h2 id="project-list-title">项目</h2>
                <p>把相关任务组织在一起</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setIsProjectCreateOpen(true)}
                type="button"
              >
                新建项目
              </button>
            </div>
            {projects.length > 0 ? (
              <ul>
                {projects.map((project) => (
                  <li key={project.id}>{project.name}</li>
                ))}
              </ul>
            ) : (
              <p className="project-empty">还没有项目。先创建一个，用来归纳相关任务。</p>
            )}
          </section>
        ) : (
          <section className="empty-state" aria-labelledby="future-view-title">
            <span className="empty-state-icon" aria-hidden="true">
              ···
            </span>
            <h2 id="future-view-title">{activeView}正在准备中</h2>
            <p>先把想做的事放进收集箱。每日规划、日历和项目将在后续阶段接入。</p>
          </section>
        )}

        {taskError ? (
          <p className="task-error" role="alert">
            {taskError}
          </p>
        ) : null}

        {lastCreatedTask ? (
          <div className="undo-toast" aria-live="polite">
            <span>已添加「{lastCreatedTask.title}」</span>
            <button
              disabled={isUndoingCreate}
              onClick={() => void handleUndoCreate()}
              type="button"
            >
              {isUndoingCreate ? "正在撤销…" : "撤销"}
            </button>
          </div>
        ) : null}

        <footer className={`database-status is-${databaseState}`} aria-live="polite">
          <span aria-hidden="true" className="status-dot" />
          {databaseMessage}
        </footer>
      </main>

      {isQuickAddOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="quick-add-title"
            aria-modal="true"
            className="quick-add-dialog"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeQuickAdd();
            }}
          >
            <div className="quick-add-header">
              <div>
                <p className="eyebrow">收集箱</p>
                <h2 id="quick-add-title">添加任务</h2>
              </div>
              <button
                aria-label="关闭添加任务窗口"
                className="icon-button"
                onClick={closeQuickAdd}
                type="button"
              >
                ×
              </button>
            </div>

            <form onSubmit={(event) => void handleCreateTask(event)}>
              <label htmlFor="new-task-title">你想记下什么？</label>
              <input
                autoFocus
                disabled={isSavingTask}
                id="new-task-title"
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="例如：整理本周计划"
                value={newTaskTitle}
              />
              <p className="form-hint">按 Enter 连续添加，按 Esc 关闭窗口。</p>
              {taskError ? <p className="form-error">{taskError}</p> : null}
              <div className="dialog-actions">
                <button className="secondary-button" onClick={closeQuickAdd} type="button">
                  取消
                </button>
                <button className="primary-button" disabled={isSavingTask} type="submit">
                  {isSavingTask ? "正在保存…" : "添加任务"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailDialog
          error={taskError}
          isSaving={isSavingTaskDetails}
          isSavingSubtask={isSavingSubtask}
          isSavingTag={isSavingTag}
          onClose={() => {
            if (!isSavingTaskDetails) {
              setSelectedTask(null);
              setTaskError(null);
            }
          }}
          onCompleteSubtask={(subtaskId) => void handleCompleteSubtask(subtaskId)}
          onCreateSubtask={(title) => void handleCreateSubtask(title)}
          onCreateTag={(name) => void handleCreateTag(name)}
          onSave={(input) => void handleSaveTaskDetails(input)}
          onToggleTag={(tagId) => void handleToggleTag(tagId)}
          projects={projects}
          subtasks={subtasks}
          tags={tags}
          task={selectedTask}
          taskTags={taskTags}
        />
      ) : null}

      {isProjectCreateOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="create-project-title"
            aria-modal="true"
            className="quick-add-dialog"
            role="dialog"
          >
            <div className="quick-add-header">
              <div>
                <p className="eyebrow">项目</p>
                <h2 id="create-project-title">新建项目</h2>
              </div>
              <button
                aria-label="关闭新建项目窗口"
                className="icon-button"
                disabled={isSavingProject}
                onClick={() => setIsProjectCreateOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form onSubmit={(event) => void handleCreateProject(event)}>
              <label htmlFor="new-project-name">项目名称</label>
              <input
                autoFocus
                disabled={isSavingProject}
                id="new-project-name"
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="例如：个人成长"
                value={newProjectName}
              />
              {taskError ? <p className="form-error">{taskError}</p> : null}
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  disabled={isSavingProject}
                  onClick={() => setIsProjectCreateOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button className="primary-button" disabled={isSavingProject} type="submit">
                  {isSavingProject ? "正在创建…" : "创建项目"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
