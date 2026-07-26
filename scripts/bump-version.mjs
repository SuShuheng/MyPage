import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import semver from "semver";

const release = process.argv[2];
if (!["patch", "minor", "major"].includes(release)) {
  throw new Error("用法：node scripts/bump-version.mjs patch|minor|major");
}
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const next = semver.inc(manifest.version, release);
if (!next) throw new Error("无法计算下一个版本。");
packageJson.version = next;
manifest.version = next;
versions[next] = manifest.minAppVersion;
await Promise.all([
  writeFile("package.json", `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile("versions.json", `${JSON.stringify(versions, null, 2)}\n`),
]);
console.log(next);
