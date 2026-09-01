import { FormEvent, useEffect, useState } from "react";

import "./App.css";
import { getDatabaseHealth } from "./features/database/database";
import { projectService, type UpdateProjectInput } from "./features/projects/project-service";
import type { ProjectRecord } from "./features/projects/project-types";
import { tagService } from "./features/tags/tag-service";
import type { TagRecord } from "./features/tags/tag-types";
import { TaskDetailDialog } from "./features/tasks/task-detail-dialog";
import { taskService, type UpdateTaskInput } from "./features/tasks/task-service";
import type { TaskRecord } from "./features/tasks/task-types";

type DatabaseState = "loading" | "ready" | "error";

const navigationItems = ["今日", "收集箱", "即将到来", "日历", "项目", "标签"] as const;
type NavigationItem = (typeof navigationItems)[number];

function App() {
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const [databaseMessage, setDatabaseMessage] = useState("正在准备本地数据库…");
  const [activeView, setActiveView] = useState<NavigationItem>("收集箱");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [subtasks, setSubtasks] = useState<TaskRecord[]>([]);
  const [taskTags, setTaskTags] = useState<TagRecord[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [projectDraftColor, setProjectDraftColor] = useState("");
  const [projectDraftName, setProjectDraftName] = useState("");
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
          projectService.listProjects(),
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

  async function loadInboxTasks(tagId = activeTagId) {
    const activeTasks = tagId
      ? await taskService.listActiveTasksByTag(tagId)
      : await taskService.listActiveTasks();
    setTasks(activeTasks);
  }

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
      if (!activeTagId) {
        setTasks((currentTasks) => [task, ...currentTasks]);
      }
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

  function openProjectEditor(project: ProjectRecord) {
    setTaskError(null);
    setProjectDraftColor(project.color ?? "");
    setProjectDraftName(project.name);
    setSelectedProject(project);
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;

    setTaskError(null);
    setIsSavingProject(true);

    try {
      const input: UpdateProjectInput = {
        color: projectDraftColor || null,
        name: projectDraftName,
      };
      const project = await projectService.updateProject(selectedProject.id, input);
      setProjects((currentProjects) =>
        currentProjects.map((currentProject) =>
          currentProject.id === project.id ? project : currentProject,
        ),
      );
      setSelectedProject(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "保存项目失败，请重试。");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleProjectStatusChange(shouldArchive: boolean) {
    if (!selectedProject) return;

    setTaskError(null);
    setIsSavingProject(true);

    try {
      const project = shouldArchive
        ? await projectService.archiveProject(selectedProject.id)
        : await projectService.restoreProject(selectedProject.id);
      setProjects((currentProjects) =>
        currentProjects.map((currentProject) =>
          currentProject.id === project.id ? project : currentProject,
        ),
      );
      setSelectedProject(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "更新项目状态失败，请重试。");
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
      if (activeTagId === tag.id) await loadInboxTasks();
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
      if (activeTagId === tagId) await loadInboxTasks();
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

  async function handleTagFilter(tagId: string | null) {
    setTaskError(null);
    setActiveTagId(tagId);

    try {
      await loadInboxTasks(tagId);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "筛选标签失败，请重试。");
    }
  }

  async function handleDeleteTag(tag: TagRecord) {
    const shouldDelete = window.confirm(
      `删除标签「${tag.name}」？任务会保留，只会解除与该标签的关联。`,
    );
    if (!shouldDelete) return;

    setTaskError(null);
    setIsSavingTag(true);

    try {
      await tagService.deleteTag(tag.id);
      setTags((currentTags) => currentTags.filter((currentTag) => currentTag.id !== tag.id));
      setTaskTags((currentTags) => currentTags.filter((currentTag) => currentTag.id !== tag.id));

      if (activeTagId === tag.id) {
        setActiveTagId(null);
        await loadInboxTasks(null);
      }
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "删除标签失败，请重试。");
    } finally {
      setIsSavingTag(false);
    }
  }

  const isInbox = activeView === "收集箱";
  const isProjects = activeView === "项目";
  const isTags = activeView === "标签";
  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");

  async function handleMoveProject(projectId: string, direction: -1 | 1) {
    const currentIndex = activeProjects.findIndex((project) => project.id === projectId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeProjects.length) return;

    const reorderedProjects = [...activeProjects];
    const [project] = reorderedProjects.splice(currentIndex, 1);
    if (!project) return;
    reorderedProjects.splice(targetIndex, 0, project);

    setTaskError(null);
    try {
      const updatedProjects = await Promise.all(
        reorderedProjects.map((currentProject, index) =>
          projectService.updateProject(currentProject.id, { sortOrder: index }),
        ),
      );
      setProjects((currentProjects) => [
        ...updatedProjects,
        ...currentProjects.filter((currentProject) => currentProject.status === "archived"),
      ]);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "调整项目排序失败，请重试。");
    }
  }

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

        {isInbox && tasks.length === 0 && !activeTagId ? (
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
            {tags.length > 0 ? (
              <div aria-label="按标签筛选" className="tag-filter-bar">
                <button
                  className={!activeTagId ? "tag-chip is-selected" : "tag-chip"}
                  onClick={() => void handleTagFilter(null)}
                  type="button"
                >
                  全部
                </button>
                {tags.map((tag) => (
                  <button
                    className={activeTagId === tag.id ? "tag-chip is-selected" : "tag-chip"}
                    key={tag.id}
                    onClick={() => void handleTagFilter(tag.id)}
                    type="button"
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            ) : null}
            {tasks.length > 0 ? (
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
            ) : (
              <p className="project-empty">这个标签下还没有待完成任务。</p>
            )}
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
            {activeProjects.length > 0 ? (
              <ul>
                {activeProjects.map((project, index) => (
                  <li className="project-row" key={project.id}>
                    <span
                      aria-hidden="true"
                      className="project-color"
                      style={{ backgroundColor: project.color ?? "#98a6b5" }}
                    />
                    <div className="project-summary">
                      <strong>{project.name}</strong>
                      <span>
                        {tasks.filter((task) => task.projectId === project.id).length} 条活动任务
                      </span>
                    </div>
                    <div className="project-actions">
                      <button
                        aria-label={`上移项目：${project.name}`}
                        className="project-action-button"
                        disabled={index === 0}
                        onClick={() => void handleMoveProject(project.id, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`下移项目：${project.name}`}
                        className="project-action-button"
                        disabled={index === activeProjects.length - 1}
                        onClick={() => void handleMoveProject(project.id, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => openProjectEditor(project)}
                        type="button"
                      >
                        管理
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="project-empty">还没有项目。先创建一个，用来归纳相关任务。</p>
            )}
            {archivedProjects.length > 0 ? (
              <div className="archived-projects">
                <h3>已归档</h3>
                <ul>
                  {archivedProjects.map((project) => (
                    <li className="project-row is-archived" key={project.id}>
                      <span
                        aria-hidden="true"
                        className="project-color"
                        style={{ backgroundColor: project.color ?? "#98a6b5" }}
                      />
                      <div className="project-summary">
                        <strong>{project.name}</strong>
                        <span>任务会保留原归属</span>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => openProjectEditor(project)}
                        type="button"
                      >
                        查看
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : isTags ? (
          <section className="project-list" aria-labelledby="tag-management-title">
            <div className="task-list-heading">
              <div>
                <h2 id="tag-management-title">标签</h2>
                <p>跨项目整理任务；标签可在任务详情中创建。</p>
              </div>
            </div>
            {tags.length > 0 ? (
              <ul>
                {tags.map((tag) => (
                  <li className="project-row" key={tag.id}>
                    <span aria-hidden="true" className="tag-color" />
                    <div className="project-summary">
                      <strong>{tag.name}</strong>
                      <span>删除后只会解除任务关联，不会删除任务</span>
                    </div>
                    <button
                      className="danger-button"
                      disabled={isSavingTag}
                      onClick={() => void handleDeleteTag(tag)}
                      type="button"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="project-empty">还没有标签。可在任务详情中创建并添加标签。</p>
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

      {selectedProject ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="edit-project-title"
            aria-modal="true"
            className="quick-add-dialog"
            role="dialog"
          >
            <div className="quick-add-header">
              <div>
                <p className="eyebrow">
                  {selectedProject.status === "active" ? "项目" : "已归档项目"}
                </p>
                <h2 id="edit-project-title">管理项目</h2>
              </div>
              <button
                aria-label="关闭项目管理窗口"
                className="icon-button"
                disabled={isSavingProject}
                onClick={() => setSelectedProject(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form onSubmit={(event) => void handleSaveProject(event)}>
              <label htmlFor="edit-project-name">项目名称</label>
              <input
                autoFocus
                disabled={isSavingProject}
                id="edit-project-name"
                onChange={(event) => setProjectDraftName(event.target.value)}
                value={projectDraftName}
              />
              <div className="project-color-field">
                <span>项目颜色</span>
                {projectDraftColor ? (
                  <div>
                    <input
                      aria-label="选择项目颜色"
                      disabled={isSavingProject}
                      onChange={(event) => setProjectDraftColor(event.target.value)}
                      type="color"
                      value={projectDraftColor}
                    />
                    <button
                      className="text-button"
                      disabled={isSavingProject}
                      onClick={() => setProjectDraftColor("")}
                      type="button"
                    >
                      清除颜色
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button"
                    disabled={isSavingProject}
                    onClick={() => setProjectDraftColor("#3f5efb")}
                    type="button"
                  >
                    添加颜色
                  </button>
                )}
              </div>
              {taskError ? <p className="form-error">{taskError}</p> : null}
              <div className="dialog-actions project-dialog-actions">
                {selectedProject.status === "active" ? (
                  <button
                    className="danger-button"
                    disabled={isSavingProject}
                    onClick={() => {
                      if (
                        window.confirm(`归档「${selectedProject.name}」？任务会保留原项目归属。`)
                      ) {
                        void handleProjectStatusChange(true);
                      }
                    }}
                    type="button"
                  >
                    归档项目
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={isSavingProject}
                    onClick={() => void handleProjectStatusChange(false)}
                    type="button"
                  >
                    恢复项目
                  </button>
                )}
                <span />
                <button
                  className="secondary-button"
                  disabled={isSavingProject}
                  onClick={() => setSelectedProject(null)}
                  type="button"
                >
                  取消
                </button>
                <button className="primary-button" disabled={isSavingProject} type="submit">
                  {isSavingProject ? "正在保存…" : "保存项目"}
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
