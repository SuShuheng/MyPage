import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const output = path.join("dist", "release");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const coreFiles = {};
const platformFiles = {};
const coreSums = [];
const platformSums = [];
const releaseSums = [];
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  const bytes = await bytesFrom(name);
  coreFiles[name] = bytes;
  platformFiles[name] = bytes;
  await writeFile(path.join(output, name), bytes);
  coreSums.push(checksum(bytes, name));
  platformSums.push(checksum(bytes, name));
  releaseSums.push(checksum(bytes, name));
}

const iconPath = path.join("assets", "mypage-icon.png");
const iconBytes = await bytesFrom(iconPath);
coreFiles["assets/mypage-icon.png"] = iconBytes;
platformFiles["assets/mypage-icon.png"] = iconBytes;
coreSums.push(checksum(iconBytes, "assets/mypage-icon.png"));
platformSums.push(checksum(iconBytes, "assets/mypage-icon.png"));

const marketAssets = [
  [".mypage-market/manifest.json", "module-market-manifest.json"],
  [".mypage-market/index.json", "module-market-index.json"],
  [".mypage-theme-market/manifest.json", "theme-market-manifest.json"],
  [".mypage-theme-market/index.json", "theme-market-index.json"],
];
for (const [source, releaseName] of marketAssets) {
  const bytes = await bytesFrom(source);
  platformFiles[source] = bytes;
  await writeFile(path.join(output, releaseName), bytes);
  platformSums.push(checksum(bytes, source));
  releaseSums.push(checksum(bytes, releaseName));
}

const marketIndex = JSON.parse(
  await readFile(path.join(".mypage-market", "index.json"), "utf8"),
);
const moduleArchives = marketIndex.modules.map((module) => {
  const latest = module.versions[0];
  if (!latest?.version) {
    throw new Error(`Market module ${module.id} has no packaged version.`);
  }
  return `${module.id}_${latest.version}.zip`;
});
const availableArchives = new Set(await readdir(path.join("dist", "modules")));
for (const name of moduleArchives) {
  if (!availableArchives.has(name)) {
    throw new Error(`Official module archive is missing: ${name}`);
  }
  const bytes = await bytesFrom(path.join("dist", "modules", name));
  const archivePath = `diy-plugins/${name}`;
  platformFiles[archivePath] = bytes;
  await writeFile(path.join(output, name), bytes);
  platformSums.push(checksum(bytes, archivePath));
  releaseSums.push(checksum(bytes, name));
}

const coreChecksumBytes = checksumFile(coreSums);
const platformChecksumBytes = checksumFile(platformSums);
const releaseChecksumBytes = checksumFile(releaseSums);
await writeFile(path.join(output, "SHA256SUMS"), releaseChecksumBytes);
coreFiles.SHA256SUMS = coreChecksumBytes;
platformFiles.SHA256SUMS = platformChecksumBytes;

await writeFile(
  path.join(output, `mypage-${manifest.version}.zip`),
  zipSync(coreFiles, { level: 9 }),
);
await writeFile(
  path.join(output, `mypage-platform-${manifest.version}.zip`),
  zipSync(platformFiles, { level: 9 }),
);
console.log(`Release packages ready: ${output}`);

async function bytesFrom(filename) {
  return new Uint8Array(await readFile(filename));
}

function checksum(bytes, filename) {
  return `${createHash("sha256").update(bytes).digest("hex")}  ${filename}`;
}

function checksumFile(sums) {
  return new TextEncoder().encode(`${sums.join("\n")}\n`);
}
