import {
  type CSSProperties,
  FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "./App.css";
import { trapFocusInDialog, trapFocusInElement } from "./app/accessibility";
import { TrayTodayPanel } from "./app/tray-today-panel";
import { TrayTaskDetailPanel } from "./app/tray-task-detail-panel";
import { getDatabaseHealth, resetDatabaseConnection } from "./features/database/database";
import {
  CALENDAR_OVERLOAD_MINUTES,
  getCalendarConflictTaskIds,
  getCalendarDayLoadMinutes,
  getCalendarTaskLayouts,
  getCalendarTimeOptions,
  hasCalendarTimezoneMismatch,
  isCalendarTimeOutsideGrid,
  minutesFromCalendarStartAt,
  snapCalendarDuration,
  snapCalendarStart,
  toCalendarStartAt,
  toTimeValue,
} from "./features/calendar/calendar-scheduling";
import { dailyPlanService } from "./features/daily-plan/daily-plan-service";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  sendTaskReminderNotification,
  type NotificationPermissionState,
} from "./features/reminders/notification-service";
import { reminderService } from "./features/reminders/reminder-service";
import type { DueReminder, ReminderRecord } from "./features/reminders/reminder-types";
import { projectService, type UpdateProjectInput } from "./features/projects/project-service";
import type { ProjectRecord } from "./features/projects/project-types";
import { tagService } from "./features/tags/tag-service";
import type { TagRecord } from "./features/tags/tag-types";
import { TaskDetailDialog, type TaskDetailSaveInput } from "./features/tasks/task-detail-dialog";
import { taskService, type UpdateTaskInput } from "./features/tasks/task-service";
import type { RecurrenceRule, TaskPriority, TaskRecord } from "./features/tasks/task-types";

type DatabaseState = "loading" | "ready" | "error";

const navigationItems = ["今日", "收集箱", "即将到来", "日历", "项目", "标签", "回收站"] as const;
type NavigationItem = (typeof navigationItems)[number];
type ReversibleTaskAction = {
  kind: "created" | "completed" | "rescheduled" | "trashed";
  nextRecurringTaskId?: string | null;
  previousSchedule?: Pick<TaskRecord, "scheduledDate" | "scheduledStartAt" | "estimatedMinutes">;
  rescheduleLabel?: string;
  task: Pick<TaskRecord, "id" | "title">;
};

type QuickRescheduleTarget = "tonight" | "tomorrow" | "nextWeek" | "unscheduled";
type CalendarViewMode = "day" | "month" | "week";
type CalendarScheduleDraft = {
  estimatedMinutes: number;
  isAllDay: boolean;
  scheduledDate: string;
  startMinutes: number;
  task: TaskRecord;
};
type CalendarResizeState = {
  date: string;
  estimatedMinutes: number;
  initialEstimatedMinutes: number;
  startMinutes: number;
  startY: number;
  task: TaskRecord;
};
type CalendarPointerDragState = {
  hasMoved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  task: TaskRecord;
};
type CalendarDragPreview = {
  clientX: number;
  clientY: number;
  dropDate: string | null;
  dropKind: "all-day" | "time" | null;
  dropStartMinutes: number | null;
  task: TaskRecord;
};
const quickRescheduleOptions: Array<{ label: string; target: QuickRescheduleTarget }> = [
  { label: "今晚", target: "tonight" },
  { label: "明天", target: "tomorrow" },
  { label: "下周", target: "nextWeek" },
  { label: "未指定日期", target: "unscheduled" },
];

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

function nextMonday(localDate: string): string {
  const date = toLocalDate(localDate);
  const weekday = date.getDay() || 7;
  return addDays(localDate, 8 - weekday);
}

function startOfWeek(localDate: string): string {
  const weekday = (toLocalDate(localDate).getDay() + 6) % 7;
  return addDays(localDate, -weekday);
}

function addMonths(localDate: string, amount: number): string {
  const date = toLocalDate(localDate);
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return toLocalDateValue(date);
}

function formatCalendarDay(localDate: string, withWeekday = true): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  }).format(toLocalDate(localDate));
}

function formatCalendarTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatReminderTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "现在";

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function reminderTimeTomorrow(value: string): string {
  const source = new Date(value);
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return target.toISOString();
}

function calendarTimeOffset(value: string | null): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, (date.getHours() - 6) * 60 + date.getMinutes());
}

function QuickRescheduleButton({
  onReschedule,
  task,
}: {
  onReschedule: (task: TaskRecord, target: QuickRescheduleTarget) => void;
  task: TaskRecord;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="quick-reschedule">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`改期任务：${task.title}`}
        className="quick-reschedule-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        改期 <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div aria-label={`改期「${task.title}」`} className="quick-reschedule-menu" role="menu">
          {quickRescheduleOptions.map((option) => (
            <button
              key={option.target}
              onClick={() => {
                onReschedule(task, option.target);
                setIsOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const windowLabel = getCurrentWindow().label;
  if (windowLabel === "tray") return <TrayTodayPanel />;
  if (windowLabel === "tray-detail") return <TrayTaskDetailPanel />;
  return <MainApp />;
}

function MainApp() {
  const [databaseState, setDatabaseState] = useState<DatabaseState>("loading");
  const [databaseMessage, setDatabaseMessage] = useState("正在准备本地数据库…");
  const [databaseAttempt, setDatabaseAttempt] = useState(0);
  const [isRetryingDatabase, setIsRetryingDatabase] = useState(false);
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [activeView, setActiveView] = useState<NavigationItem>("收集箱");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [trashedTasks, setTrashedTasks] = useState<TaskRecord[]>([]);
  const [todayFocusTasks, setTodayFocusTasks] = useState<TaskRecord[]>([]);
  const [todayCarryoverSuggestions, setTodayCarryoverSuggestions] = useState<TaskRecord[]>([]);
  const [todayScheduledTasks, setTodayScheduledTasks] = useState<TaskRecord[]>([]);
  const [todayOverdueTasks, setTodayOverdueTasks] = useState<TaskRecord[]>([]);
  const [todayCompletedTasks, setTodayCompletedTasks] = useState<TaskRecord[]>([]);
  const [todayCandidateTasks, setTodayCandidateTasks] = useState<TaskRecord[]>([]);
  const [isCompletedTodayExpanded, setIsCompletedTodayExpanded] = useState(false);
  const [upcomingStartDate, setUpcomingStartDate] = useState(() => toLocalDateValue());
  const [selectedUpcomingDate, setSelectedUpcomingDate] = useState(() => toLocalDateValue());
  const [upcomingTasks, setUpcomingTasks] = useState<TaskRecord[]>([]);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("week");
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(() => toLocalDateValue());
  const [calendarTasks, setCalendarTasks] = useState<TaskRecord[]>([]);
  const [calendarFocusTasks, setCalendarFocusTasks] = useState<TaskRecord[]>([]);
  const [calendarOverdueTasks, setCalendarOverdueTasks] = useState<TaskRecord[]>([]);
  const [calendarScheduleDraft, setCalendarScheduleDraft] = useState<CalendarScheduleDraft | null>(
    null,
  );
  const [calendarResize, setCalendarResize] = useState<CalendarResizeState | null>(null);
  const [calendarDragPreview, setCalendarDragPreview] = useState<CalendarDragPreview | null>(null);
  const calendarPointerDragRef = useRef<CalendarPointerDragState | null>(null);
  const suppressCalendarTaskClickRef = useRef(false);
  const [isSavingCalendarSchedule, setIsSavingCalendarSchedule] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [selectedTaskReminder, setSelectedTaskReminder] = useState<ReminderRecord | null>(null);
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
  const [isDailyReviewOpen, setIsDailyReviewOpen] = useState(false);
  const [dailyReviewTasks, setDailyReviewTasks] = useState<TaskRecord[]>([]);
  const [selectedCarryoverTaskIds, setSelectedCarryoverTaskIds] = useState<string[]>([]);
  const [isSavingDailyReview, setIsSavingDailyReview] = useState(false);
  const [dailyReviewMessage, setDailyReviewMessage] = useState<string | null>(null);
  const [lastTaskAction, setLastTaskAction] = useState<ReversibleTaskAction | null>(null);
  const [isUndoingTaskAction, setIsUndoingTaskAction] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("unknown");
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [dueReminders, setDueReminders] = useState<DueReminder[]>([]);
  const [activeReminderActionId, setActiveReminderActionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearchComposingRef = useRef(false);
  const lastBackgroundFocusRef = useRef<HTMLElement | null>(null);
  const wasModalOpenRef = useRef(false);
  const isModalOpen = Boolean(
    isQuickAddOpen ||
    isProjectCreateOpen ||
    selectedProject ||
    selectedTask ||
    pendingTaskDeletion ||
    isDailyReviewOpen ||
    calendarScheduleDraft,
  );

  useEffect(() => {
    function keepFocusInOpenDialog(event: KeyboardEvent) {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const activeDialog = dialogs[dialogs.length - 1];
      if (activeDialog) trapFocusInElement(activeDialog, event);
    }

    document.addEventListener("keydown", keepFocusInOpenDialog, true);
    return () => document.removeEventListener("keydown", keepFocusInOpenDialog, true);
  }, []);

  useEffect(() => {
    let stopQuickAdd: (() => void) | undefined;
    void listen("tray-open-quick-add", () => setIsQuickAddOpen(true)).then((stop) => {
      stopQuickAdd = stop;
    });
    return () => {
      stopQuickAdd?.();
    };
  }, []);

  useEffect(() => {
    function rememberBackgroundFocus(event: FocusEvent) {
      const hasOpenDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!hasOpenDialog && event.target instanceof HTMLElement) {
        lastBackgroundFocusRef.current = event.target;
      }
    }

    document.addEventListener("focusin", rememberBackgroundFocus);
    return () => document.removeEventListener("focusin", rememberBackgroundFocus);
  }, []);

  useEffect(() => {
    if (!isModalOpen && wasModalOpenRef.current) {
      window.requestAnimationFrame(() => lastBackgroundFocusRef.current?.focus());
    }
    wasModalOpenRef.current = isModalOpen;
  }, [isModalOpen]);

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
      } finally {
        if (isMounted) setIsRetryingDatabase(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [databaseAttempt]);

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

  useEffect(() => {
    if (databaseState !== "ready") return;
    let isMounted = true;

    void getNotificationPermissionState().then((permission) => {
      if (isMounted) setNotificationPermission(permission);
    });

    async function deliverDueReminders() {
      try {
        const reminders = await reminderService.claimDueReminders();
        if (reminders.length === 0) return;

        if (isMounted) {
          setDueReminders((current) => [
            ...current,
            ...reminders.filter((reminder) => !current.some((item) => item.id === reminder.id)),
          ]);
        }

        if ((await getNotificationPermissionState()) === "granted") {
          reminders.forEach((reminder) => sendTaskReminderNotification(reminder.taskTitle));
        } else if (isMounted) {
          setReminderNotice(
            `有 ${reminders.length} 个提醒到期，但系统通知未开启。可在任务详情中开启通知。`,
          );
        }
      } catch (error) {
        if (isMounted) {
          setTaskError(error instanceof Error ? error.message : "检查提醒失败，请重试。");
        }
      }
    }

    void deliverDueReminders();
    const intervalId = window.setInterval(() => void deliverDueReminders(), 30_000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [databaseState]);

  useEffect(() => {
    if (lastTaskAction?.kind !== "rescheduled") return;

    const timeoutId = window.setTimeout(() => setLastTaskAction(null), 8_000);
    return () => window.clearTimeout(timeoutId);
  }, [lastTaskAction]);

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

  function handleRetryDatabase() {
    resetDatabaseConnection();
    setTaskError(null);
    setDatabaseState("loading");
    setDatabaseMessage("正在重新连接本地数据库…");
    setIsRetryingDatabase(true);
    setDatabaseAttempt((current) => current + 1);
  }

  async function loadTodayTasks() {
    const today = toLocalDateValue();
    const [
      focusTasks,
      carryoverSuggestions,
      scheduledTasks,
      overdueTasks,
      completedTasks,
      candidateTasks,
    ] = await Promise.all([
      dailyPlanService.listFocusTasks(today),
      dailyPlanService.listCarryoverSuggestions(today),
      taskService.listActiveTasksScheduledOn(today),
      taskService.listOverdueActiveTasks(today),
      taskService.listCompletedTasksOn(today),
      taskService.listActiveTasks(),
    ]);

    setTodayFocusTasks(focusTasks);
    setTodayCarryoverSuggestions(carryoverSuggestions);
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

  async function loadCalendarTasks() {
    const today = toLocalDateValue();
    const [activeTasks, focusTasks, overdueTasks] = await Promise.all([
      taskService.listActiveTasks(),
      dailyPlanService.listFocusTasks(today),
      taskService.listOverdueActiveTasks(today),
    ]);

    setCalendarTasks(activeTasks);
    setCalendarFocusTasks(focusTasks);
    setCalendarOverdueTasks(overdueTasks);
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

  async function handleCompleteTask(task: TaskRecord): Promise<boolean> {
    setTaskError(null);

    try {
      const activeSubtasks = await taskService.listActiveSubtasks(task.id);
      if (
        activeSubtasks.length > 0 &&
        !window.confirm(
          `「${task.title}」还有 ${activeSubtasks.length} 个未完成子任务。完成父任务不会完成子任务，仍要继续吗？`,
        )
      ) {
        return false;
      }

      const completion = await taskService.completeTask(task.id);
      if (completion.nextTaskId) {
        const nextTask = await taskService.getTask(completion.nextTaskId);
        if (nextTask) {
          await reminderService.carryReminderToRecurringTask(
            task.id,
            task.scheduledStartAt,
            nextTask.id,
            nextTask.scheduledStartAt,
          );
        }
      }
      await loadInboxTasks();
      setLastTaskAction({
        kind: "completed",
        nextRecurringTaskId: completion.nextTaskId,
        task: { id: task.id, title: task.title },
      });
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
      if (activeView === "日历") await loadCalendarTasks();
      return true;
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "更新任务失败，请重试。");
      return false;
    }
  }

  function removeDueReminder(reminderId: string) {
    setDueReminders((current) => current.filter((reminder) => reminder.id !== reminderId));
  }

  async function handleOpenReminderTask(reminder: DueReminder) {
    setActiveReminderActionId(reminder.id);
    try {
      const task = await taskService.getTask(reminder.taskId);
      if (!task || task.status !== "active") {
        removeDueReminder(reminder.id);
        return;
      }
      await openTaskDetails(task);
      removeDueReminder(reminder.id);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法打开提醒任务，请重试。");
    } finally {
      setActiveReminderActionId(null);
    }
  }

  async function handleCompleteReminderTask(reminder: DueReminder) {
    setActiveReminderActionId(reminder.id);
    try {
      const task = await taskService.getTask(reminder.taskId);
      if (!task || task.status !== "active") {
        removeDueReminder(reminder.id);
        return;
      }
      if (await handleCompleteTask(task)) removeDueReminder(reminder.id);
    } finally {
      setActiveReminderActionId(null);
    }
  }

  async function handleSnoozeReminder(reminder: DueReminder, remindAt: string) {
    setActiveReminderActionId(reminder.id);
    try {
      await reminderService.snoozeReminder(reminder.taskId, remindAt);
      removeDueReminder(reminder.id);
      setReminderNotice(`「${reminder.taskTitle}」会在 ${formatReminderTime(remindAt)} 再次提醒。`);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "设置稍后提醒失败，请重试。");
    } finally {
      setActiveReminderActionId(null);
    }
  }

  async function handleQuickReschedule(task: TaskRecord, target: QuickRescheduleTarget) {
    const today = toLocalDateValue();
    const scheduledDate =
      target === "tonight"
        ? today
        : target === "tomorrow"
          ? addDays(today, 1)
          : target === "nextWeek"
            ? nextMonday(today)
            : null;
    const rescheduleLabel =
      target === "tonight"
        ? "今晚"
        : target === "tomorrow"
          ? "明天"
          : target === "nextWeek"
            ? "下周"
            : "未指定日期";

    setTaskError(null);

    try {
      await taskService.updateTask(task.id, {
        scheduledDate,
        scheduledStartAt: null,
      });
      setLastTaskAction({
        kind: "rescheduled",
        previousSchedule: {
          estimatedMinutes: task.estimatedMinutes,
          scheduledDate: task.scheduledDate,
          scheduledStartAt: task.scheduledStartAt,
        },
        rescheduleLabel,
        task: { id: task.id, title: task.title },
      });
      await loadInboxTasks();
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
      if (activeView === "日历") await loadCalendarTasks();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "改期失败，请重试。");
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
      const { recurrenceFrequency, remindAt, ...taskInput } = input;
      const updatedTask = await taskService.updateTask(selectedTask.id, taskInput);
      await taskService.updateRecurrenceRule(
        updatedTask.id,
        recurrenceFrequency ? { frequency: recurrenceFrequency } : null,
      );
      await reminderService.setTaskReminder(updatedTask.id, remindAt);
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      setSelectedTask(null);
      setSelectedTaskReminder(null);
      if (activeView === "今日") await loadTodayTasks();
      if (activeView === "即将到来") await loadUpcomingTasks();
      if (activeView === "日历") await loadCalendarTasks();
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
    setSelectedTaskReminder(null);
    setSubtasks([]);
    setTaskTags([]);

    try {
      const [activeSubtasks, appliedTags, recurrenceRule, reminder] = await Promise.all([
        taskService.listActiveSubtasks(task.id),
        tagService.listTaskTags(task.id),
        taskService.getRecurrenceRule(task.id),
        reminderService.getPendingReminderForTask(task.id),
      ]);
      setSubtasks(activeSubtasks);
      setTaskTags(appliedTags);
      setSelectedTaskRecurrence(recurrenceRule);
      setSelectedTaskReminder(reminder);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取子任务，请重试。");
    }
  }

  async function handleRequestNotificationPermission() {
    setTaskError(null);
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "denied") {
      setTaskError("系统通知未开启。请前往系统设置 → 通知 → PerfectPlan 开启后再试。");
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
      if (activeView === "日历") await loadCalendarTasks();
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
      if (activeView === "日历") await loadCalendarTasks();
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
      } else if (lastTaskAction.kind === "rescheduled" && lastTaskAction.previousSchedule) {
        await taskService.updateTask(lastTaskAction.task.id, lastTaskAction.previousSchedule);
        await loadInboxTasks();
        if (activeView === "今日") await loadTodayTasks();
        if (activeView === "即将到来") await loadUpcomingTasks();
        if (activeView === "日历") await loadCalendarTasks();
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
        if (activeView === "日历") await loadCalendarTasks();
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
    setIsViewLoading(true);

    try {
      if (item === "收集箱") await loadInboxTasks();
      if (item === "今日") await loadTodayTasks();
      if (item === "即将到来") await loadUpcomingTasks();
      if (item === "日历") await loadCalendarTasks();
      if (item === "回收站") setTrashedTasks(await taskService.listTrashedTasks());
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取任务，请重试。");
    } finally {
      setIsViewLoading(false);
    }
  }

  async function handleUpcomingRangeChange(days: number) {
    const nextStartDate = addDays(upcomingStartDate, days);
    setUpcomingStartDate(nextStartDate);
    setSelectedUpcomingDate(nextStartDate);
    setTaskError(null);
    setIsViewLoading(true);

    try {
      await loadUpcomingTasks(nextStartDate);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取即将到来的任务，请重试。");
    } finally {
      setIsViewLoading(false);
    }
  }

  async function handleUpcomingReset() {
    const today = toLocalDateValue();
    setUpcomingStartDate(today);
    setSelectedUpcomingDate(today);
    setTaskError(null);
    setIsViewLoading(true);

    try {
      await loadUpcomingTasks(today);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取即将到来的任务，请重试。");
    } finally {
      setIsViewLoading(false);
    }
  }

  function handleCalendarNavigation(direction: -1 | 1) {
    setCalendarAnchorDate((currentDate) =>
      calendarViewMode === "month"
        ? addMonths(currentDate, direction)
        : addDays(currentDate, calendarViewMode === "week" ? direction * 7 : direction),
    );
  }

  function handleCalendarToday() {
    setCalendarAnchorDate(toLocalDateValue());
  }

  function openCalendarScheduleDialog(
    task: TaskRecord,
    scheduledDate = task.scheduledDate ?? calendarAnchorDate,
    startMinutes = minutesFromCalendarStartAt(task.scheduledStartAt) ?? 9 * 60,
  ) {
    setTaskError(null);
    setCalendarScheduleDraft({
      estimatedMinutes: task.estimatedMinutes ?? 30,
      isAllDay: !task.scheduledStartAt,
      scheduledDate,
      startMinutes: snapCalendarStart(startMinutes),
      task,
    });
  }

  function handleCalendarTaskKeyDown(event: ReactKeyboardEvent<HTMLElement>, task: TaskRecord) {
    if (event.key.toLowerCase() !== "a") return;
    event.preventDefault();
    openCalendarScheduleDialog(task);
  }

  async function saveCalendarSchedule(
    task: TaskRecord,
    input: UpdateTaskInput,
    rescheduleLabel: string,
  ) {
    const previousSchedule = {
      estimatedMinutes: task.estimatedMinutes,
      scheduledDate: task.scheduledDate,
      scheduledStartAt: task.scheduledStartAt,
    };
    const nextScheduledDate =
      "scheduledDate" in input ? (input.scheduledDate ?? null) : task.scheduledDate;
    const nextScheduledStartAt =
      "scheduledStartAt" in input ? (input.scheduledStartAt ?? null) : task.scheduledStartAt;
    const nextEstimatedMinutes =
      "estimatedMinutes" in input ? (input.estimatedMinutes ?? null) : task.estimatedMinutes;
    const isUnchanged =
      previousSchedule.scheduledDate === nextScheduledDate &&
      previousSchedule.scheduledStartAt === nextScheduledStartAt &&
      previousSchedule.estimatedMinutes === nextEstimatedMinutes;
    if (isUnchanged) return;

    setTaskError(null);
    const updatedTask = await taskService.updateTask(task.id, input);
    setCalendarTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === updatedTask.id ? updatedTask : currentTask,
      ),
    );
    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === updatedTask.id ? updatedTask : currentTask,
      ),
    );
    setLastTaskAction({
      kind: "rescheduled",
      previousSchedule,
      rescheduleLabel,
      task: { id: task.id, title: task.title },
    });
  }

  async function scheduleCalendarTask(
    task: TaskRecord,
    scheduledDate: string,
    startMinutes: number | null,
  ) {
    try {
      if (startMinutes === null) {
        await saveCalendarSchedule(
          task,
          { scheduledDate, scheduledStartAt: null },
          `${formatCalendarDay(scheduledDate)} 全天`,
        );
      } else {
        const normalizedStart = snapCalendarStart(startMinutes);
        const estimatedMinutes = snapCalendarDuration(
          normalizedStart,
          task.scheduledStartAt ? (task.estimatedMinutes ?? 60) : 60,
        );
        await saveCalendarSchedule(
          task,
          {
            estimatedMinutes,
            scheduledDate,
            scheduledStartAt: toCalendarStartAt(scheduledDate, normalizedStart),
          },
          `${formatCalendarDay(scheduledDate)} ${toTimeValue(normalizedStart)}`,
        );
      }
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "安排任务失败，请重试。");
      await loadCalendarTasks();
    }
  }

  function startCalendarTaskDrag(event: PointerEvent<HTMLElement>, task: TaskRecord) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    calendarPointerDragRef.current = {
      hasMoved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      task,
    };
  }

  function handleCalendarTaskClick(event: React.MouseEvent<HTMLElement>, task: TaskRecord) {
    if (suppressCalendarTaskClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    void openTaskDetails(task);
  }

  const scheduleCalendarPointerDrop = useEffectEvent(
    (task: TaskRecord, scheduledDate: string, startMinutes: number | null) => {
      void scheduleCalendarTask(task, scheduledDate, startMinutes);
    },
  );

  useEffect(() => {
    if (activeView !== "日历") return;

    function getDropTarget(clientX: number, clientY: number) {
      const element = document.elementFromPoint(clientX, clientY);
      const target = element?.closest<HTMLElement>("[data-calendar-drop-date]");
      const dropDate = target?.dataset.calendarDropDate ?? null;
      const rawDropKind = target?.dataset.calendarDropKind;
      const dropKind: CalendarDragPreview["dropKind"] =
        rawDropKind === "time" || rawDropKind === "all-day" ? rawDropKind : null;
      const rawDropStartMinutes = Number(target?.dataset.calendarDropStartMinutes);
      const dropStartMinutes =
        dropKind === "time" && Number.isFinite(rawDropStartMinutes) ? rawDropStartMinutes : null;
      return { dropDate, dropKind, dropStartMinutes, target };
    }

    function updatePointerDrag(event: globalThis.PointerEvent) {
      const drag = calendarPointerDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      if (!drag.hasMoved) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
        drag.hasMoved = true;
        document.body.style.userSelect = "none";
      }

      const { dropDate, dropKind, dropStartMinutes } = getDropTarget(event.clientX, event.clientY);
      setCalendarDragPreview({
        clientX: event.clientX,
        clientY: event.clientY,
        dropDate,
        dropKind,
        dropStartMinutes,
        task: drag.task,
      });
    }

    function finishPointerDrag(event: globalThis.PointerEvent) {
      const drag = calendarPointerDragRef.current;
      calendarPointerDragRef.current = null;
      document.body.style.userSelect = "";
      setCalendarDragPreview(null);
      if (!drag?.hasMoved) return;

      suppressCalendarTaskClickRef.current = true;
      window.setTimeout(() => {
        suppressCalendarTaskClickRef.current = false;
      }, 0);

      const { dropDate, dropKind, dropStartMinutes, target } = getDropTarget(
        event.clientX,
        event.clientY,
      );
      if (!dropDate || !dropKind || !target) return;

      const startMinutes =
        dropKind === "time"
          ? (dropStartMinutes ?? event.clientY - target.getBoundingClientRect().top + 6 * 60)
          : null;
      scheduleCalendarPointerDrop(drag.task, dropDate, startMinutes);
    }

    function cancelPointerDrag() {
      calendarPointerDragRef.current = null;
      document.body.style.userSelect = "";
      setCalendarDragPreview(null);
    }

    window.addEventListener("pointermove", updatePointerDrag);
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", cancelPointerDrag);
    return () => {
      window.removeEventListener("pointermove", updatePointerDrag);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", cancelPointerDrag);
      document.body.style.userSelect = "";
    };
  }, [activeView]);

  async function handleOpenProjectTasks(projectId: string) {
    setActiveTagId(null);
    setSearchQuery("");
    setSearchInputValue("");
    setPriorityFilter("all");
    setProjectFilter(projectId);
    setActiveView("收集箱");
    setIsViewLoading(true);
    try {
      await loadInboxTasks(null, "", projectId, "all");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取项目任务，请重试。");
    } finally {
      setIsViewLoading(false);
    }
  }

  function startCalendarResize(event: PointerEvent<HTMLButtonElement>, task: TaskRecord) {
    const startMinutes = minutesFromCalendarStartAt(task.scheduledStartAt);
    if (!task.scheduledDate || startMinutes === null) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialEstimatedMinutes = task.estimatedMinutes ?? 30;
    setCalendarResize({
      date: task.scheduledDate,
      estimatedMinutes: initialEstimatedMinutes,
      initialEstimatedMinutes,
      startMinutes,
      startY: event.clientY,
      task,
    });
  }

  function updateCalendarResize(event: PointerEvent<HTMLButtonElement>) {
    if (!calendarResize) return;
    const distance = event.clientY - calendarResize.startY;
    setCalendarResize((currentResize) =>
      currentResize
        ? {
            ...currentResize,
            estimatedMinutes: snapCalendarDuration(
              currentResize.startMinutes,
              currentResize.initialEstimatedMinutes + distance,
            ),
          }
        : null,
    );
  }

  function endCalendarResize(event: PointerEvent<HTMLButtonElement>) {
    if (!calendarResize) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const resize = calendarResize;
    setCalendarResize(null);
    if (resize.estimatedMinutes === resize.initialEstimatedMinutes) return;

    void saveCalendarSchedule(
      resize.task,
      { estimatedMinutes: resize.estimatedMinutes },
      `时长 ${resize.estimatedMinutes} 分钟`,
    ).catch(async (error) => {
      setTaskError(error instanceof Error ? error.message : "调整时长失败，请重试。");
      await loadCalendarTasks();
    });
  }

  async function handleSaveCalendarSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calendarScheduleDraft) return;

    setIsSavingCalendarSchedule(true);
    try {
      const { estimatedMinutes, isAllDay, scheduledDate, startMinutes, task } =
        calendarScheduleDraft;
      if (isAllDay) {
        await saveCalendarSchedule(
          task,
          { scheduledDate, scheduledStartAt: null },
          `${formatCalendarDay(scheduledDate)} 全天`,
        );
      } else {
        const normalizedStart = snapCalendarStart(startMinutes);
        const normalizedDuration = snapCalendarDuration(normalizedStart, estimatedMinutes);
        await saveCalendarSchedule(
          task,
          {
            estimatedMinutes: normalizedDuration,
            scheduledDate,
            scheduledStartAt: toCalendarStartAt(scheduledDate, normalizedStart),
          },
          `${formatCalendarDay(scheduledDate)} ${toTimeValue(normalizedStart)}`,
        );
      }
      setCalendarScheduleDraft(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "安排任务失败，请重试。");
      await loadCalendarTasks();
    } finally {
      setIsSavingCalendarSchedule(false);
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

  async function openDailyReview() {
    setTaskError(null);
    setDailyReviewMessage(null);

    try {
      const reviewTasks = await dailyPlanService.listDailyReviewTasks(toLocalDateValue());
      setDailyReviewTasks(reviewTasks);
      setSelectedCarryoverTaskIds(reviewTasks.map((task) => task.id));
      setIsDailyReviewOpen(true);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "无法读取今日未完成任务，请重试。");
    }
  }

  function toggleCarryoverTask(taskId: string) {
    setSelectedCarryoverTaskIds((currentTaskIds) =>
      currentTaskIds.includes(taskId)
        ? currentTaskIds.filter((currentTaskId) => currentTaskId !== taskId)
        : [...currentTaskIds, taskId],
    );
  }

  async function handleSaveDailyReview() {
    setTaskError(null);
    setIsSavingDailyReview(true);

    try {
      await dailyPlanService.createCarryoverSuggestions(
        selectedCarryoverTaskIds,
        addDays(toLocalDateValue(), 1),
      );
      setIsDailyReviewOpen(false);
      setDailyReviewTasks([]);
      setSelectedCarryoverTaskIds([]);
      setDailyReviewMessage(
        selectedCarryoverTaskIds.length > 0
          ? `已将 ${selectedCarryoverTaskIds.length} 项保留到明日建议。`
          : "今日收尾完成，没有任务被带到明天。",
      );
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "保存明日建议失败，请重试。");
    } finally {
      setIsSavingDailyReview(false);
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
  const isCalendar = activeView === "日历";
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
    ...todayCarryoverSuggestions.map((task) => task.id),
    ...todayScheduledTasks.map((task) => task.id),
    ...todayOverdueTasks.map((task) => task.id),
  ]);
  const todayCandidates = todayCandidateTasks.filter(
    (task) => !todayFocusTaskIds.has(task.id) && !todayOtherTaskIds.has(task.id),
  );
  const todayLabel = formatTodayLabel(toLocalDateValue());
  const upcomingEndDate = addDays(upcomingStartDate, 6);
  const upcomingDates = Array.from({ length: 7 }, (_, index) => addDays(upcomingStartDate, index));
  const calendarWeekStart = startOfWeek(calendarAnchorDate);
  const calendarMonthStart = (() => {
    const date = toLocalDate(calendarAnchorDate);
    date.setDate(1);
    return toLocalDateValue(date);
  })();
  const calendarMonthDates = Array.from({ length: 42 }, (_, index) =>
    addDays(startOfWeek(calendarMonthStart), index),
  );
  const calendarDates =
    calendarViewMode === "week"
      ? Array.from({ length: 7 }, (_, index) => addDays(calendarWeekStart, index))
      : [calendarAnchorDate];
  const calendarTimedTasksByDate = new Map(
    calendarDates.map((date) => [
      date,
      calendarTasks
        .filter((task) => task.scheduledDate === date && task.scheduledStartAt)
        .sort((left, right) =>
          (left.scheduledStartAt ?? "").localeCompare(right.scheduledStartAt ?? ""),
        ),
    ]),
  );
  const calendarDayLoadMinutesByDate = new Map(
    calendarDates.map((date) => [date, getCalendarDayLoadMinutes(calendarTasks, date)]),
  );
  const calendarTaskLayoutsById = new Map<string, { columnCount: number; columnIndex: number }>();
  const calendarConflictTaskIds = new Set<string>();
  calendarDates.forEach((date) => {
    const timedTasks = calendarTimedTasksByDate.get(date) ?? [];
    getCalendarTaskLayouts(timedTasks).forEach((layout) => {
      calendarTaskLayoutsById.set(layout.id, layout);
    });
    getCalendarConflictTaskIds(timedTasks).forEach((taskId) => calendarConflictTaskIds.add(taskId));
  });
  const calendarAllDayTasksByDate = new Map(
    calendarDates.map((date) => [
      date,
      calendarTasks
        .filter((task) => task.scheduledDate === date && !task.scheduledStartAt)
        .sort(
          (left, right) =>
            right.priority - left.priority || left.createdAt.localeCompare(right.createdAt),
        ),
    ]),
  );
  const calendarCandidateTasks = [...calendarTasks]
    .filter(
      (task) =>
        !task.scheduledDate ||
        calendarFocusTasks.some((focusTask) => focusTask.id === task.id) ||
        calendarOverdueTasks.some((overdueTask) => overdueTask.id === task.id),
    )
    .sort((left, right) => {
      const sourceRank = (task: TaskRecord) =>
        calendarOverdueTasks.some((overdueTask) => overdueTask.id === task.id)
          ? 0
          : calendarFocusTasks.some((focusTask) => focusTask.id === task.id)
            ? 1
            : 2;
      return (
        sourceRank(left) - sourceRank(right) ||
        right.priority - left.priority ||
        left.createdAt.localeCompare(right.createdAt)
      );
    });
  const calendarHours = Array.from({ length: 18 }, (_, index) => index + 6);
  const calendarHalfHourSlots = Array.from({ length: 36 }, (_, index) => 6 * 60 + index * 30);
  const calendarTimeDropDuration =
    calendarDragPreview?.dropKind === "time" && calendarDragPreview.dropStartMinutes !== null
      ? snapCalendarDuration(
          calendarDragPreview.dropStartMinutes,
          calendarDragPreview.task.scheduledStartAt
            ? (calendarDragPreview.task.estimatedMinutes ?? 60)
            : 60,
        )
      : null;
  const calendarBoardMinWidth = calendarViewMode === "week" ? 670 : 360;

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

  function calendarTaskColor(task: TaskRecord): string {
    return projects.find((project) => project.id === task.projectId)?.color ?? "#8bad99";
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
                  aria-current={item === activeView ? "page" : undefined}
                  className={item === activeView ? "nav-item is-active" : "nav-item"}
                  disabled={databaseState !== "ready"}
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
          disabled={databaseState !== "ready"}
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

        {databaseState === "loading" ? (
          <section aria-busy="true" aria-live="polite" className="app-state-panel is-loading">
            <span aria-hidden="true" className="state-spinner" />
            <div>
              <p className="eyebrow">本地优先</p>
              <h2>正在打开你的计划</h2>
              <p>任务、项目和标签只会从当前设备读取。</p>
            </div>
          </section>
        ) : databaseState === "error" ? (
          <section
            aria-labelledby="database-error-title"
            className="app-state-panel is-error"
            role="alert"
          >
            <span aria-hidden="true" className="state-icon">
              !
            </span>
            <div>
              <p className="eyebrow">本地数据库不可用</p>
              <h2 id="database-error-title">暂时无法打开你的计划</h2>
              <p>{databaseMessage}</p>
              <p className="state-help">
                请先重试；若仍失败，重启应用并确认磁盘空间充足。现有数据不会因重试而被删除。
              </p>
              <button
                className="primary-button"
                disabled={isRetryingDatabase}
                onClick={handleRetryDatabase}
                type="button"
              >
                {isRetryingDatabase ? "正在重试…" : "重新连接"}
              </button>
            </div>
          </section>
        ) : isViewLoading ? (
          <section
            aria-busy="true"
            aria-live="polite"
            className="app-state-panel is-loading is-compact"
          >
            <span aria-hidden="true" className="state-spinner" />
            <div>
              <h2>正在更新{activeView}</h2>
              <p>请稍候，数据仍保留在本机。</p>
            </div>
          </section>
        ) : isUpcoming ? (
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
                  <button
                    aria-pressed={date === selectedUpcomingDate}
                    className={[
                      "upcoming-day",
                      isTodayDate ? "is-today" : "",
                      date === selectedUpcomingDate ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={date}
                    onClick={() => setSelectedUpcomingDate(date)}
                    type="button"
                  >
                    <span>{weekday}</span>
                    <strong>{day}</strong>
                    <small>{taskCount > 0 ? `${taskCount} 项` : ""}</small>
                  </button>
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
                <section
                  aria-labelledby={`upcoming-${selectedUpcomingDate}`}
                  className={
                    upcomingTasks.some((task) => upcomingDisplayDate(task) === selectedUpcomingDate)
                      ? "upcoming-group"
                      : "upcoming-group is-empty"
                  }
                >
                  <div className="upcoming-group-heading">
                    <h3 id={`upcoming-${selectedUpcomingDate}`}>
                      {formatUpcomingDate(selectedUpcomingDate)}
                    </h3>
                    <span>
                      {upcomingTasks.filter(
                        (task) => upcomingDisplayDate(task) === selectedUpcomingDate,
                      ).length || "暂未安排"}
                    </span>
                  </div>
                  {upcomingTasks.filter(
                    (task) => upcomingDisplayDate(task) === selectedUpcomingDate,
                  ).length > 0 ? (
                    <ul className="today-task-list">
                      {upcomingTasks
                        .filter((task) => upcomingDisplayDate(task) === selectedUpcomingDate)
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
                            <QuickRescheduleButton
                              onReschedule={(selectedTask, target) =>
                                void handleQuickReschedule(selectedTask, target)
                              }
                              task={task}
                            />
                            {task.scheduledDate === selectedUpcomingDate ? (
                              <span className="upcoming-task-chip">计划</span>
                            ) : null}
                            {task.dueDate === selectedUpcomingDate ? (
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
                  ) : (
                    <p className="upcoming-selected-empty">这天没有已计划或临近截止的任务。</p>
                  )}
                </section>
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
              <div className="today-intro-actions">
                <span className="today-count">{todayFocusTasks.length}/3 个重点</span>
                <button
                  className="secondary-button daily-review-trigger"
                  onClick={() => void openDailyReview()}
                  type="button"
                >
                  每日收尾
                </button>
              </div>
            </div>
            {dailyReviewMessage ? (
              <p aria-live="polite" className="daily-review-message">
                {dailyReviewMessage}
              </p>
            ) : null}

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
                      <QuickRescheduleButton
                        onReschedule={(selectedTask, target) =>
                          void handleQuickReschedule(selectedTask, target)
                        }
                        task={task}
                      />
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
                        <QuickRescheduleButton
                          onReschedule={(selectedTask, target) =>
                            void handleQuickReschedule(selectedTask, target)
                          }
                          task={task}
                        />
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
                        <QuickRescheduleButton
                          onReschedule={(selectedTask, target) =>
                            void handleQuickReschedule(selectedTask, target)
                          }
                          task={task}
                        />
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

            {todayCarryoverSuggestions.length > 0 ? (
              <section
                aria-labelledby="today-carryover-title"
                className="today-section is-carryover"
              >
                <div className="today-section-header">
                  <div>
                    <p className="eyebrow">从昨日继续</p>
                    <h3 id="today-carryover-title">留给今天再决定</h3>
                  </div>
                  <span className="today-section-count">{todayCarryoverSuggestions.length}</span>
                </div>
                <p className="carryover-intro">这些任务仍保留在原项目中；需要时再设为今日重点。</p>
                <ul className="today-task-list">
                  {todayCarryoverSuggestions.map((task) => (
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
                      <QuickRescheduleButton
                        onReschedule={(selectedTask, target) =>
                          void handleQuickReschedule(selectedTask, target)
                        }
                        task={task}
                      />
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
                      <QuickRescheduleButton
                        onReschedule={(selectedTask, target) =>
                          void handleQuickReschedule(selectedTask, target)
                        }
                        task={task}
                      />
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
        ) : isCalendar ? (
          <section aria-labelledby="calendar-view-title" className="calendar-view">
            <div className="calendar-toolbar">
              <div>
                <p className="eyebrow">时间安排</p>
                <h2 id="calendar-view-title">
                  {calendarViewMode === "week"
                    ? `${formatCalendarDay(calendarDates[0] ?? calendarAnchorDate)} — ${formatCalendarDay(
                        calendarDates[calendarDates.length - 1] ?? calendarAnchorDate,
                      )}`
                    : calendarViewMode === "month"
                      ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(
                          toLocalDate(calendarAnchorDate),
                        )
                      : formatTodayLabel(calendarAnchorDate)}
                </h2>
              </div>
              <div className="calendar-toolbar-actions">
                <div aria-label="切换日历日期" className="calendar-nav-actions">
                  <button
                    aria-label={
                      calendarViewMode === "week"
                        ? "查看上一周"
                        : calendarViewMode === "month"
                          ? "查看上个月"
                          : "查看前一天"
                    }
                    className="range-nav-button"
                    onClick={() => handleCalendarNavigation(-1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <button className="secondary-button" onClick={handleCalendarToday} type="button">
                    今天
                  </button>
                  <button
                    aria-label={
                      calendarViewMode === "week"
                        ? "查看下一周"
                        : calendarViewMode === "month"
                          ? "查看下个月"
                          : "查看后一天"
                    }
                    className="range-nav-button"
                    onClick={() => handleCalendarNavigation(1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>
                <div aria-label="切换日历视图" className="calendar-view-switcher">
                  <button
                    aria-pressed={calendarViewMode === "month"}
                    onClick={() => setCalendarViewMode("month")}
                    type="button"
                  >
                    月
                  </button>
                  <button
                    aria-pressed={calendarViewMode === "week"}
                    onClick={() => setCalendarViewMode("week")}
                    type="button"
                  >
                    周
                  </button>
                  <button
                    aria-pressed={calendarViewMode === "day"}
                    onClick={() => setCalendarViewMode("day")}
                    type="button"
                  >
                    日
                  </button>
                </div>
              </div>
            </div>

            <div className="calendar-layout">
              {calendarViewMode === "month" ? (
                <div className="calendar-month-board">
                  <div className="calendar-month-weekdays" aria-hidden="true">
                    {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
                      <span key={weekday}>{weekday}</span>
                    ))}
                  </div>
                  <div className="calendar-month-grid">
                    {calendarMonthDates.map((date) => {
                      const isCurrentMonth = date.slice(0, 7) === calendarMonthStart.slice(0, 7);
                      const isTodayDate = date === toLocalDateValue();
                      const scheduledTasks = calendarTasks
                        .filter((task) => task.scheduledDate === date)
                        .sort(
                          (left, right) =>
                            Number(Boolean(right.scheduledStartAt)) -
                              Number(Boolean(left.scheduledStartAt)) ||
                            right.priority - left.priority ||
                            left.createdAt.localeCompare(right.createdAt),
                        );
                      const dueTasks = calendarTasks.filter(
                        (task) => task.dueDate === date && task.scheduledDate !== date,
                      );
                      const isOverloaded =
                        getCalendarDayLoadMinutes(calendarTasks, date) > CALENDAR_OVERLOAD_MINUTES;

                      return (
                        <div
                          className={[
                            isCurrentMonth ? "calendar-month-day" : "calendar-month-day is-outside",
                            calendarDragPreview?.dropDate === date ? "is-calendar-drop-target" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          data-calendar-drop-date={date}
                          data-calendar-drop-kind="all-day"
                          key={date}
                        >
                          <button
                            aria-label={`查看${formatCalendarDay(date)}`}
                            className={
                              isTodayDate ? "calendar-month-date is-today" : "calendar-month-date"
                            }
                            onClick={() => {
                              setCalendarAnchorDate(date);
                              setCalendarViewMode("day");
                            }}
                            type="button"
                          >
                            {toLocalDate(date).getDate()}
                          </button>
                          {isOverloaded ? (
                            <span className="calendar-month-overload">超载</span>
                          ) : null}
                          {scheduledTasks.slice(0, 3).map((task) => (
                            <button
                              className="calendar-month-task"
                              key={task.id}
                              onClick={(event) => handleCalendarTaskClick(event, task)}
                              onKeyDown={(event) => handleCalendarTaskKeyDown(event, task)}
                              onPointerDown={(event) => startCalendarTaskDrag(event, task)}
                              style={{ "--task-color": calendarTaskColor(task) } as CSSProperties}
                              type="button"
                            >
                              {task.scheduledStartAt
                                ? `${formatCalendarTime(task.scheduledStartAt)} `
                                : ""}
                              {task.title}
                            </button>
                          ))}
                          {scheduledTasks.length > 3 ? (
                            <button
                              className="calendar-month-more"
                              onClick={() => {
                                setCalendarAnchorDate(date);
                                setCalendarViewMode("day");
                              }}
                              type="button"
                            >
                              +{scheduledTasks.length - 3} 项
                            </button>
                          ) : null}
                          {dueTasks.slice(0, 1).map((task) => (
                            <span className="calendar-month-due" key={task.id}>
                              截止 {task.title}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="calendar-board">
                  <div
                    className="calendar-day-headings"
                    style={{
                      gridTemplateColumns: `54px repeat(${calendarDates.length}, minmax(88px, 1fr))`,
                      minWidth: `${calendarBoardMinWidth}px`,
                    }}
                  >
                    <span />
                    {calendarDates.map((date) => {
                      const isTodayDate = date === toLocalDateValue();
                      const dayMinutes = calendarDayLoadMinutesByDate.get(date) ?? 0;
                      const isOverloaded = dayMinutes > CALENDAR_OVERLOAD_MINUTES;

                      return (
                        <div
                          className={
                            isTodayDate ? "calendar-day-heading is-today" : "calendar-day-heading"
                          }
                          key={date}
                        >
                          <strong>
                            {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                              toLocalDate(date),
                            )}
                          </strong>
                          <span>{formatCalendarDay(date, false)}</span>
                          <small>
                            {dayMinutes > 0 ? `${Math.round(dayMinutes / 30) / 2} 小时` : ""}
                          </small>
                          {isOverloaded ? (
                            <span className="calendar-overload-badge" title="预计工作量超过 8 小时">
                              超载
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="calendar-all-day-row"
                    style={{
                      gridTemplateColumns: `54px repeat(${calendarDates.length}, minmax(88px, 1fr))`,
                      minWidth: `${calendarBoardMinWidth}px`,
                    }}
                  >
                    <span className="calendar-all-day-label">全天</span>
                    {calendarDates.map((date) => {
                      const allDayTasks = calendarAllDayTasksByDate.get(date) ?? [];

                      return (
                        <div
                          className={
                            calendarDragPreview?.dropDate === date
                              ? "calendar-all-day-cell is-calendar-drop-target"
                              : "calendar-all-day-cell"
                          }
                          data-calendar-drop-date={date}
                          data-calendar-drop-kind="all-day"
                          key={date}
                        >
                          {allDayTasks.length > 0 ? (
                            allDayTasks.map((task) => (
                              <button
                                className="calendar-all-day-task"
                                key={task.id}
                                onClick={(event) => handleCalendarTaskClick(event, task)}
                                onKeyDown={(event) => handleCalendarTaskKeyDown(event, task)}
                                onPointerDown={(event) => startCalendarTaskDrag(event, task)}
                                style={{ "--task-color": calendarTaskColor(task) } as CSSProperties}
                                type="button"
                              >
                                <span>{task.priority === 3 ? "高" : "全天"}</span>
                                {task.title}
                              </button>
                            ))
                          ) : (
                            <span className="calendar-empty-day">尚未安排</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="calendar-time-area"
                    style={{ minWidth: `${calendarBoardMinWidth}px` }}
                  >
                    <div className="calendar-time-axis" aria-hidden="true">
                      {calendarHours.map((hour) => (
                        <span key={hour}>{`${String(hour).padStart(2, "0")}:00`}</span>
                      ))}
                    </div>
                    <div
                      className="calendar-time-columns"
                      style={{
                        gridTemplateColumns: `repeat(${calendarDates.length}, minmax(88px, 1fr))`,
                      }}
                    >
                      {calendarDates.map((date) => {
                        const timedTasks = calendarTimedTasksByDate.get(date) ?? [];
                        const timeDropPreview =
                          calendarDragPreview?.dropDate === date &&
                          calendarDragPreview.dropKind === "time" &&
                          calendarDragPreview.dropStartMinutes !== null &&
                          calendarTimeDropDuration !== null
                            ? {
                                duration: calendarTimeDropDuration,
                                startMinutes: calendarDragPreview.dropStartMinutes,
                                task: calendarDragPreview.task,
                              }
                            : null;

                        return (
                          <div
                            className="calendar-time-column"
                            data-calendar-drop-date={date}
                            data-calendar-drop-kind="time"
                            key={date}
                          >
                            {calendarHalfHourSlots.map((startMinutes) => (
                              <div
                                aria-hidden="true"
                                className={[
                                  "calendar-time-slot",
                                  startMinutes % 60 === 0 ? "is-hour" : "",
                                  calendarDragPreview?.dropDate === date &&
                                  calendarDragPreview.dropKind === "time" &&
                                  calendarDragPreview.dropStartMinutes === startMinutes
                                    ? "is-calendar-drop-target"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                data-calendar-drop-date={date}
                                data-calendar-drop-kind="time"
                                data-calendar-drop-start-minutes={startMinutes}
                                key={startMinutes}
                                style={{ top: `${startMinutes - 6 * 60}px` }}
                              />
                            ))}
                            {timeDropPreview ? (
                              <div
                                aria-hidden="true"
                                className="calendar-time-drop-shadow"
                                style={
                                  {
                                    "--task-color": calendarTaskColor(timeDropPreview.task),
                                    height: `${timeDropPreview.duration}px`,
                                    top: `${timeDropPreview.startMinutes - 6 * 60}px`,
                                  } as CSSProperties
                                }
                              >
                                <span>{`${toTimeValue(timeDropPreview.startMinutes)} · ${timeDropPreview.duration} 分钟`}</span>
                              </div>
                            ) : null}
                            {timedTasks.map((task) => {
                              const estimatedMinutes = task.estimatedMinutes ?? 30;
                              const offsetMinutes = calendarTimeOffset(task.scheduledStartAt);
                              const isAfterDue = Boolean(
                                task.dueDate &&
                                task.scheduledDate &&
                                task.scheduledDate > task.dueDate,
                              );
                              const isConflict = calendarConflictTaskIds.has(task.id);
                              const hasTimezoneMismatch = hasCalendarTimezoneMismatch(task);
                              const isOutsideGrid = isCalendarTimeOutsideGrid(task);
                              const taskLayout = calendarTaskLayoutsById.get(task.id) ?? {
                                columnCount: 1,
                                columnIndex: 0,
                              };
                              const displayedMinutes =
                                calendarResize?.task.id === task.id
                                  ? calendarResize.estimatedMinutes
                                  : estimatedMinutes;

                              return (
                                <div
                                  className={[
                                    "calendar-time-task",
                                    isAfterDue ? "is-after-due" : "",
                                    isConflict ? "is-conflict" : "",
                                    hasTimezoneMismatch ? "has-timezone-mismatch" : "",
                                    isOutsideGrid ? "is-outside-grid" : "",
                                    calendarDragPreview?.task.id === task.id ? "is-dragging" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  key={task.id}
                                  onPointerDown={(event) => {
                                    if (calendarResize?.task.id !== task.id) {
                                      startCalendarTaskDrag(event, task);
                                    }
                                  }}
                                  style={
                                    {
                                      "--task-color": calendarTaskColor(task),
                                      height: `${Math.max(displayedMinutes, 30)}px`,
                                      left: `${5 + (90 * taskLayout.columnIndex) / taskLayout.columnCount}%`,
                                      top: `${offsetMinutes}px`,
                                      width: `${90 / taskLayout.columnCount}%`,
                                    } as CSSProperties
                                  }
                                >
                                  <button
                                    aria-keyshortcuts="A"
                                    aria-label={`${formatCalendarTime(task.scheduledStartAt)}，${task.title}；按 A 可安排到其他时间`}
                                    className="calendar-time-task-main"
                                    onClick={(event) => handleCalendarTaskClick(event, task)}
                                    onKeyDown={(event) => handleCalendarTaskKeyDown(event, task)}
                                    type="button"
                                  >
                                    <span>{formatCalendarTime(task.scheduledStartAt)}</span>
                                    <strong>{task.title}</strong>
                                    <small>
                                      {`${displayedMinutes} 分钟${isAfterDue ? " · 晚于截止日" : ""}${isConflict ? " · 时间冲突" : ""}${hasTimezoneMismatch ? " · 时区已变" : ""}${isOutsideGrid ? " · 超出日程范围" : ""}`}
                                    </small>
                                  </button>
                                  {calendarResize?.task.id === task.id ? (
                                    <span className="calendar-resize-duration">
                                      {displayedMinutes} 分钟
                                    </span>
                                  ) : null}
                                  <button
                                    aria-label={`上下拖动以调整「${task.title}」的时长`}
                                    className="calendar-resize-handle"
                                    onPointerCancel={() => setCalendarResize(null)}
                                    onPointerDown={(event) => startCalendarResize(event, task)}
                                    onPointerMove={updateCalendarResize}
                                    onPointerUp={endCalendarResize}
                                    title="上下拖动调整时长（每格 30 分钟）"
                                    type="button"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <aside aria-labelledby="calendar-candidates-title" className="calendar-candidates">
                <div>
                  <p className="eyebrow">待安排</p>
                  <h3 id="calendar-candidates-title">先决定放在哪天</h3>
                  <p>拖到日期安排全天，拖到时间网格安排具体时间；按 A 也可键盘安排。</p>
                </div>
                {calendarCandidateTasks.length > 0 ? (
                  <ul>
                    {calendarCandidateTasks.map((task) => {
                      const isOverdue = calendarOverdueTasks.some(
                        (overdueTask) => overdueTask.id === task.id,
                      );
                      const isFocus = calendarFocusTasks.some(
                        (focusTask) => focusTask.id === task.id,
                      );

                      return (
                        <li key={task.id}>
                          <button
                            aria-keyshortcuts="A"
                            className="calendar-candidate-task"
                            onClick={(event) => handleCalendarTaskClick(event, task)}
                            onKeyDown={(event) => handleCalendarTaskKeyDown(event, task)}
                            onPointerDown={(event) => startCalendarTaskDrag(event, task)}
                            style={{ "--task-color": calendarTaskColor(task) } as CSSProperties}
                            type="button"
                          >
                            <strong>{task.title}</strong>
                            <span>{isOverdue ? "已逾期" : isFocus ? "今日重点" : "未安排"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="calendar-candidates-empty">
                    <span aria-hidden="true">✦</span>
                    <strong>暂时没有待安排任务</strong>
                    <p>收集箱与今日重点会显示在这里。</p>
                  </div>
                )}
              </aside>
              {calendarDragPreview ? (
                <div
                  aria-hidden="true"
                  className="calendar-drag-preview"
                  style={
                    {
                      "--drag-x": `${calendarDragPreview.clientX}px`,
                      "--drag-y": `${calendarDragPreview.clientY}px`,
                      "--task-color": calendarTaskColor(calendarDragPreview.task),
                    } as CSSProperties
                  }
                >
                  <span>{calendarDragPreview.dropDate ? "安排到此处" : "拖到日期或时间格"}</span>
                  <strong>{calendarDragPreview.task.title}</strong>
                </div>
              ) : null}
            </div>
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
                    <QuickRescheduleButton
                      onReschedule={(selectedTask, target) =>
                        void handleQuickReschedule(selectedTask, target)
                      }
                      task={task}
                    />
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
                    <button
                      aria-label={`查看项目「${project.name}」下的所有任务`}
                      className="project-summary project-summary-button"
                      onClick={() => void handleOpenProjectTasks(project.id)}
                      type="button"
                    >
                      <strong>{project.name}</strong>
                      <span>
                        {tasks.filter((task) => task.projectId === project.id).length} 条活动任务
                      </span>
                    </button>
                    <div className="project-actions">
                      <button
                        className="secondary-button"
                        onClick={() => void handleOpenProjectTasks(project.id)}
                        type="button"
                      >
                        查看任务
                      </button>
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
          <div className="task-error" role="alert">
            <span>{taskError}</span>
            {databaseState === "ready" ? (
              <button onClick={() => void handleNavigation(activeView)} type="button">
                再试一次
              </button>
            ) : null}
          </div>
        ) : null}

        {lastTaskAction ? (
          <div className="undo-toast" aria-live="polite">
            <span>
              {lastTaskAction.kind === "created"
                ? `已添加「${lastTaskAction.task.title}」`
                : lastTaskAction.kind === "completed"
                  ? `已完成「${lastTaskAction.task.title}」`
                  : lastTaskAction.kind === "rescheduled"
                    ? `已将「${lastTaskAction.task.title}」改期到${lastTaskAction.rescheduleLabel}`
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

        {reminderNotice ? (
          <div
            className={
              dueReminders.length > 0 ? "reminder-toast has-action-center" : "reminder-toast"
            }
            role="status"
          >
            <span>{reminderNotice}</span>
            <button onClick={() => setReminderNotice(null)} type="button">
              知道了
            </button>
          </div>
        ) : null}

        {dueReminders.length > 0 ? (
          <aside aria-live="assertive" className="reminder-action-center" aria-label="到期提醒">
            <div className="reminder-action-heading">
              <div>
                <p className="eyebrow">到期提醒</p>
                <h2>{dueReminders.length} 件事正在等你</h2>
              </div>
              <span>应用内操作</span>
            </div>
            <ul>
              {dueReminders.map((reminder) => {
                const isWorking = activeReminderActionId === reminder.id;

                return (
                  <li key={reminder.id}>
                    <div>
                      <strong>{reminder.taskTitle}</strong>
                      <span>提醒时间：{formatReminderTime(reminder.remindAt)}</span>
                    </div>
                    <div className="reminder-action-buttons">
                      <button
                        disabled={isWorking}
                        onClick={() => void handleOpenReminderTask(reminder)}
                        type="button"
                      >
                        打开任务
                      </button>
                      <button
                        disabled={isWorking}
                        onClick={() => void handleCompleteReminderTask(reminder)}
                        type="button"
                      >
                        完成
                      </button>
                      <button
                        disabled={isWorking}
                        onClick={() =>
                          void handleSnoozeReminder(
                            reminder,
                            new Date(Date.now() + 30 * 60_000).toISOString(),
                          )
                        }
                        type="button"
                      >
                        30 分钟后
                      </button>
                      <button
                        disabled={isWorking}
                        onClick={() =>
                          void handleSnoozeReminder(
                            reminder,
                            reminderTimeTomorrow(reminder.remindAt),
                          )
                        }
                        type="button"
                      >
                        明天
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
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
              trapFocusInDialog(event);
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

      {calendarScheduleDraft ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="calendar-schedule-description"
            aria-labelledby="calendar-schedule-title"
            aria-modal="true"
            className="calendar-schedule-dialog"
            role="dialog"
            onKeyDown={(event) => {
              trapFocusInDialog(event);
              if (event.key === "Escape" && !isSavingCalendarSchedule) {
                setCalendarScheduleDraft(null);
                setTaskError(null);
              }
            }}
          >
            <div className="quick-add-header">
              <div>
                <p className="eyebrow">时间安排</p>
                <h2 id="calendar-schedule-title">安排「{calendarScheduleDraft.task.title}」</h2>
              </div>
              <button
                aria-label="关闭安排任务窗口"
                className="icon-button"
                disabled={isSavingCalendarSchedule}
                onClick={() => setCalendarScheduleDraft(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <p id="calendar-schedule-description">
              选择全天，或为任务指定开始时间与预计时长。所有时间均按本机时区保存。
            </p>
            <form
              className="calendar-schedule-form"
              onSubmit={(event) => void handleSaveCalendarSchedule(event)}
            >
              <label>
                日期
                <input
                  disabled={isSavingCalendarSchedule}
                  onChange={(event) =>
                    setCalendarScheduleDraft((current) =>
                      current ? { ...current, scheduledDate: event.target.value } : null,
                    )
                  }
                  required
                  type="date"
                  value={calendarScheduleDraft.scheduledDate}
                />
              </label>
              <div aria-label="安排方式" className="calendar-schedule-mode">
                <button
                  aria-pressed={calendarScheduleDraft.isAllDay}
                  disabled={isSavingCalendarSchedule}
                  onClick={() =>
                    setCalendarScheduleDraft((current) =>
                      current ? { ...current, isAllDay: true } : null,
                    )
                  }
                  type="button"
                >
                  全天
                </button>
                <button
                  aria-pressed={!calendarScheduleDraft.isAllDay}
                  disabled={isSavingCalendarSchedule}
                  onClick={() =>
                    setCalendarScheduleDraft((current) =>
                      current ? { ...current, isAllDay: false } : null,
                    )
                  }
                  type="button"
                >
                  具体时间
                </button>
              </div>
              {!calendarScheduleDraft.isAllDay ? (
                <div className="calendar-schedule-grid">
                  <label>
                    开始时间
                    <select
                      disabled={isSavingCalendarSchedule}
                      onChange={(event) =>
                        setCalendarScheduleDraft((current) =>
                          current ? { ...current, startMinutes: Number(event.target.value) } : null,
                        )
                      }
                      value={calendarScheduleDraft.startMinutes}
                    >
                      {getCalendarTimeOptions().map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    预计时长（分钟）
                    <input
                      disabled={isSavingCalendarSchedule}
                      max={24 * 60 - calendarScheduleDraft.startMinutes}
                      min={30}
                      onChange={(event) =>
                        setCalendarScheduleDraft((current) =>
                          current
                            ? {
                                ...current,
                                estimatedMinutes: Number(event.target.value) || 30,
                              }
                            : null,
                        )
                      }
                      step={15}
                      type="number"
                      value={calendarScheduleDraft.estimatedMinutes}
                    />
                  </label>
                </div>
              ) : null}
              {taskError ? <p className="form-error">{taskError}</p> : null}
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  disabled={isSavingCalendarSchedule}
                  onClick={() => setCalendarScheduleDraft(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={isSavingCalendarSchedule}
                  type="submit"
                >
                  {isSavingCalendarSchedule ? "正在保存…" : "保存安排"}
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
              trapFocusInDialog(event);
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
              setSelectedTaskReminder(null);
              setTaskError(null);
            }
          }}
          onCompleteSubtask={(subtaskId) => void handleCompleteSubtask(subtaskId)}
          onCreateSubtask={(title) => void handleCreateSubtask(title)}
          onCreateTag={(name) => void handleCreateTag(name)}
          onRequestNotificationPermission={() => void handleRequestNotificationPermission()}
          onSave={(input) => void handleSaveTaskDetails(input)}
          onToggleTag={(tagId) => void handleToggleTag(tagId)}
          notificationPermission={notificationPermission}
          projects={projects}
          recurrenceRule={selectedTaskRecurrence}
          reminder={selectedTaskReminder}
          subtasks={subtasks}
          tags={tags}
          task={selectedTask}
          taskTags={taskTags}
        />
      ) : null}

      {isDailyReviewOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="daily-review-description"
            aria-labelledby="daily-review-title"
            aria-modal="true"
            className="daily-review-dialog"
            role="dialog"
            onKeyDown={(event) => {
              trapFocusInDialog(event);
              if (event.key === "Escape" && !isSavingDailyReview) setIsDailyReviewOpen(false);
            }}
          >
            <div className="quick-add-header">
              <div>
                <p className="eyebrow">每日收尾</p>
                <h2 id="daily-review-title">把未完成留给明天</h2>
              </div>
              <button
                aria-label="关闭每日收尾"
                className="icon-button"
                disabled={isSavingDailyReview}
                onClick={() => setIsDailyReviewOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <p id="daily-review-description">
              勾选的任务会出现在明天的建议区域，不会改变原项目、任务状态或计划日期。
            </p>
            {dailyReviewTasks.length > 0 ? (
              <ul className="daily-review-list">
                {dailyReviewTasks.map((task) => {
                  const isSelected = selectedCarryoverTaskIds.includes(task.id);

                  return (
                    <li key={task.id}>
                      <label>
                        <input
                          checked={isSelected}
                          disabled={isSavingDailyReview}
                          onChange={() => toggleCarryoverTask(task.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{task.title}</strong>
                          <small>
                            {task.scheduledDate === toLocalDateValue() ? "今日已安排" : "今日重点"}
                          </small>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="daily-review-empty">
                <span aria-hidden="true">✓</span>
                <strong>今天没有需要继续的任务</strong>
                <p>已安排与今日重点都已完成，安心收尾吧。</p>
              </div>
            )}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={isSavingDailyReview}
                onClick={() => setIsDailyReviewOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={isSavingDailyReview}
                onClick={() => void handleSaveDailyReview()}
                type="button"
              >
                {isSavingDailyReview
                  ? "正在保存…"
                  : dailyReviewTasks.length > 0
                    ? `保留 ${selectedCarryoverTaskIds.length} 项到明天`
                    : "完成收尾"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isProjectCreateOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="create-project-title"
            aria-modal="true"
            className="quick-add-dialog"
            role="dialog"
            onKeyDown={(event) => {
              trapFocusInDialog(event);
              if (event.key === "Escape" && !isSavingProject) setIsProjectCreateOpen(false);
            }}
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
            onKeyDown={(event) => {
              trapFocusInDialog(event);
              if (event.key === "Escape" && !isSavingProject) setSelectedProject(null);
            }}
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
