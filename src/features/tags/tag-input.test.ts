import { describe, expect, it } from "vitest";

import { getTagSuggestions, insertTagToken, parseTaskTagTokens } from "./tag-input";

const tags = [
  { color: "#d97757", createdAt: "", id: "work", name: "工作", updatedAt: "" },
  { color: "#537fd9", createdAt: "", id: "research", name: "调研", updatedAt: "" },
];

describe("tag task input", () => {
  it("suggests and inserts a tag after a hash marker", () => {
    expect(getTagSuggestions("整理资料 #", tags).map((tag) => tag.id)).toEqual([
      "work",
      "research",
    ]);
    expect(insertTagToken("整理资料 #调", tags[1]!)).toBe("整理资料 #调研 ");
  });

  it("removes recognized tag tokens from the task title and returns their ids", () => {
    expect(parseTaskTagTokens("整理竞品 #工作 # 调研", tags)).toEqual({
      tagIds: ["work", "research"],
      title: "整理竞品",
    });
  });
});
