import type { TagRecord } from "./tag-types";

const tagMarker = /#\s*([^#\s]*)$/u;
const tagPalette = ["#5c8fd6", "#c5775e", "#8a74c5", "#4f9a82", "#bd8b43", "#ba6387"];

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getTagSuggestions(value: string, tags: TagRecord[]): TagRecord[] {
  const match = value.match(tagMarker);
  if (!match) return [];

  const query = (match[1] ?? "").toLocaleLowerCase("zh-CN");
  return tags.filter((tag) => tag.name.toLocaleLowerCase("zh-CN").includes(query)).slice(0, 6);
}

export function getDisplayTagColor(tag: TagRecord): string {
  if (tag.color) return tag.color;
  const index = [...tag.name].reduce((total, character) => total + character.codePointAt(0)!, 0);
  return tagPalette[index % tagPalette.length]!;
}

export function insertTagToken(value: string, tag: TagRecord): string {
  return value.replace(tagMarker, `#${tag.name} `);
}

export function parseTaskTagTokens(
  value: string,
  tags: TagRecord[],
): { tagIds: string[]; title: string } {
  const matchedTags = [...tags]
    .sort((left, right) => right.name.length - left.name.length)
    .filter((tag) => new RegExp(`#\\s*${escapeExpression(tag.name)}(?=$|\\s|#)`, "gu").test(value));

  const title = matchedTags.reduce(
    (currentTitle, tag) =>
      currentTitle.replace(new RegExp(`#\\s*${escapeExpression(tag.name)}(?=$|\\s|#)`, "gu"), " "),
    value,
  );

  return {
    tagIds: matchedTags.map((tag) => tag.id),
    title: title.replace(/\s{2,}/gu, " ").trim(),
  };
}
