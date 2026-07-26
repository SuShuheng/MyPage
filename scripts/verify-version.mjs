import { readFile } from "node:fs/promises";
import process from "node:process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const tag = (process.env.GITHUB_REF_NAME || process.argv[2] || "").replace(/^v/, "");
const errors = [];
if (packageJson.version !== manifest.version) {
  errors.push(`package.json ${packageJson.version} != manifest.json ${manifest.version}`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  errors.push(`versions.json 缺少 ${manifest.version} -> ${manifest.minAppVersion}`);
}
if (tag && tag !== manifest.version) errors.push(`Tag ${tag} != ${manifest.version}`);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  errors.push("版本不是 SemVer");
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`✓ 版本一致：${manifest.version}`);
}
