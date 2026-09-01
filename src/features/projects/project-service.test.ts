import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import { normalizeProjectName, projectService } from "./project-service";

vi.mock("../database/database", () => ({
  getDatabase: vi.fn(),
}));

const execute = vi.fn();
const select = vi.fn();

describe("projectService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("trims a project name before persisting it", async () => {
    select.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "个人成长",
        color: null,
        status: "active",
        sort_order: 0,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    await projectService.createProject("  个人成长  ");

    expect(execute.mock.calls[0]?.[1]?.[1]).toBe("个人成长");
  });

  it("rejects an empty project name before accessing the database", () => {
    expect(() => normalizeProjectName("  ")).toThrow("项目名称不能为空");
  });

  it("updates a project name, color and ordering together", async () => {
    const projectRow = {
      id: "project-1",
      name: "个人成长",
      color: "#3f5efb",
      status: "active",
      sort_order: 2,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    select.mockResolvedValueOnce([projectRow]);
    execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const project = await projectService.updateProject("project-1", {
      color: "#3F5EFB",
      name: "  个人成长  ",
      sortOrder: 2,
    });

    expect(project).toMatchObject({ color: "#3f5efb", name: "个人成长", sortOrder: 2 });
    expect(execute.mock.calls[0]?.[0]).toContain(
      "UPDATE projects SET name = $1, color = $2, sort_order = $3",
    );
  });
});
