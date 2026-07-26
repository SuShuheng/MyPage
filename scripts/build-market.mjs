import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createModuleZip,
  moduleDirectories,
  readModule,
  sha256,
  validateModule,
} from "./lib/modules.mjs";

const root = process.cwd();
const moduleRoot = path.join(root, "diy-plugins");
const output = path.join(root, "dist", "modules");
await mkdir(output, { recursive: true });
const modules = [];
for (const directory of await moduleDirectories(moduleRoot)) {
  const errors = await validateModule(directory);
  if (errors.length > 0) throw new Error(`${directory}: ${errors.join("; ")}`);
  const { manifest } = await readModule(directory);
  const archive = await createModuleZip(directory);
  const filename = `${manifest.id}_${manifest.version}.zip`;
  await writeFile(path.join(output, filename), archive);
  modules.push({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    path: `diy-plugins/${manifest.id}`,
    repository: "SuShuHeng/MyPage",
    categories: [
      ...new Set(
        manifest.contributions.map((contribution) =>
          contribution.kind === "widget"
            ? "visualization"
            : contribution.kind === "dataSource" ||
                contribution.kind === "transform"
              ? "data"
              : contribution.kind === "action"
                ? "actions"
                : contribution.kind === "dashboardTemplate"
                  ? "templates"
                  : "settings",
        ),
      ),
    ],
    versions: [
      {
        version: manifest.version,
        releaseTag: manifest.version,
        downloadUrl: `https://github.com/SuShuHeng/MyPage/releases/download/${manifest.version}/${filename}`,
        sha256: sha256(archive),
        minMyPageVersion: manifest.minMyPageVersion,
        ...(manifest.maxMyPageVersion
          ? { maxMyPageVersion: manifest.maxMyPageVersion }
          : {}),
        platforms: manifest.platforms,
        permissions: manifest.permissions.map(({ capability, suggestedScope }) => ({
          capability,
          ...(suggestedScope ? { scope: suggestedScope } : {}),
        })),
        prerelease: manifest.version.includes("-"),
      },
    ],
  });
}
const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: "SuShuHeng/MyPage",
  modules,
};
await writeFile(
  path.join(root, ".mypage-market", "index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);
console.log(`Built ${modules.length} official modules.`);
