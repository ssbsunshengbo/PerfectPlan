import { getDatabase } from "../database/database";
import { projectStatuses, type ProjectRecord, type ProjectStatus } from "./project-types";

type ProjectRow = {
  color: string | null;
  created_at: string;
  id: string;
  name: string;
  sort_order: number;
  status: string;
  updated_at: string;
};

export function normalizeProjectName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("项目名称不能为空");
  }

  return normalizedName;
}

function toProjectStatus(status: string): ProjectStatus {
  if (!projectStatuses.includes(status as ProjectStatus)) {
    throw new Error(`数据库中存在未知项目状态：${status}`);
  }

  return status as ProjectStatus;
}

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    color: row.color,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    status: toProjectStatus(row.status),
    updatedAt: row.updated_at,
  };
}

async function requireProject(projectId: string): Promise<ProjectRecord> {
  const project = await projectService.getProject(projectId);

  if (!project) {
    throw new Error(`找不到项目：${projectId}`);
  }

  return project;
}

export const projectService = {
  async createProject(name: string): Promise<ProjectRecord> {
    const projectId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const database = await getDatabase();

    await database.execute(
      `INSERT INTO projects (id, name, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, normalizeProjectName(name), "active", createdAt, createdAt],
    );

    return requireProject(projectId);
  },

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const database = await getDatabase();
    const rows = await database.select<ProjectRow[]>(
      `SELECT id, name, color, status, sort_order, created_at, updated_at
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId],
    );

    return rows[0] ? toProjectRecord(rows[0]) : null;
  },

  async listActiveProjects(): Promise<ProjectRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<ProjectRow[]>(
      `SELECT id, name, color, status, sort_order, created_at, updated_at
       FROM projects
       WHERE status = 'active'
       ORDER BY sort_order ASC, created_at ASC`,
    );

    return rows.map(toProjectRecord);
  },
};
