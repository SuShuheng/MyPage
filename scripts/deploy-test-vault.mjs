import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const vault = process.env.MYPAGE_TEST_VAULT || "H:\\GitHub\\TestDev";
const target = path.join(vault, ".obsidian", "plugins", "mypage");
await mkdir(target, { recursive: true });
for (const name of ["main.js", "manifest.json", "styles.css", "versions.json"]) {
  await cp(path.resolve(name), path.join(target, name), { force: true });
}
await cp(path.resolve("diy-plugins"), path.join(target, "diy-plugins"), {
  recursive: true,
  force: true,
});
await cp(path.resolve("assets"), path.join(target, "assets"), {
  recursive: true,
  force: true,
});
const enabledPath = path.join(vault, ".obsidian", "community-plugins.json");
let enabled = [];
try {
  const value = JSON.parse(await readFile(enabledPath, "utf8"));
  if (Array.isArray(value)) enabled = value.filter((item) => typeof item === "string");
} catch {
  // A fresh test Vault may not have enabled a community plugin yet.
}
if (!enabled.includes("mypage")) enabled.push("mypage");
await writeFile(enabledPath, `${JSON.stringify(enabled, null, 2)}\n`);
console.log(`Deployed MyPage to ${target}`);
