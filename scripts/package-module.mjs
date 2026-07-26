import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createModuleZip, readModule, sha256, validateModule } from "./lib/modules.mjs";

const moduleArgument =
  valueAfter("--module") ??
  valueFromEquals("--module=") ??
  process.argv[2];
if (!moduleArgument) throw new Error("用法：node scripts/package-module.mjs --module <目录>");
const directory = path.resolve(
  moduleArgument.includes(path.sep)
    ? moduleArgument
    : path.join("diy-plugins", moduleArgument),
);
const errors = await validateModule(directory);
if (errors.length > 0) throw new Error(errors.join("; "));
const { manifest } = await readModule(directory);
const bytes = createModuleZip ? await createModuleZip(directory) : undefined;
const outputDirectory = path.resolve(valueAfter("--output") ?? "dist/modules");
await mkdir(outputDirectory, { recursive: true });
const filename = `${manifest.id}_${manifest.version}.zip`;
await writeFile(path.join(outputDirectory, filename), bytes);
console.log(`${filename} ${sha256(bytes)}`);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function valueFromEquals(prefix) {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}
