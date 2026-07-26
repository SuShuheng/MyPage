import { describe, expect, it } from "vitest";
import {
  createDateRange,
  dateRangeTimestamps,
  resolvePathTemplate,
} from "../../../src/widgets/content-config";

describe("widget content configuration", () => {
  it("resolves supported note path tokens with local values", () => {
    const date = new Date(2026, 6, 26, 9, 5, 7);
    expect(
      resolvePathTemplate(
        "Journal/{Date}/{time}-{timestamp}.md",
        date,
      ),
    ).toBe(`Journal/2026-07-26/09-05-07-${date.getTime()}.md`);
  });

  it("creates and normalizes configurable visualization date ranges", () => {
    expect(createDateRange(3, new Date(2026, 6, 26, 12))).toEqual({
      startDate: "2026-07-24",
      endDate: "2026-07-26",
    });
    const range = dateRangeTimestamps("2026-07-26", "2026-07-01");
    expect(range.startDate).toBe("2026-07-01");
    expect(range.endDate).toBe("2026-07-26");
    expect(range.to).toBeGreaterThan(range.from);
  });
});
