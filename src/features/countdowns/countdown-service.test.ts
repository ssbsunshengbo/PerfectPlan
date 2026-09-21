import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "../database/database";
import {
  countdownService,
  normalizeCountdownDate,
  normalizeCountdownTitle,
} from "./countdown-service";

vi.mock("../database/database", () => ({ getDatabase: vi.fn() }));

const execute = vi.fn();
const select = vi.fn();

describe("countdownService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockReset();
    select.mockReset();
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);
  });

  it("normalizes a title and rejects an empty one", () => {
    expect(normalizeCountdownTitle("  国庆假期 ")).toBe("国庆假期");
    expect(() => normalizeCountdownTitle(" ")).toThrow("倒数日名称不能为空");
  });

  it("accepts only real local calendar dates", () => {
    expect(normalizeCountdownDate("2026-09-25")).toBe("2026-09-25");
    expect(() => normalizeCountdownDate("2026-02-30")).toThrow("请选择有效日期");
  });

  it("writes a normalized new countdown", async () => {
    select.mockResolvedValueOnce([
      {
        id: "countdown-1",
        title: "国庆假期",
        target_date: "2026-10-01",
        theme: "dusk",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ]);

    await countdownService.createCountdown({
      targetDate: "2026-10-01",
      theme: "dusk",
      title: "  国庆假期  ",
    });

    expect(execute.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["国庆假期", "2026-10-01", "dusk"]),
    );
  });
});
