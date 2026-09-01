import { FormEvent, useEffect, useState } from "react";

import "./App.css";
import { getDatabaseHealth } from "./features/database/database";
import { taskService } from "./features/tasks/task-service";
import type { TaskRecord } from "./features/tasks/task-types";

type DatabaseState = "loading" | "ready" | "error";

const navigationItems = ["今日", "收集箱", "即将到来", "日历", "项目"] as const;
type NavigationItem = (typeof navigationItems)[number];

function App() {
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const [databaseMessage, setDatabaseMessage] = useState("正在准备本地数据库…");
  const [activeView, setActiveView] = useState<NavigationItem>("收集箱");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
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

        const activeTasks = await taskService.listActiveTasks();
        if (!isMounted) return;

        setTasks(activeTasks);
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
                  <span className="task-title">{task.title}</span>
                </li>
              ))}
            </ul>
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
    </div>
  );
}

export default App;
