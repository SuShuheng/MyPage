import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const output = path.join("dist", "release");
await mkdir(output, { recursive: true });
const names = ["main.js", "manifest.json", "styles.css"];
const files = {};
const sums = [];
for (const name of names) {
  const bytes = new Uint8Array(await readFile(name));
  files[name] = bytes;
  await writeFile(path.join(output, name), bytes);
  sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
try {
  for (const name of await readdir(path.join("dist", "modules"))) {
    if (!name.endsWith(".zip")) continue;
    const bytes = new Uint8Array(
      await readFile(path.join("dist", "modules", name)),
    );
    sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
  }
} catch {
  // A core-only dry run may execute before official modules are packaged.
}
const checksum = `${sums.join("\n")}\n`;
await writeFile(path.join(output, "SHA256SUMS"), checksum);
files.SHA256SUMS = new TextEncoder().encode(checksum);
await writeFile(
  path.join(output, `mypage-${manifest.version}.zip`),
  zipSync(files, { level: 9 }),
);
console.log(`Release package ready: ${output}`);
