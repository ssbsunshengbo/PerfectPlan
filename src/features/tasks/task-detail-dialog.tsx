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

function toLocalTime(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
            <label htmlFor="task-detail-project">
              项目
              <select
                disabled={isSaving}
                id="task-detail-project"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, projectId: event.target.value }))
                }
                value={draft.projectId}
              >
                <option value="">收集箱</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="task-detail-priority">
              优先级
              <select
                disabled={isSaving}
                id="task-detail-priority"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: Number(event.target.value) as TaskPriority,
                  }))
                }
                value={draft.priority}
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="task-detail-estimate">
              预计时长（分钟）
              <input
                disabled={isSaving}
                id="task-detail-estimate"
                min="1"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))
                }
                placeholder="例如：30"
                step="1"
                type="number"
                value={draft.estimatedMinutes}
              />
            </label>
          </div>

          <div className="detail-field-grid">
            <label htmlFor="task-detail-scheduled-date">
              计划日期
              <input
                disabled={isSaving}
                id="task-detail-scheduled-date"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scheduledDate: event.target.value,
                    scheduledTime: event.target.value ? current.scheduledTime : "",
                  }))
                }
                type="date"
                value={draft.scheduledDate}
              />
            </label>
            <label htmlFor="task-detail-scheduled-time">
              具体时间（可选）
              <input
                disabled={isSaving || !draft.scheduledDate}
                id="task-detail-scheduled-time"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, scheduledTime: event.target.value }))
                }
                type="time"
                value={draft.scheduledTime}
              />
            </label>
          </div>

          <label htmlFor="task-detail-due-date">
            截止日期
            <input
              disabled={isSaving}
              id="task-detail-due-date"
              onChange={(event) =>
                setDraft((current) => ({ ...current, dueDate: event.target.value }))
              }
              type="date"
              value={draft.dueDate}
            />
          </label>
          {scheduleAfterDue ? (
            <p className="form-hint">计划日期晚于截止日期；会保留此安排并在后续视图中提示。</p>
          ) : null}
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
