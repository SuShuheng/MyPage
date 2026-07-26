import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(root, ".mypage-market", "manifest.json"), "utf8"),
);
const index = JSON.parse(
  await readFile(path.join(root, ".mypage-market", "index.json"), "utf8"),
);
const errors = [];
if (manifest.schemaVersion !== 1 || manifest.index !== ".mypage-market/index.json") {
  errors.push("市场 manifest 协议无效");
}
if (index.schemaVersion !== 1 || index.repository !== manifest.repository) {
  errors.push("市场 index 与 manifest 不一致");
}
const ids = new Set();
for (const module of index.modules ?? []) {
  if (ids.has(module.id)) errors.push(`重复模块 ${module.id}`);
  ids.add(module.id);
  if (!Array.isArray(module.versions) || module.versions.length === 0) {
    errors.push(`${module.id} 没有版本`);
  }
  for (const version of module.versions ?? []) {
    if (!/^[a-f0-9]{64}$/.test(version.sha256 ?? "")) {
      errors.push(`${module.id}@${version.version} SHA-256 无效`);
    }
    if (!String(version.downloadUrl ?? "").startsWith("https://github.com/")) {
      errors.push(`${module.id}@${version.version} 下载地址必须使用 HTTPS GitHub`);
    }
  }
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`✓ 市场索引有效（${ids.size} 个模块）`);
}
