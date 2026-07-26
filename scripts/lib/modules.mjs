import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const REPRODUCIBLE_ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

export const REQUIRED_MODULE_FILES = [
  "manifest.json",
  "main.js",
  "styles.css",
  "config.schema.json",
  "README.md",
];

export async function readModule(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  return { directory, manifest };
}

export async function validateModule(directory) {
  const errors = [];
  for (const file of REQUIRED_MODULE_FILES) {
    try {
      const info = await stat(path.join(directory, file));
      if (!info.isFile()) errors.push(`${file} 不是文件`);
    } catch {
      errors.push(`缺少 ${file}`);
    }
  }
  let manifest;
  try {
    ({ manifest } = await readModule(directory));
  } catch (error) {
    errors.push(`manifest.json 无法读取：${error.message}`);
    return errors;
  }
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id ?? "")) errors.push("模块 ID 无效");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")) {
    errors.push("模块版本不是 SemVer");
  }
  if (!Array.isArray(manifest.contributions) || manifest.contributions.length === 0) {
    errors.push("模块至少注册一个贡献");
  }
  if (!Array.isArray(manifest.permissions)) errors.push("permissions 必须为数组");
  if (!Array.isArray(manifest.platforms) || manifest.platforms.length === 0) {
    errors.push("platforms 不能为空");
  }
  try {
    JSON.parse(await readFile(path.join(directory, "config.schema.json"), "utf8"));
  } catch (error) {
    errors.push(`config.schema.json 无效：${error.message}`);
  }
  try {
    const code = await readFile(path.join(directory, "main.js"), "utf8");
    if (/(?:^|[;\n])\s*import\s+(?:[^("'`]|from\s*)/mu.test(code) || /\bimport\s*\(/mu.test(code)) {
      errors.push("main.js 必须自包含，不能保留外部 import");
    }
  } catch {
    // Missing file already reported.
  }
  return errors;
}

export async function moduleDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export async function createModuleZip(directory) {
  const files = {};
  for (const file of REQUIRED_MODULE_FILES) {
    files[file] = zipEntry(await readFile(path.join(directory, file)));
  }
  const assets = path.join(directory, "assets");
  try {
    await addDirectory(files, assets, "assets");
  } catch {
    // assets/ is optional at packaging time.
  }
  return zipSync(files, { level: 9 });
}

async function addDirectory(files, directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    const destination = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await addDirectory(files, source, destination);
    else if (entry.isFile()) files[destination] = zipEntry(await readFile(source));
  }
}

function zipEntry(bytes) {
  return [
    new Uint8Array(bytes),
    { mtime: REPRODUCIBLE_ZIP_DATE, level: 9 },
  ];
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
