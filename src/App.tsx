import { FormEvent, useEffect, useRef, useState } from "react";

import "./App.css";
import { getDatabaseHealth } from "./features/database/database";
import { dailyPlanService } from "./features/daily-plan/daily-plan-service";
import { projectService, type UpdateProjectInput } from "./features/projects/project-service";
import type { ProjectRecord } from "./features/projects/project-types";
import { tagService } from "./features/tags/tag-service";
import type { TagRecord } from "./features/tags/tag-types";
import { TaskDetailDialog, type TaskDetailSaveInput } from "./features/tasks/task-detail-dialog";
import { taskService } from "./features/tasks/task-service";
import type { RecurrenceRule, TaskPriority, TaskRecord } from "./features/tasks/task-types";

type DatabaseState = "loading" | "ready" | "error";

const navigationItems = ["今日", "收集箱", "即将到来", "日历", "项目", "标签", "回收站"] as const;
type NavigationItem = (typeof navigationItems)[number];
type ReversibleTaskAction = {
  kind: "created" | "completed" | "trashed";
  nextRecurringTaskId?: string | null;
  task: Pick<TaskRecord, "id" | "title">;
};

function toLocalDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatTodayLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function toLocalDate(dateValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addDays(localDate: string, amount: number): string {
  const date = toLocalDate(localDate);
  date.setDate(date.getDate() + amount);
  return toLocalDateValue(date);
}

function formatUpcomingDate(localDate: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(toLocalDate(localDate));
}

function formatUpcomingDay(localDate: string): { day: string; weekday: string } {
  const date = toLocalDate(localDate);
  const day = new Intl.DateTimeFormat("zh-CN", { day: "numeric" }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);

  return { day, weekday };
}

function App() {
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const [databaseMessage, setDatabaseMessage] = useState("正在准备本地数据库…");
  const [activeView, setActiveView] = useState<NavigationItem>("收集箱");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [trashedTasks, setTrashedTasks] = useState<TaskRecord[]>([]);
  const [todayFocusTasks, setTodayFocusTasks] = useState<TaskRecord[]>([]);
  const [todayScheduledTasks, setTodayScheduledTasks] = useState<TaskRecord[]>([]);
  const [todayOverdueTasks, setTodayOverdueTasks] = useState<TaskRecord[]>([]);
  const [todayCompletedTasks, setTodayCompletedTasks] = useState<TaskRecord[]>([]);
  const [todayCandidateTasks, setTodayCandidateTasks] = useState<TaskRecord[]>([]);
  const [isCompletedTodayExpanded, setIsCompletedTodayExpanded] = useState(false);
  const [upcomingStartDate, setUpcomingStartDate] = useState(() => toLocalDateValue());
  const [upcomingTasks, setUpcomingTasks] = useState<TaskRecord[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [selectedTaskRecurrence, setSelectedTaskRecurrence] = useState<RecurrenceRule | null>(null);
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState<TaskRecord | null>(null);
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
  const [lastTaskAction, setLastTaskAction] = useState<ReversibleTaskAction | null>(null);
  const [isUndoingTaskAction, setIsUndoingTaskAction] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearchComposingRef = useRef(false);

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
      } catch (error) {
        console.error("Unable to initialize the local database", error);
        if (!isMounted) return;
        setDatabaseState("error");
        setDatabaseMessage(
          error instanceof Error
            ? `无法打开本地数据库：${error.message}`
            : "无法打开本地数据库。请检查磁盘空间后重试。",
        );
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;

      if (event.key.toLowerCase() === "n" && databaseState === "ready") {
        event.preventDefault();
        setIsQuickAddOpen(true);
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveView("收集箱");
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [databaseState]);

  async function loadInboxTasks(
    tagId = activeTagId,
    query = searchQuery,
    selectedProjectId = projectFilter,
    selectedPriority = priorityFilter,
  ) {
    const activeTasks = await taskService.searchActiveTasks({
      priority: selectedPriority === "all" ? undefined : selectedPriority,
      projectId: selectedProjectId === "all" ? undefined : selectedProjectId || null,
      query,
      tagId: tagId ?? undefined,
    });
    setTasks(activeTasks);
  }

  async function loadTodayTasks() {
    const today = toLocalDateValue();
    const [focusTasks, scheduledTasks, overdueTasks, completedTasks, candidateTasks] =
      await Promise.all([
        dailyPlanService.listFocusTasks(today),
        taskService.listActiveTasksScheduledOn(today),
        taskService.listOverdueActiveTasks(today),
        taskService.listCompletedTasksOn(today),
        taskService.listActiveTasks(),
      ]);

    setTodayFocusTasks(focusTasks);
    setTodayScheduledTasks(scheduledTasks);
    setTodayOverdueTasks(overdueTasks);
    setTodayCompletedTasks(completedTasks);
    setTodayCandidateTasks(candidateTasks);
  }

  async function loadUpcomingTasks(startDate = upcomingStartDate) {
    const endDate = addDays(startDate, 6);
    const upcoming = await taskService.listUpcomingTasks(startDate, endDate);

    setUpcomingTasks(upcoming);
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
      if (!activeTagId && !searchQuery && projectFilter === "all" && priorityFilter === "all") {
        setTasks((currentTasks) => [task, ...currentTasks]);
      } else {
        await loadInboxTasks();
      }
      setLastTaskAction({ kind: "created", task: { id: task.id, title: task.title } });
      setNewTaskTitle("");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "创建任务失败，请重试。");
    } finally {
      setIsSavingTask(false);
    }
  }

  async function handleCompleteTask(task: TaskRecord) {
    setTaskError(null);

    try {
      const activeSubtasks = await taskService.listActiveSubtasks(task.id);
      if (
        activeSubtasks.length > 0 &&
        !window.confirm(
          `「${task.title}」还有 ${activeSubtasks.length} 个未完成子任务。完成父任务不会完成子任务，仍要继续吗？`,
        )
      ) {
        return;
      }

      const completion = await taskService.completeTask(task.id);
      await loadInboxTasks();
      setLastTaskAction({
        kind: "completed",
        nextRecurringTaskId: completion.nextTaskId,
        task: { id: task.id, title: task.title },
      });
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
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

  async function handleSaveTaskDetails(input: TaskDetailSaveInput) {
    if (!selectedTask) return;

    setTaskError(null);
    setIsSavingTaskDetails(true);

    try {
      const { recurrenceFrequency, ...taskInput } = input;
      const updatedTask = await taskService.updateTask(selectedTask.id, taskInput);
      await taskService.updateRecurrenceRule(
        updatedTask.id,
        recurrenceFrequency ? { frequency: recurrenceFrequency } : null,
      );
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      setSelectedTask(null);
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "保存任务失败，请重试。");
    } finally {
      setIsSavingTaskDetails(false);
    }
  }

  async function openTaskDetails(task: TaskRecord) {
    setTaskError(null);
    setSelectedTask(task);
    setSelectedTaskRecurrence(null);
    setSubtasks([]);
    setTaskTags([]);

    try {
      const [activeSubtasks, appliedTags, recurrenceRule] = await Promise.all([
        taskService.listActiveSubtasks(task.id),
        tagService.listTaskTags(task.id),
        taskService.getRecurrenceRule(task.id),
      ]);
      setSubtasks(activeSubtasks);
      setTaskTags(appliedTags);
      setSelectedTaskRecurrence(recurrenceRule);
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

  function requestTrashTask(task: TaskRecord) {
    setPendingTaskDeletion(task);
  }

  async function handleTrashTask(task: TaskRecord) {
    setTaskError(null);

    try {
      const trashedTask = await taskService.trashTask(task.id);
      setTasks((currentTasks) => currentTasks.filter((currentTask) => currentTask.id !== task.id));
      setTrashedTasks((currentTasks) => [trashedTask, ...currentTasks]);
      setLastTaskAction({ kind: "trashed", task: { id: task.id, title: task.title } });
      setSelectedTask(null);
      setPendingTaskDeletion(null);
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "删除任务失败，请重试。");
    }
  }

  async function handleRestoreTask(task: TaskRecord) {
    setTaskError(null);

    try {
      await taskService.restoreTask(task.id);
      setTrashedTasks((currentTasks) =>
        currentTasks.filter((currentTask) => currentTask.id !== task.id),
      );
      if (activeView === "收集箱") await loadInboxTasks();
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "恢复任务失败，请重试。");
    }
  }

  async function handleUndoTaskAction() {
    if (!lastTaskAction) return;

    setTaskError(null);
    setIsUndoingTaskAction(true);

    try {
      if (lastTaskAction.kind === "created") {
        const trashedTask = await taskService.trashTask(lastTaskAction.task.id);
        setTasks((currentTasks) =>
          currentTasks.filter((task) => task.id !== lastTaskAction.task.id),
        );
        setTrashedTasks((currentTasks) => [trashedTask, ...currentTasks]);
      } else {
        if (lastTaskAction.kind === "completed" && lastTaskAction.nextRecurringTaskId) {
          await taskService.undoRecurringCompletion(
            lastTaskAction.task.id,
            lastTaskAction.nextRecurringTaskId,
          );
        } else {
          await taskService.restoreTask(lastTaskAction.task.id);
        }
        setTrashedTasks((currentTasks) =>
          currentTasks.filter((task) => task.id !== lastTaskAction.task.id),
        );
        await loadInboxTasks();
      }
      setLastTaskAction(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "撤销操作失败，请重试。");
    } finally {
      setIsUndoingTaskAction(false);
    }
  }

  async function handleNavigation(item: NavigationItem) {
    setActiveView(item);
    setTaskError(null);

    try {
      if (item === "收集箱") await loadInboxTasks();
      if (item === "今日") await loadTodayTasks();
      if (item === "即将到来") await loadUpcomingTasks();
      if (item === "回收站") setTrashedTasks(await taskService.listTrashedTasks());
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取任务，请重试。");
    }
  }

  async function handleUpcomingRangeChange(days: number) {
    const nextStartDate = addDays(upcomingStartDate, days);
    setUpcomingStartDate(nextStartDate);
    setTaskError(null);

    try {
      await loadUpcomingTasks(nextStartDate);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取即将到来的任务，请重试。");
    }
  }

  async function handleUpcomingReset() {
    const today = toLocalDateValue();
    setUpcomingStartDate(today);
    setTaskError(null);

    try {
      await loadUpcomingTasks(today);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取即将到来的任务，请重试。");
    }
  }

  async function handleAddFocusTask(task: TaskRecord) {
    setTaskError(null);

    try {
      await dailyPlanService.addFocusTask(task.id, toLocalDateValue());
      await loadTodayTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "设置今日重点失败，请重试。");
    }
  }

  async function handleRemoveFocusTask(task: TaskRecord) {
    setTaskError(null);

    try {
      await dailyPlanService.removeFocusTask(task.id, toLocalDateValue());
      await loadTodayTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "移出今日重点失败，请重试。");
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

  async function handleSearchQueryChange(query: string) {
    setSearchQuery(query);
    setTaskError(null);

    try {
      await loadInboxTasks(activeTagId, query);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "搜索任务失败，请重试。");
    }
  }

  async function handleProjectFilterChange(nextProjectFilter: string) {
    setProjectFilter(nextProjectFilter);
    setTaskError(null);

    try {
      await loadInboxTasks(activeTagId, searchQuery, nextProjectFilter);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "筛选任务失败，请重试。");
    }
  }

  async function handlePriorityFilterChange(nextPriorityFilter: "all" | TaskPriority) {
    setPriorityFilter(nextPriorityFilter);
    setTaskError(null);

    try {
      await loadInboxTasks(activeTagId, searchQuery, projectFilter, nextPriorityFilter);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "筛选任务失败，请重试。");
    }
  }

  async function handleClearInboxFilters() {
    setActiveTagId(null);
    setSearchQuery("");
    setSearchInputValue("");
    setProjectFilter("all");
    setPriorityFilter("all");
    setTaskError(null);

    try {
      await loadInboxTasks(null, "", "all", "all");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "清除筛选失败，请重试。");
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

  const isToday = activeView === "今日";
  const isInbox = activeView === "收集箱";
  const isUpcoming = activeView === "即将到来";
  const isProjects = activeView === "项目";
  const isTags = activeView === "标签";
  const isTrash = activeView === "回收站";
  const hasInboxFilters = Boolean(
    activeTagId || searchQuery || projectFilter !== "all" || priorityFilter !== "all",
  );
  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");
  const todayFocusTaskIds = new Set(todayFocusTasks.map((task) => task.id));
  const todayOtherTaskIds = new Set([
    ...todayScheduledTasks.map((task) => task.id),
    ...todayOverdueTasks.map((task) => task.id),
  ]);
  const todayCandidates = todayCandidateTasks.filter(
    (task) => !todayFocusTaskIds.has(task.id) && !todayOtherTaskIds.has(task.id),
  );
  const todayLabel = formatTodayLabel(toLocalDateValue());
  const upcomingEndDate = addDays(upcomingStartDate, 6);
  const upcomingDates = Array.from({ length: 7 }, (_, index) => addDays(upcomingStartDate, index));

  function upcomingDisplayDate(task: TaskRecord): string | null {
    if (
      task.scheduledDate &&
      task.scheduledDate >= upcomingStartDate &&
      task.scheduledDate <= upcomingEndDate
    ) {
      return task.scheduledDate;
    }

    return task.dueDate && task.dueDate >= upcomingStartDate && task.dueDate <= upcomingEndDate
      ? task.dueDate
      : null;
  }

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
                  onClick={() => void handleNavigation(item)}
                  type="button"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <button
          aria-keyshortcuts="Control+K Meta+K"
          className="command-button"
          onClick={() => {
            setActiveView("收集箱");
            window.requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
          type="button"
        >
          <span>快速查找</span>
          <kbd>⌘ K</kbd>
        </button>

        <p className="sidebar-note">本地优先 · 无需账户</p>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{activeView}</p>
            <h1>
              {isToday
                ? "今天，专注少数要事"
                : isUpcoming
                  ? "下一步，提前看见"
                  : isInbox
                    ? "先记下，稍后再安排"
                    : activeView}
            </h1>
          </div>
          <button
            aria-keyshortcuts="Control+N Meta+N"
            className="primary-button"
            disabled={databaseState !== "ready"}
            onClick={() => setIsQuickAddOpen(true)}
            type="button"
          >
            添加任务
          </button>
        </header>

        {isUpcoming ? (
          <section aria-labelledby="upcoming-view-title" className="upcoming-view">
            <div className="upcoming-toolbar">
              <div>
                <p className="eyebrow">日期浏览</p>
                <h2 id="upcoming-view-title">
                  {formatUpcomingDate(upcomingStartDate)} — {formatUpcomingDate(upcomingEndDate)}
                </h2>
              </div>
              <div aria-label="切换日期范围" className="upcoming-range-actions">
                <button
                  aria-label="查看前 7 天"
                  className="range-nav-button"
                  onClick={() => void handleUpcomingRangeChange(-7)}
                  type="button"
                >
                  ‹
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void handleUpcomingReset()}
                  type="button"
                >
                  回到今天
                </button>
                <button
                  aria-label="查看后 7 天"
                  className="range-nav-button"
                  onClick={() => void handleUpcomingRangeChange(7)}
                  type="button"
                >
                  ›
                </button>
              </div>
            </div>

            <div aria-label="当前七天" className="upcoming-date-strip">
              {upcomingDates.map((date) => {
                const { day, weekday } = formatUpcomingDay(date);
                const taskCount = upcomingTasks.filter(
                  (task) => upcomingDisplayDate(task) === date,
                ).length;
                const isTodayDate = date === toLocalDateValue();

                return (
                  <div
                    className={isTodayDate ? "upcoming-day is-today" : "upcoming-day"}
                    key={date}
                  >
                    <span>{weekday}</span>
                    <strong>{day}</strong>
                    <small>{taskCount > 0 ? `${taskCount} 项` : ""}</small>
                  </div>
                );
              })}
            </div>

            {upcomingTasks.length === 0 ? (
              <div className="upcoming-empty">
                <span aria-hidden="true">✦</span>
                <h3>这七天还没有已计划或临近截止的任务</h3>
                <p>你可以在任务详情中设置计划日期或截止日期，它们会自动出现在这里。</p>
              </div>
            ) : (
              <div className="upcoming-groups">
                {upcomingDates.map((date) => {
                  const tasksForDate = upcomingTasks.filter(
                    (task) => upcomingDisplayDate(task) === date,
                  );

                  return (
                    <section
                      aria-labelledby={`upcoming-${date}`}
                      className={
                        tasksForDate.length > 0 ? "upcoming-group" : "upcoming-group is-empty"
                      }
                      key={date}
                    >
                      <div className="upcoming-group-heading">
                        <h3 id={`upcoming-${date}`}>{formatUpcomingDate(date)}</h3>
                        <span>
                          {tasksForDate.length > 0 ? `${tasksForDate.length} 项` : "暂未安排"}
                        </span>
                      </div>
                      {tasksForDate.length > 0 ? (
                        <ul className="today-task-list">
                          {tasksForDate.map((task) => (
                            <li className="today-task-row" key={task.id}>
                              <button
                                aria-label={`完成任务：${task.title}`}
                                className="task-complete-button"
                                onClick={() => void handleCompleteTask(task)}
                                type="button"
                              />
                              <button
                                className="task-title"
                                onClick={() => void openTaskDetails(task)}
                                type="button"
                              >
                                {task.title}
                              </button>
                              {task.scheduledDate === date ? (
                                <span className="upcoming-task-chip">计划</span>
                              ) : null}
                              {task.dueDate === date ? (
                                <span className="upcoming-task-chip is-due">截止</span>
                              ) : task.dueDate &&
                                task.dueDate >= upcomingStartDate &&
                                task.dueDate <= upcomingEndDate ? (
                                <span className="upcoming-task-chip">
                                  截止 {task.dueDate.slice(5)}
                                </span>
                              ) : task.dueDate && task.dueDate < upcomingStartDate ? (
                                <span className="upcoming-task-chip is-due">已逾期</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        ) : isToday ? (
          <section aria-labelledby="today-view-title" className="today-view">
            <div className="today-intro">
              <div>
                <h2 id="today-view-title">{todayLabel}</h2>
                <p>先确定最重要的几件事，再处理已经安排和逾期的任务。</p>
              </div>
              <span className="today-count">{todayFocusTasks.length}/3 个重点</span>
            </div>

            <section aria-labelledby="today-focus-title" className="today-section is-focus">
              <div className="today-section-header">
                <div>
                  <p className="eyebrow">今日重点</p>
                  <h3 id="today-focus-title">留出空间给真正重要的事</h3>
                </div>
                {todayFocusTasks.length > 3 ? (
                  <span className="today-over-limit">已超过建议的 3 条</span>
                ) : null}
              </div>
              {todayFocusTasks.length > 0 ? (
                <ul className="today-task-list">
                  {todayFocusTasks.map((task) => (
                    <li className="today-task-row" key={task.id}>
                      <button
                        aria-label={`完成任务：${task.title}`}
                        className="task-complete-button"
                        onClick={() => void handleCompleteTask(task)}
                        type="button"
                      />
                      <button
                        className="task-title"
                        onClick={() => void openTaskDetails(task)}
                        type="button"
                      >
                        {task.title}
                      </button>
                      {task.scheduledDate ? <span className="today-date-chip">已计划</span> : null}
                      <button
                        aria-label={`移出今日重点：${task.title}`}
                        className="today-action-button"
                        onClick={() => void handleRemoveFocusTask(task)}
                        type="button"
                      >
                        移出
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="today-empty">从下方任务中挑选今天最值得推进的 1 到 3 件事。</p>
              )}
            </section>

            {todayOverdueTasks.filter((task) => !todayFocusTaskIds.has(task.id)).length > 0 ? (
              <section aria-labelledby="today-overdue-title" className="today-section is-overdue">
                <div className="today-section-header">
                  <div>
                    <p className="eyebrow">需要留意</p>
                    <h3 id="today-overdue-title">逾期</h3>
                  </div>
                  <span className="today-section-count">
                    {todayOverdueTasks.filter((task) => !todayFocusTaskIds.has(task.id)).length}
                  </span>
                </div>
                <ul className="today-task-list">
                  {todayOverdueTasks
                    .filter((task) => !todayFocusTaskIds.has(task.id))
                    .map((task) => (
                      <li className="today-task-row" key={task.id}>
                        <button
                          aria-label={`完成任务：${task.title}`}
                          className="task-complete-button"
                          onClick={() => void handleCompleteTask(task)}
                          type="button"
                        />
                        <button
                          className="task-title"
                          onClick={() => void openTaskDetails(task)}
                          type="button"
                        >
                          {task.title}
                        </button>
                        <span className="today-date-chip is-overdue">截止 {task.dueDate}</span>
                        <button
                          className="today-action-button"
                          onClick={() => void handleAddFocusTask(task)}
                          type="button"
                        >
                          设为重点
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="today-scheduled-title" className="today-section">
              <div className="today-section-header">
                <div>
                  <p className="eyebrow">今日安排</p>
                  <h3 id="today-scheduled-title">已计划</h3>
                </div>
                <span className="today-section-count">
                  {todayScheduledTasks.filter((task) => !todayFocusTaskIds.has(task.id)).length}
                </span>
              </div>
              {todayScheduledTasks.filter((task) => !todayFocusTaskIds.has(task.id)).length > 0 ? (
                <ul className="today-task-list">
                  {todayScheduledTasks
                    .filter((task) => !todayFocusTaskIds.has(task.id))
                    .map((task) => (
                      <li className="today-task-row" key={task.id}>
                        <button
                          aria-label={`完成任务：${task.title}`}
                          className="task-complete-button"
                          onClick={() => void handleCompleteTask(task)}
                          type="button"
                        />
                        <button
                          className="task-title"
                          onClick={() => void openTaskDetails(task)}
                          type="button"
                        >
                          {task.title}
                        </button>
                        {task.scheduledStartAt ? (
                          <span className="today-date-chip">有时间安排</span>
                        ) : null}
                        <button
                          className="today-action-button"
                          onClick={() => void handleAddFocusTask(task)}
                          type="button"
                        >
                          设为重点
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="today-empty">还没有安排到今天的任务。</p>
              )}
            </section>

            {todayCandidates.length > 0 ? (
              <section
                aria-labelledby="today-candidates-title"
                className="today-section is-candidates"
              >
                <div className="today-section-header">
                  <div>
                    <p className="eyebrow">可选任务</p>
                    <h3 id="today-candidates-title">从收集箱里挑选</h3>
                  </div>
                </div>
                <ul className="today-task-list">
                  {todayCandidates.slice(0, 8).map((task) => (
                    <li className="today-task-row" key={task.id}>
                      <button
                        className="task-title"
                        onClick={() => void openTaskDetails(task)}
                        type="button"
                      >
                        {task.title}
                      </button>
                      <button
                        className="today-action-button"
                        onClick={() => void handleAddFocusTask(task)}
                        type="button"
                      >
                        设为重点
                      </button>
                    </li>
                  ))}
                </ul>
                {todayCandidates.length > 8 ? (
                  <p className="today-more">还有 {todayCandidates.length - 8} 条任务可选</p>
                ) : null}
              </section>
            ) : null}

            {todayCompletedTasks.length > 0 ? (
              <section
                aria-labelledby="today-completed-title"
                className="today-section is-completed"
              >
                <button
                  aria-expanded={isCompletedTodayExpanded}
                  className="today-collapse-button"
                  onClick={() => setIsCompletedTodayExpanded((current) => !current)}
                  type="button"
                >
                  <span>
                    <span className="eyebrow">今日进度</span>
                    <strong id="today-completed-title">
                      已完成 {todayCompletedTasks.length} 项
                    </strong>
                  </span>
                  <span aria-hidden="true">{isCompletedTodayExpanded ? "⌃" : "⌄"}</span>
                </button>
                {isCompletedTodayExpanded ? (
                  <ul className="today-task-list is-completed">
                    {todayCompletedTasks.map((task) => (
                      <li className="today-task-row" key={task.id}>
                        <span aria-hidden="true" className="completed-check">
                          ✓
                        </span>
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
                ) : null}
              </section>
            ) : null}
          </section>
        ) : isInbox && tasks.length === 0 && !hasInboxFilters ? (
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
                <p>
                  {hasInboxFilters
                    ? `找到 ${tasks.length} 条任务`
                    : `${tasks.length} 条任务保存在此设备`}
                </p>
              </div>
            </div>
            <div className="task-filter-controls">
              <label className="search-field" htmlFor="task-search">
                <span>搜索任务</span>
                <input
                  id="task-search"
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSearchInputValue(nextValue);
                    if (!isSearchComposingRef.current) {
                      void handleSearchQueryChange(nextValue);
                    }
                  }}
                  onCompositionEnd={(event) => {
                    isSearchComposingRef.current = false;
                    void handleSearchQueryChange(event.currentTarget.value);
                  }}
                  onCompositionStart={() => {
                    isSearchComposingRef.current = true;
                  }}
                  placeholder="搜索标题和备注"
                  ref={searchInputRef}
                  type="search"
                  value={searchInputValue}
                />
              </label>
              <label className="compact-filter" htmlFor="project-filter">
                <span>项目</span>
                <select
                  id="project-filter"
                  onChange={(event) => void handleProjectFilterChange(event.target.value)}
                  value={projectFilter}
                >
                  <option value="all">全部项目</option>
                  <option value="">收集箱</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.status === "archived" ? `${project.name}（已归档）` : project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-filter" htmlFor="priority-filter">
                <span>优先级</span>
                <select
                  id="priority-filter"
                  onChange={(event) =>
                    void handlePriorityFilterChange(
                      event.target.value === "all"
                        ? "all"
                        : (Number(event.target.value) as TaskPriority),
                    )
                  }
                  value={priorityFilter}
                >
                  <option value="all">全部优先级</option>
                  <option value="0">无优先级</option>
                  <option value="1">低优先级</option>
                  <option value="2">中优先级</option>
                  <option value="3">高优先级</option>
                </select>
              </label>
              {hasInboxFilters ? (
                <button
                  className="text-button"
                  onClick={() => void handleClearInboxFilters()}
                  type="button"
                >
                  清除筛选
                </button>
              ) : null}
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
                      aria-keyshortcuts="Space"
                      className="task-complete-button"
                      onClick={() => void handleCompleteTask(task)}
                      type="button"
                    />
                    <button
                      aria-keyshortcuts="Enter Space Delete Backspace"
                      className="task-title"
                      onClick={() => void openTaskDetails(task)}
                      onKeyDown={(event) => {
                        if (event.key === " ") {
                          event.preventDefault();
                          void handleCompleteTask(task);
                        }
                        if (event.key === "Delete" || event.key === "Backspace") {
                          event.preventDefault();
                          requestTrashTask(task);
                        }
                      }}
                      type="button"
                    >
                      {task.title}
                    </button>
                    <button
                      aria-label={`删除任务：${task.title}`}
                      className="task-delete-button"
                      onClick={() => requestTrashTask(task)}
                      type="button"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="project-empty">没有匹配当前搜索或筛选条件的待完成任务。</p>
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
                autoFocus
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
        ) : isTrash ? (
          <section className="project-list" aria-labelledby="trash-title">
            <div className="task-list-heading">
              <div>
                <h2 id="trash-title">回收站</h2>
                <p>任务会保留原项目、标签和时间信息。</p>
              </div>
            </div>
            {trashedTasks.length > 0 ? (
              <ul>
                {trashedTasks.map((task) => (
                  <li className="project-row" key={task.id}>
                    <div className="project-summary">
                      <strong>{task.title}</strong>
                      <span>删除后仍可恢复</span>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => void handleRestoreTask(task)}
                      type="button"
                    >
                      恢复任务
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="project-empty">回收站为空。删除的任务会出现在这里，直到你恢复它。</p>
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

        {lastTaskAction ? (
          <div className="undo-toast" aria-live="polite">
            <span>
              {lastTaskAction.kind === "created"
                ? `已添加「${lastTaskAction.task.title}」`
                : lastTaskAction.kind === "completed"
                  ? `已完成「${lastTaskAction.task.title}」`
                  : `已移入回收站「${lastTaskAction.task.title}」`}
            </span>
            <button
              disabled={isUndoingTaskAction}
              onClick={() => void handleUndoTaskAction()}
              type="button"
            >
              {isUndoingTaskAction ? "正在撤销…" : "撤销"}
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

      {pendingTaskDeletion ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="delete-task-description"
            aria-labelledby="delete-task-title"
            aria-modal="true"
            className="confirmation-dialog"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingTaskDeletion(null);
            }}
          >
            <p className="eyebrow">任务操作</p>
            <h2 id="delete-task-title">移入回收站？</h2>
            <p id="delete-task-description">
              「{pendingTaskDeletion.title}」会保留全部信息，并可随时从回收站恢复。
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setPendingTaskDeletion(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="danger-button"
                onClick={() => void handleTrashTask(pendingTaskDeletion)}
                type="button"
              >
                移入回收站
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailDialog
          error={taskError}
          isSaving={isSavingTaskDetails}
          isSavingSubtask={isSavingSubtask}
          isSavingTag={isSavingTag}
          key={`${selectedTask.id}-${selectedTaskRecurrence?.id ?? "new"}`}
          onClose={() => {
            if (!isSavingTaskDetails) {
              setSelectedTask(null);
              setSelectedTaskRecurrence(null);
              setTaskError(null);
            }
          }}
          onCompleteSubtask={(subtaskId) => void handleCompleteSubtask(subtaskId)}
          onCreateSubtask={(title) => void handleCreateSubtask(title)}
          onCreateTag={(name) => void handleCreateTag(name)}
          onSave={(input) => void handleSaveTaskDetails(input)}
          onToggleTag={(tagId) => void handleToggleTag(tagId)}
          projects={projects}
          recurrenceRule={selectedTaskRecurrence}
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
