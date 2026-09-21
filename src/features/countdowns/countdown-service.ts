import { getDatabase } from "../database/database";
import { countdownThemes, type CountdownRecord, type CountdownTheme } from "./countdown-types";

type CountdownRow = {
  created_at: string;
  id: string;
  target_date: string;
  theme: string;
  title: string;
  updated_at: string;
};

export type CreateCountdownInput = {
  targetDate: string;
  theme: CountdownTheme;
  title: string;
};

export type UpdateCountdownInput = Partial<CreateCountdownInput>;

export function normalizeCountdownTitle(title: string): string {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) throw new Error("倒数日名称不能为空");
  if (normalizedTitle.length > 60) throw new Error("倒数日名称不能超过 60 个字符");

  return normalizedTitle;
}

export function normalizeCountdownDate(targetDate: string): string {
  const normalizedDate = targetDate.trim();
  const matchedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedDate);

  if (!matchedDate) throw new Error("请选择有效日期");

  const [year, month, day] = matchedDate.slice(1).map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== (month ?? 1) - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("请选择有效日期");
  }

  return normalizedDate;
}

function normalizeCountdownTheme(theme: string): CountdownTheme {
  if (!countdownThemes.includes(theme as CountdownTheme)) {
    throw new Error("倒数日主题无效");
  }

  return theme as CountdownTheme;
}

function toCountdownRecord(row: CountdownRow): CountdownRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    targetDate: normalizeCountdownDate(row.target_date),
    theme: normalizeCountdownTheme(row.theme),
    title: row.title,
    updatedAt: row.updated_at,
  };
}

async function requireCountdown(countdownId: string): Promise<CountdownRecord> {
  const countdown = await countdownService.getCountdown(countdownId);
  if (!countdown) throw new Error("找不到该倒数日");
  return countdown;
}

export const countdownService = {
  async createCountdown(input: CreateCountdownInput): Promise<CountdownRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO countdowns (id, title, target_date, theme, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        normalizeCountdownTitle(input.title),
        normalizeCountdownDate(input.targetDate),
        normalizeCountdownTheme(input.theme),
        now,
        now,
      ],
    );
    return requireCountdown(id);
  },

  async deleteCountdown(countdownId: string): Promise<void> {
    const database = await getDatabase();
    const result = await database.execute("DELETE FROM countdowns WHERE id = $1", [countdownId]);
    if (result.rowsAffected === 0) throw new Error("找不到该倒数日");
  },

  async getCountdown(countdownId: string): Promise<CountdownRecord | null> {
    const database = await getDatabase();
    const rows = await database.select<CountdownRow[]>(
      `SELECT id, title, target_date, theme, created_at, updated_at
       FROM countdowns WHERE id = $1 LIMIT 1`,
      [countdownId],
    );
    return rows[0] ? toCountdownRecord(rows[0]) : null;
  },

  async listCountdowns(): Promise<CountdownRecord[]> {
    const database = await getDatabase();
    const rows = await database.select<CountdownRow[]>(
      `SELECT id, title, target_date, theme, created_at, updated_at
       FROM countdowns
       ORDER BY target_date ASC, created_at ASC`,
    );
    return rows.map(toCountdownRecord);
  },

  async updateCountdown(
    countdownId: string,
    input: UpdateCountdownInput,
  ): Promise<CountdownRecord> {
    const updates: Array<{ column: string; value: string }> = [];
    if ("title" in input) {
      updates.push({ column: "title", value: normalizeCountdownTitle(input.title ?? "") });
    }
    if ("targetDate" in input) {
      updates.push({
        column: "target_date",
        value: normalizeCountdownDate(input.targetDate ?? ""),
      });
    }
    if ("theme" in input) {
      updates.push({ column: "theme", value: normalizeCountdownTheme(input.theme ?? "") });
    }
    if (updates.length === 0) return requireCountdown(countdownId);

    updates.push({ column: "updated_at", value: new Date().toISOString() });
    const assignments = updates.map(({ column }, index) => `${column} = $${index + 1}`).join(", ");
    const database = await getDatabase();
    const result = await database.execute(
      `UPDATE countdowns SET ${assignments} WHERE id = $${updates.length + 1}`,
      [...updates.map(({ value }) => value), countdownId],
    );
    if (result.rowsAffected === 0) throw new Error("找不到该倒数日");
    return requireCountdown(countdownId);
  },
};
