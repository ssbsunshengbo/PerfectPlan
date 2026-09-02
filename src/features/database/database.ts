import Database from "@tauri-apps/plugin-sql";

export const DATABASE_CONNECTION = "sqlite:perfectplan.db";

export type DatabaseHealth = {
  foreignKeysEnabled: boolean;
  schemaReady: boolean;
};

let databasePromise: Promise<Database> | undefined;

export function resetDatabaseConnection(): void {
  databasePromise = undefined;
}

export async function getDatabase(): Promise<Database> {
  databasePromise ??= Database.load(DATABASE_CONNECTION);

  const database = await databasePromise;
  await database.execute("PRAGMA foreign_keys = ON");
  return database;
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const database = await getDatabase();
  const [foreignKeyState] =
    await database.select<{ foreign_keys: number }[]>("PRAGMA foreign_keys");
  const [schemaState] = await database.select<{ schema_ready: number }[]>(
    "SELECT COUNT(*) AS schema_ready FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
  );

  return {
    foreignKeysEnabled: foreignKeyState?.foreign_keys === 1,
    schemaReady: schemaState?.schema_ready === 1,
  };
}
