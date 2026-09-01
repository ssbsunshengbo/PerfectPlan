import { getDatabase } from "../database/database";
import type { TagRecord } from "./tag-types";

type TagRow = {
  color: string | null;
  created_at: string;
  id: string;
  name: string;
  updated_at: string;
};

function toTagRecord(row: TagRow): TagRecord {
  return {
    color: row.color,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

export function normalizeTagName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("标签名称不能为空");
  }

  return normalizedName;
}

async function requireTag(tagId: string): Promise<TagRecord> {
  const tag = await tagService.getTag(tagId);

  if (!tag) {
    throw new Error(`找不到标签：${tagId}`);
  }

  return tag;
}

export const tagService = {
  async createTag(name: string): Promise<TagRecord> {
    const tagId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const database = await getDatabase();

    await database.execute(
      `INSERT INTO tags (id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [tagId, normalizeTagName(name), createdAt, createdAt],
    );

    return requireTag(tagId);
  },

  async getTag(tagId: string): Promise<TagRecord | null> {
    const database = await getDatabase();
    const rows = await database.select<TagRow[]>(
      `SELECT id, name, color, created_at, updated_at
       FROM tags
       WHERE id = $1
       LIMIT 1`,
      [tagId],
    );

    return rows[0] ? toTagRecord(rows[0]) : null;
  },

  async listTags(): Promise<TagRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TagRow[]>(
      `SELECT id, name, color, created_at, updated_at
       FROM tags
       ORDER BY name COLLATE NOCASE ASC`,
    );

    return rows.map(toTagRecord);
  },

  async listTaskTags(taskId: string): Promise<TagRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<TagRow[]>(
      `SELECT tags.id, tags.name, tags.color, tags.created_at, tags.updated_at
       FROM tags
       INNER JOIN task_tags ON task_tags.tag_id = tags.id
       WHERE task_tags.task_id = $1
       ORDER BY tags.name COLLATE NOCASE ASC`,
      [taskId],
    );

    return rows.map(toTagRecord);
  },

  async attachTagToTask(taskId: string, tagId: string): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      `INSERT OR IGNORE INTO task_tags (task_id, tag_id)
       VALUES ($1, $2)`,
      [taskId, tagId],
    );
  },

  async detachTagFromTask(taskId: string, tagId: string): Promise<void> {
    const database = await getDatabase();
    await database.execute(`DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2`, [
      taskId,
      tagId,
    ]);
  },

  async deleteTag(tagId: string): Promise<void> {
    const database = await getDatabase();
    await database.execute(`DELETE FROM tags WHERE id = $1`, [tagId]);
  },
};
