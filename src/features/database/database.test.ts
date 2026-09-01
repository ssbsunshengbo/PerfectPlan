import { describe, expect, it } from "vitest";

import { DATABASE_CONNECTION } from "./database";

describe("database configuration", () => {
  it("uses one stable local SQLite database name", () => {
    expect(DATABASE_CONNECTION).toBe("sqlite:perfectplan.db");
  });
});
