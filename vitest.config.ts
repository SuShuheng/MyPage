import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const aliases = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@mypage/sdk": fileURLToPath(
    new URL("./packages/sdk/src/index.ts", import.meta.url),
  ),
  "obsidian": fileURLToPath(
    new URL("./tests/mocks/obsidian.ts", import.meta.url),
  ),
};

const base = {
  environment: "happy-dom" as const,
  setupFiles: ["tests/setup.ts"],
  restoreMocks: true,
  clearMocks: true,
  mockReset: true,
};

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          ...base,
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          ...base,
          name: "integration",
          include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          ...base,
          name: "security",
          include: ["tests/security/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          ...base,
          name: "performance",
          include: ["tests/performance/**/*.test.ts"],
          testTimeout: 30_000,
        },
      }
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75
      }
    }
  }
});
