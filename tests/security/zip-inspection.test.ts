import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { executeWorkerTask } from "../../src/workers/tasks";

describe("ZIP inspection security", () => {
  it("rejects path traversal entries", async () => {
    const zip = zipSync({ "../escape.js": new TextEncoder().encode("bad") });
    await expect(
      executeWorkerTask("zip-inspect", { data: zip }),
    ).rejects.toThrow(/Unsafe ZIP path/);
  });

  it("accepts a bounded self-contained module archive", async () => {
    const zip = zipSync({
      "module/manifest.json": new TextEncoder().encode("{}"),
      "module/main.js": new TextEncoder().encode(""),
    });
    const result = await executeWorkerTask("zip-inspect", { data: zip });
    expect(Object.keys(result.files)).toHaveLength(2);
  });

  it("rejects a highly compressible ZIP bomb before installing it", async () => {
    const zip = zipSync(
      { "bomb.txt": new Uint8Array(2 * 1024 * 1024) },
      { level: 9 },
    );
    await expect(
      executeWorkerTask("zip-inspect", {
        data: zip,
        limits: { maxCompressionRatio: 20 },
      }),
    ).rejects.toThrow(/compression ratio/i);
  });
});
