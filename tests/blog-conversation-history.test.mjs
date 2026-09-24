import { expect, test } from "vitest";
import { groupConversationHistory } from "../components/assistant/AssistantPanel.tsx";

const thread = (id, date) => ({ id, updatedAt: date.toISOString() });

test("history groups local calendar dates and sorts newest first without changing input", () => {
  const now = new Date(2026, 8, 19, 0, 10);
  const threads = [
    thread("yesterday", new Date(2026, 8, 18, 23, 55)),
    thread("older", new Date(2026, 8, 10, 12)),
    thread("today", new Date(2026, 8, 19, 0, 5)),
    thread("earlier-yesterday", new Date(2026, 8, 18, 10)),
  ];
  const before = JSON.stringify(threads);
  const groups = groupConversationHistory(threads, now);
  expect(groups.length).toBe(3);
  expect(groups[0].label).toBe("Today");
  expect(groups[0].threads[0].id).toBe("today");
  expect(groups[1].label).toBe("Yesterday");
  expect(Array.from(groups[1].threads, ({ id }) => id)).toEqual(["yesterday", "earlier-yesterday"]);
  expect(groups[2].threads[0].id).toBe("older");
  expect(JSON.stringify(threads)).toBe(before);
});

test("yesterday crosses month and year boundaries", () => {
  const groups = groupConversationHistory(
    [thread("last-year", new Date(2025, 11, 31, 23, 59))],
    new Date(2026, 0, 1, 0, 1),
  );
  expect(groups[0].label).toBe("Yesterday");
});

test("calendar grouping handles daylight-saving transitions", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    for (const [month, day] of [
      [2, 9],
      [10, 2],
    ]) {
      const groups = groupConversationHistory(
        [thread("previous-day", new Date(2026, month, day - 1, 0, 5))],
        new Date(2026, month, day, 23, 55),
      );
      expect(groups[0].label).toBe("Yesterday");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("empty history stays empty and unknown dates remain reachable", () => {
  expect(groupConversationHistory([]).length).toBe(0);
  const groups = groupConversationHistory([{ id: "unknown", updatedAt: "invalid" }]);
  expect(groups[0].label).toBe("Earlier");
  expect(groups[0].threads[0].id).toBe("unknown");
});
