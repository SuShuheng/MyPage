import { describe, expect, it } from "vitest";
import {
  createModuleZip,
  normalizeModuleText,
  sha256,
} from "../../../scripts/lib/modules.mjs";

describe("module release packaging", () => {
  it("normalizes Windows and Unix text to identical release bytes", () => {
    const windows = normalizeModuleText(
      Buffer.from("line one\r\nline two\r\n", "utf8"),
    );
    const unix = normalizeModuleText(
      Buffer.from("line one\nline two\n", "utf8"),
    );

    expect(windows).toEqual(unix);
    expect(new TextDecoder().decode(windows)).toBe("line one\nline two\n");
  });

  it("reproduces the published calendar archive hash across time zones", async () => {
    const archive = await createModuleZip("diy-plugins/calendar-widget");

    expect(sha256(archive)).toBe(
      "8ac6283174cab91e972514882d55abca65da913175d47f1636d087490f955b31",
    );
  });
});
