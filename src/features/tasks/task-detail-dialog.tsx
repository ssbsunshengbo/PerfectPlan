import { FormEvent, type CSSProperties, type ReactNode, useState } from "react";

import { trapFocusInDialog } from "../../app/accessibility";
import type { ProjectRecord } from "../projects/project-types";
import type { NotificationPermissionState } from "../reminders/notification-service";
import type { ReminderRecord } from "../reminders/reminder-types";
import type { TagRecord } from "../tags/tag-types";
import { getDisplayTagColor } from "../tags/tag-input";
import {
  type RecurrenceFrequency,
  type RecurrenceRule,
  type TaskPriority,
  type TaskRecord,
} from "./task-types";
import type { UpdateTaskInput } from "./task-service";

export type TaskDetailSaveInput = UpdateTaskInput & {
  remindAt: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
};

type TaskDetailDialogProps = {
  error: string | null;
  isSaving: boolean;
  isSavingSubtask: boolean;
  isSavingTag: boolean;
  onClose: () => void;
  onCompleteSubtask: (subtaskId: string) => void;
  onCreateSubtask: (title: string) => void;
  onCreateTag: (name: string) => void;
  onRequestNotificationPermission: () => void;
  onSave: (input: TaskDetailSaveInput) => void;
  onToggleTag: (tagId: string) => void;
  notificationPermission: NotificationPermissionState;
  projects: ProjectRecord[];
  recurrenceRule: RecurrenceRule | null;
  reminder: ReminderRecord | null;
  subtasks: TaskRecord[];
  tags: TagRecord[];
  taskTags: TagRecord[];
  task: TaskRecord;
};

type TaskDetailDraft = {
  dueDate: string;
  estimatedMinutes: string;
  notes: string;
  projectId: string;
  priority: TaskPriority;
  reminderDate: string;
  reminderTime: string;
  scheduledDate: string;
  scheduledTime: string;
  title: string;
};

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: "无优先级", value: 0 },
  { label: "低", value: 1 },
  { label: "中", value: 2 },
  { label: "高", value: 3 },
];

const recurrenceOptions: Array<{ label: string; value: "" | RecurrenceFrequency }> = [
  { label: "不重复", value: "" },
  { label: "每天", value: "daily" },
  { label: "工作日（周一至周五）", value: "weekdays" },
  { label: "每周（当前计划日）", value: "weekly" },
  { label: "每月（当前日期）", value: "monthly" },
];

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
const durationPresets = [30, 45, 60, 90, 120];
const timeOptions = Array.from({ length: 94 }, (_, index) => {
  const totalMinutes = index * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
});

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string | number;
};

function SelectField({
  disabled,
  id,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  value: string | number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="select-field">
      <span id={`${id}-label`}>{label}</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        className="select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{selectedOption?.label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div aria-label={label} className="select-popover" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={isSelected ? "is-selected" : ""}
                disabled={option.disabled}
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {isSelected ? <span aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DatePickerField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const selectedDate = parseDateValue(value);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date());
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarDays = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : new Date(year, month, index - firstWeekday + 1),
  );

  function chooseDate(date: Date) {
    onChange(toDateValue(date));
    setIsOpen(false);
  }

  return (
    <div className="date-field">
      <span id={`${id}-label`}>{label}</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label`}
        className={value ? "date-picker-trigger has-value" : "date-picker-trigger"}
        disabled={disabled}
        onClick={() => {
          setVisibleMonth(selectedDate ?? new Date());
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <span>{value || "选择日期"}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div aria-label={`${label}日历`} className="calendar-popover" role="dialog">
          <div className="calendar-heading">
            <button
              aria-label="上个月"
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
              type="button"
            >
              ‹
            </button>
            <strong>{`${year} 年 ${month + 1} 月`}</strong>
            <button
              aria-label="下个月"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
              type="button"
            >
              ›
            </button>
          </div>
          <div className="calendar-weekdays">
            {weekdayLabels.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-days">
            {calendarDays.map((date, index) =>
              date ? (
                <button
                  className={toDateValue(date) === value ? "is-selected" : ""}
                  key={toDateValue(date)}
                  onClick={() => chooseDate(date)}
                  type="button"
                >
                  {date.getDate()}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              ),
            )}
          </div>
          <div className="calendar-actions">
            <button onClick={() => onChange("")} type="button">
              清除
            </button>
            <button onClick={() => chooseDate(new Date())} type="button">
              今天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimePickerField({
  disabled,
  emptyLabel = "全天，不设具体时间",
  id,
  label = "具体时间（可选）",
  onChange,
  value,
}: {
  disabled: boolean;
  emptyLabel?: string;
  id: string;
  label?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="time-picker-field">
      <span id={`${id}-label`}>{label}</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        className={value ? "date-picker-trigger has-value" : "date-picker-trigger"}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{value || emptyLabel}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div aria-label={`选择${label}`} className="time-picker-popover" role="listbox">
          <button
            aria-selected={!value}
            className={!value ? "is-selected time-clear-option" : "time-clear-option"}
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            role="option"
            type="button"
          >
            {emptyLabel}
          </button>
          <div className="time-option-grid">
            {timeOptions.map((time) => (
              <button
                aria-selected={time === value}
                className={time === value ? "is-selected" : ""}
                key={time}
                onClick={() => {
                  onChange(time);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DurationField({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="duration-field">
      <span id={`${id}-label`}>预计时长</span>
      <div aria-labelledby={`${id}-label`} className="duration-presets">
        {durationPresets.map((minutes) => (
          <button
            aria-pressed={value === String(minutes)}
            disabled={disabled}
            key={minutes}
            onClick={() => onChange(String(minutes))}
            type="button"
          >
            {minutes} 分钟
          </button>
        ))}
      </div>
      <label className="duration-custom-input" htmlFor={id}>
        <span>自定义</span>
        <input
          disabled={disabled}
          id={id}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          pattern="[0-9]*"
          placeholder="例如：75"
          type="text"
          value={value}
        />
        <span>分钟</span>
      </label>
    </div>
  );
}

function TaskDetailSection({
  children,
  defaultOpen = false,
  summary,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  summary: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={isOpen ? "task-detail-section is-open" : "task-detail-section"}>
      <button
        aria-expanded={isOpen}
        className="task-detail-section-toggle"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{title}</span>
        <span className="task-detail-section-summary">
          {summary}
          <i aria-hidden="true" />
        </span>
      </button>
      {isOpen ? <div className="task-detail-section-content">{children}</div> : null}
    </section>
  );
}

function toLocalTime(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function exceedsLocalDay(scheduledDate: string, scheduledTime: string, minutes: number): boolean {
  const start = new Date(`${scheduledDate}T${scheduledTime}`);
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const nextDay = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1);

  return start.getTime() + minutes * 60_000 > nextDay.getTime();
}

function toDraft(task: TaskRecord, reminder: ReminderRecord | null): TaskDetailDraft {
  return {
    dueDate: task.dueDate ?? "",
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    notes: task.notes,
    projectId: task.projectId ?? "",
    priority: task.priority,
    reminderDate: reminder ? toDateValue(new Date(reminder.remindAt)) : "",
    reminderTime: reminder ? toLocalTime(reminder.remindAt) : "",
    scheduledDate: task.scheduledDate ?? "",
    scheduledTime: toLocalTime(task.scheduledStartAt),
    title: task.title,
  };
}

export function TaskDetailDialog({
  error,
  isSaving,
  isSavingSubtask,
  isSavingTag,
  onClose,
  onCompleteSubtask,
  onCreateSubtask,
  onCreateTag,
  onRequestNotificationPermission,
  onSave,
  onToggleTag,
  notificationPermission,
  projects,
  recurrenceRule,
  reminder,
  subtasks,
  tags,
  task,
  taskTags,
}: TaskDetailDialogProps) {
  const [draft, setDraft] = useState(() => toDraft(task, reminder));
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [tagName, setTagName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"" | RecurrenceFrequency>(
    recurrenceRule?.frequency ?? "",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const scheduledDate = draft.scheduledDate || null;
    const scheduledTime = draft.scheduledTime || null;
    const estimatedMinutes = draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null;
    const reminderDate = draft.reminderDate || null;
    const reminderTime = draft.reminderTime || null;

    if (scheduledTime && !scheduledDate) {
      setValidationError("设置具体时间前，请先选择计划日期。");
      return;
    }
    if (
      estimatedMinutes !== null &&
      (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)
    ) {
      setValidationError("预计时长必须是大于 0 的整数分钟。");
      return;
    }
    if (recurrenceFrequency && !scheduledDate) {
      setValidationError("设置重复前，请先选择计划日期。");
      return;
    }
    if ((reminderDate && !reminderTime) || (!reminderDate && reminderTime)) {
      setValidationError("提醒需要同时设置日期和时间。");
      return;
    }
    const remindAt =
      reminderDate && reminderTime
        ? new Date(`${reminderDate}T${reminderTime}`).toISOString()
        : null;
    if (remindAt && Date.parse(remindAt) <= Date.now()) {
      setValidationError("提醒时间需要晚于现在。");
      return;
    }
    if (
      scheduledDate &&
      scheduledTime &&
      estimatedMinutes !== null &&
      exceedsLocalDay(scheduledDate, scheduledTime, estimatedMinutes)
    ) {
      setValidationError("计划时长不能跨越到下一天。请调整时间或时长。");
      return;
    }

    onSave({
      dueDate: draft.dueDate || null,
      estimatedMinutes,
      notes: draft.notes,
      priority: draft.priority,
      projectId: draft.projectId || null,
      remindAt,
      scheduledDate,
      scheduledStartAt:
        scheduledDate && scheduledTime
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : null,
      title: draft.title,
      recurrenceFrequency: recurrenceFrequency || null,
    });
  }

  function handleCreateSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!subtaskTitle.trim()) {
      setValidationError("子任务标题不能为空。");
      return;
    }

    setValidationError(null);
    onCreateSubtask(subtaskTitle);
    setSubtaskTitle("");
  }

  function handleCreateTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tagName.trim()) {
      setValidationError("标签名称不能为空。");
      return;
    }

    setValidationError(null);
    onCreateTag(tagName);
    setTagName("");
  }

  const scheduleAfterDue = Boolean(
    draft.scheduledDate && draft.dueDate && draft.scheduledDate > draft.dueDate,
  );
  const visibleError = validationError ?? error;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="task-details-title"
        aria-modal="true"
        className="task-details-dialog"
        role="dialog"
        onKeyDown={(event) => {
          trapFocusInDialog(event);
          if (event.key === "Escape" && !isSaving) onClose();
        }}
      >
        <div className="quick-add-header">
          <div>
            <p className="eyebrow">任务详情</p>
            <h2 id="task-details-title">一件待办</h2>
          </div>
          <button
            aria-label="关闭任务详情"
            className="icon-button"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="task-details-form" id="task-details-form" onSubmit={handleSubmit}>
          <label className="task-title-field" htmlFor="task-detail-title">
            <span>任务标题</span>
            <input
              autoFocus
              disabled={isSaving}
              id="task-detail-title"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="写下下一件要做的事"
              value={draft.title}
            />
          </label>

          <div className="task-identity-fields">
            <SelectField
              disabled={isSaving}
              id="task-detail-project"
              label="项目"
              onChange={(projectId) =>
                setDraft((current) => ({ ...current, projectId: String(projectId) }))
              }
              options={[
                { label: "收集箱", value: "" },
                ...projects.map((project) => ({
                  disabled: project.status === "archived" && project.id !== draft.projectId,
                  label: project.status === "archived" ? `${project.name}（已归档）` : project.name,
                  value: project.id,
                })),
              ]}
              value={draft.projectId}
            />
            <SelectField
              disabled={isSaving}
              id="task-detail-priority"
              label="优先级"
              onChange={(priority) =>
                setDraft((current) => ({ ...current, priority: Number(priority) as TaskPriority }))
              }
              options={priorityOptions}
              value={draft.priority}
            />
          </div>

          <TaskDetailSection
            defaultOpen
            summary={
              draft.scheduledTime
                ? `${draft.scheduledDate} · ${draft.scheduledTime}`
                : draft.scheduledDate
                  ? `${draft.scheduledDate} · 全天`
                  : "未安排"
            }
            title="安排"
          >
            <p className="task-detail-section-description">
              计划日期决定它何时出现；具体时间和时长才会占用日历。
            </p>
            <div className="detail-field-grid">
              <DatePickerField
                disabled={isSaving}
                id="task-detail-scheduled-date"
                label="计划日期"
                onChange={(scheduledDate) =>
                  setDraft((current) => ({
                    ...current,
                    scheduledDate,
                    scheduledTime: scheduledDate ? current.scheduledTime : "",
                  }))
                }
                value={draft.scheduledDate}
              />
              <TimePickerField
                disabled={isSaving || !draft.scheduledDate}
                id="task-detail-scheduled-time"
                onChange={(scheduledTime) =>
                  setDraft((current) => ({
                    ...current,
                    estimatedMinutes:
                      scheduledTime && !current.estimatedMinutes ? "30" : current.estimatedMinutes,
                    scheduledTime,
                  }))
                }
                value={draft.scheduledTime}
              />
            </div>
            <DurationField
              disabled={isSaving}
              id="task-detail-estimate"
              onChange={(estimatedMinutes) =>
                setDraft((current) => ({ ...current, estimatedMinutes }))
              }
              value={draft.estimatedMinutes}
            />
            <DatePickerField
              disabled={isSaving}
              id="task-detail-due-date"
              label="截止日期"
              onChange={(dueDate) => setDraft((current) => ({ ...current, dueDate }))}
              value={draft.dueDate}
            />
            {scheduleAfterDue ? (
              <p className="schedule-warning">
                计划日期晚于截止日期；会保留此安排并在后续视图中提示。
              </p>
            ) : null}
          </TaskDetailSection>

          <TaskDetailSection
            defaultOpen={Boolean(draft.notes)}
            summary={draft.notes ? "已添加" : "添加备注"}
            title="备注"
          >
            <textarea
              disabled={isSaving}
              id="task-detail-notes"
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="补充背景、下一步或相关链接"
              rows={4}
              value={draft.notes}
            />
          </TaskDetailSection>

          <TaskDetailSection
            defaultOpen={Boolean(draft.reminderDate)}
            summary={draft.reminderDate ? `${draft.reminderDate} ${draft.reminderTime}` : "未设置"}
            title="提醒"
          >
            <div className="detail-field-grid">
              <DatePickerField
                disabled={isSaving}
                id="task-detail-reminder-date"
                label="提醒日期"
                onChange={(reminderDate) => setDraft((current) => ({ ...current, reminderDate }))}
                value={draft.reminderDate}
              />
              <TimePickerField
                disabled={isSaving || !draft.reminderDate}
                emptyLabel="选择提醒时间"
                id="task-detail-reminder-time"
                label="提醒时间"
                onChange={(reminderTime) => setDraft((current) => ({ ...current, reminderTime }))}
                value={draft.reminderTime}
              />
            </div>
            {notificationPermission === "granted" ? (
              <p className="reminder-note">系统通知已开启。应用运行期间，到点会显示提醒。</p>
            ) : (
              <div className="reminder-permission-note">
                <p>
                  {notificationPermission === "denied"
                    ? "系统通知被拒绝。请前往系统设置 → 通知 → PerfectPlan 开启后再试。"
                    : "系统通知尚未开启。保存提醒后可授权，以便到点收到系统通知。"}
                </p>
                <button
                  className="secondary-button"
                  disabled={isSaving}
                  onClick={onRequestNotificationPermission}
                  type="button"
                >
                  开启系统通知
                </button>
              </div>
            )}
            <p className="reminder-note">
              应用完全退出时不会触发提醒；后台运行能力将在后续版本验证。
            </p>
          </TaskDetailSection>

          <TaskDetailSection
            defaultOpen={Boolean(recurrenceFrequency)}
            summary={
              recurrenceFrequency
                ? (recurrenceOptions.find((option) => option.value === recurrenceFrequency)
                    ?.label ?? "已设置")
                : "不重复"
            }
            title="重复"
          >
            <SelectField
              disabled={isSaving}
              id="task-detail-recurrence"
              label="重复规则"
              onChange={(frequency) =>
                setRecurrenceFrequency(String(frequency) as "" | RecurrenceFrequency)
              }
              options={recurrenceOptions.map((option) => ({
                ...option,
                disabled: Boolean(option.value && !draft.scheduledDate),
              }))}
              value={recurrenceFrequency}
            />
            {recurrenceFrequency ? (
              <p className="recurrence-note">
                将沿用项目、标签、优先级和时间安排；修改只影响本次任务。
              </p>
            ) : null}
          </TaskDetailSection>
          {visibleError ? <p className="form-error">{visibleError}</p> : null}
        </form>

        <TaskDetailSection
          defaultOpen={taskTags.length > 0}
          summary={taskTags.length ? `${taskTags.length} 个标签` : "未添加"}
          title="标签"
        >
          {tags.length > 0 ? (
            <div className="tag-picker" aria-label="选择标签">
              {tags.map((tag) => {
                const isSelected = taskTags.some((taskTag) => taskTag.id === tag.id);

                return (
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? "tag-chip is-selected" : "tag-chip"}
                    disabled={isSavingTag}
                    key={tag.id}
                    onClick={() => onToggleTag(tag.id)}
                    style={{ "--tag-color": getDisplayTagColor(tag) } as CSSProperties}
                    type="button"
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="subtask-empty">标签可以跨项目组织任务。</p>
          )}
          <form className="subtask-create-form" onSubmit={handleCreateTag}>
            <input
              disabled={isSavingTag}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="新建标签"
              value={tagName}
            />
            <button className="secondary-button" disabled={isSavingTag} type="submit">
              {isSavingTag ? "正在创建…" : "创建"}
            </button>
          </form>
        </TaskDetailSection>

        <TaskDetailSection
          defaultOpen={subtasks.length > 0}
          summary={subtasks.length ? `${subtasks.length} 项` : "未添加"}
          title="子任务"
        >
          {subtasks.length > 0 ? (
            <ul className="subtask-list">
              {subtasks.map((subtask) => {
                const isCompleted = subtask.status === "completed";

                return (
                  <li className={isCompleted ? "is-completed" : ""} key={subtask.id}>
                    <button
                      aria-label={`${isCompleted ? "已完成" : "完成"}子任务：${subtask.title}`}
                      className={
                        isCompleted ? "task-complete-button is-completed" : "task-complete-button"
                      }
                      disabled={isSavingSubtask || isCompleted}
                      onClick={() => onCompleteSubtask(subtask.id)}
                      type="button"
                    />
                    <span>{subtask.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="subtask-empty">把一件大事拆成几个可执行的小步骤。</p>
          )}
          <form className="subtask-create-form" onSubmit={handleCreateSubtask}>
            <input
              disabled={isSavingSubtask}
              onChange={(event) => setSubtaskTitle(event.target.value)}
              placeholder="添加子任务"
              value={subtaskTitle}
            />
            <button className="secondary-button" disabled={isSavingSubtask} type="submit">
              {isSavingSubtask ? "正在添加…" : "添加"}
            </button>
          </form>
        </TaskDetailSection>

        <div className="dialog-actions task-detail-actions">
          <button className="secondary-button" disabled={isSaving} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={isSaving}
            form="task-details-form"
            type="submit"
          >
            {isSaving ? "正在保存…" : "保存任务"}
          </button>
        </div>
      </section>
    </div>
  );
}
