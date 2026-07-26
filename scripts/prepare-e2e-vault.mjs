import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.cwd());
const source = path.resolve(process.env.MYPAGE_TEST_VAULT || "H:\\GitHub\\TestDev");
const e2eRoot = path.join(root, ".e2e");
const vault = path.join(e2eRoot, "TestDev");
const profile = path.join(e2eRoot, "profile");
if (!e2eRoot.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to prepare E2E outside the repository.");
}
await rm(e2eRoot, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
await cp(source, vault, {
  recursive: true,
  filter: (entry) => !entry.includes(`${path.sep}.git${path.sep}`),
});
const pluginTarget = path.join(vault, ".obsidian", "plugins", "mypage");
await mkdir(pluginTarget, { recursive: true });
for (const name of ["main.js", "manifest.json", "styles.css", "versions.json"]) {
  await cp(path.join(root, name), path.join(pluginTarget, name), { force: true });
}
await cp(path.join(root, "diy-plugins"), path.join(pluginTarget, "diy-plugins"), {
  recursive: true,
  force: true,
});
await cp(path.join(root, "assets"), path.join(pluginTarget, "assets"), {
  recursive: true,
  force: true,
});
await writeFile(
  path.join(profile, "obsidian.json"),
  JSON.stringify({
    vaults: {
      "mypage-e2e": {
        path: vault,
        ts: Date.now(),
        open: true,
      },
    },
  }),
);
console.log(JSON.stringify({ vault, profile }));
