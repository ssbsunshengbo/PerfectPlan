import { FormEvent, useState } from "react";

import type { ProjectRecord } from "../projects/project-types";
import type { TagRecord } from "../tags/tag-types";
import { type TaskPriority, type TaskRecord } from "./task-types";
import type { UpdateTaskInput } from "./task-service";

type TaskDetailDialogProps = {
  error: string | null;
  isSaving: boolean;
  isSavingSubtask: boolean;
  isSavingTag: boolean;
  onClose: () => void;
  onCompleteSubtask: (subtaskId: string) => void;
  onCreateSubtask: (title: string) => void;
  onCreateTag: (name: string) => void;
  onSave: (input: UpdateTaskInput) => void;
  onToggleTag: (tagId: string) => void;
  projects: ProjectRecord[];
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
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="time-picker-field">
      <span id={`${id}-label`}>具体时间（可选）</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        className={value ? "date-picker-trigger has-value" : "date-picker-trigger"}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{value || "全天，不设具体时间"}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div aria-label="选择具体时间" className="time-picker-popover" role="listbox">
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
            全天，不设具体时间
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

function toDraft(task: TaskRecord): TaskDetailDraft {
  return {
    dueDate: task.dueDate ?? "",
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    notes: task.notes,
    projectId: task.projectId ?? "",
    priority: task.priority,
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
  onSave,
  onToggleTag,
  projects,
  subtasks,
  tags,
  task,
  taskTags,
}: TaskDetailDialogProps) {
  const [draft, setDraft] = useState(() => toDraft(task));
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [tagName, setTagName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const scheduledDate = draft.scheduledDate || null;
    const scheduledTime = draft.scheduledTime || null;
    const estimatedMinutes = draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null;

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
      scheduledDate,
      scheduledStartAt:
        scheduledDate && scheduledTime
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : null,
      title: draft.title,
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
          if (event.key === "Escape" && !isSaving) onClose();
        }}
      >
        <div className="quick-add-header">
          <div>
            <p className="eyebrow">任务详情</p>
            <h2 id="task-details-title">编辑任务</h2>
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

        <form className="task-details-form" onSubmit={handleSubmit}>
          <label htmlFor="task-detail-title">任务名称</label>
          <input
            autoFocus
            disabled={isSaving}
            id="task-detail-title"
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            value={draft.title}
          />

          <label htmlFor="task-detail-notes">备注</label>
          <textarea
            disabled={isSaving}
            id="task-detail-notes"
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="补充背景、下一步或相关链接"
            rows={4}
            value={draft.notes}
          />

          <div className="detail-field-grid">
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

          <section aria-labelledby="task-schedule-title" className="task-schedule-section">
            <div className="task-schedule-heading">
              <div>
                <p className="eyebrow">时间安排</p>
                <h3 id="task-schedule-title">决定何时做，而非何时必须完成</h3>
              </div>
              <span>
                {draft.scheduledTime ? "时间块" : draft.scheduledDate ? "全天任务" : "未安排"}
              </span>
            </div>
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
          </section>
          {visibleError ? <p className="form-error">{visibleError}</p> : null}

          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "正在保存…" : "保存任务"}
            </button>
          </div>
        </form>

        <section className="tag-section" aria-labelledby="task-tag-title">
          <div className="subtask-heading">
            <h3 id="task-tag-title">标签</h3>
            <span>{taskTags.length}</span>
          </div>
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
        </section>

        <section className="subtask-section" aria-labelledby="subtask-title">
          <div className="subtask-heading">
            <h3 id="subtask-title">子任务</h3>
            <span>{subtasks.length}</span>
          </div>
          {subtasks.length > 0 ? (
            <ul className="subtask-list">
              {subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <button
                    aria-label={`完成子任务：${subtask.title}`}
                    className="task-complete-button"
                    disabled={isSavingSubtask}
                    onClick={() => onCompleteSubtask(subtask.id)}
                    type="button"
                  />
                  <span>{subtask.title}</span>
                </li>
              ))}
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
        </section>
      </section>
    </div>
  );
}
