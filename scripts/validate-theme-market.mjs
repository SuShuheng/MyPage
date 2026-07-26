import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(".mypage-theme-market/manifest.json", "utf8"),
);
const index = JSON.parse(
  await readFile(".mypage-theme-market/index.json", "utf8"),
);
const errors = [];
if (manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must be 1");
if (manifest.index !== ".mypage-theme-market/index.json") {
  errors.push("manifest.index must point to the required index");
}
if (index.schemaVersion !== 1) errors.push("index.schemaVersion must be 1");
if (manifest.repository !== index.repository) {
  errors.push("manifest and index repository must match");
}
if (!Array.isArray(index.themes) || index.themes.length < 3) {
  errors.push("official theme market must contain at least 3 themes");
}
const ids = new Set();
for (const [position, theme] of (index.themes ?? []).entries()) {
  if (!theme || typeof theme !== "object") {
    errors.push(`themes[${position}] must be an object`);
    continue;
  }
  if (typeof theme.id !== "string" || !theme.id) {
    errors.push(`themes[${position}].id is required`);
  } else if (ids.has(theme.id)) {
    errors.push(`duplicate theme id ${theme.id}`);
  } else {
    ids.add(theme.id);
  }
  if (typeof theme.name !== "string" || !theme.name) {
    errors.push(`themes[${position}].name is required`);
  }
  if (!["obsidian", "light", "dark"].includes(theme.mode)) {
    errors.push(`themes[${position}].mode is invalid`);
  }
  if (!theme.tokens || typeof theme.tokens !== "object") {
    errors.push(`themes[${position}].tokens is required`);
  }
}
if (errors.length > 0) {
  throw new Error(`主题市场索引无效：${errors.join("; ")}`);
}
console.log(`✓ 官方主题市场有效（${index.themes.length} 个主题）`);
