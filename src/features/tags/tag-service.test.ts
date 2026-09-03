import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import { normalizeTagName, tagService } from "./tag-service";

vi.mock("../database/database", () => ({
  getDatabase: vi.fn(),
}));

const execute = vi.fn();
const select = vi.fn();

describe("tagService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("trims a tag name before persisting it", async () => {
    select.mockResolvedValueOnce([
      {
        id: "tag-1",
        name: "重要",
        color: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    await tagService.createTag("  重要  ");

    expect(execute.mock.calls[0]?.[1]?.[1]).toBe("重要");
  });

  it("keeps attaching the same tag idempotent", async () => {
    await tagService.attachTagToTask("task-1", "tag-1");

    expect(execute.mock.calls[0]?.[0]).toContain("INSERT OR IGNORE");
  });

  it("loads tag mappings for multiple task rows in one query", async () => {
    select.mockResolvedValueOnce([
      {
        color: "#537fd9",
        created_at: "2026-09-01T00:00:00.000Z",
        id: "tag-1",
        name: "调研",
        task_id: "task-1",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    const tagsByTaskId = await tagService.listTaskTagsByTaskIds(["task-1", "task-2"]);

    expect(tagsByTaskId.get("task-1")?.map((tag) => tag.name)).toEqual(["调研"]);
    expect(select.mock.calls[0]?.[0]).toContain("task_tags.task_id IN ($1, $2)");
  });

  it("deletes a tag record without touching its tasks", async () => {
    await tagService.deleteTag("tag-1");

    expect(execute).toHaveBeenCalledWith("DELETE FROM tags WHERE id = $1", ["tag-1"]);
  });

  it("rejects an empty tag name", () => {
    expect(() => normalizeTagName("  ")).toThrow("标签名称不能为空");
  });
});
