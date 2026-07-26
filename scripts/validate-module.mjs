import path from "node:path";
import process from "node:process";
import { moduleDirectories, validateModule } from "./lib/modules.mjs";

const root = process.cwd();
const all = process.argv.includes("--all");
const requested = process.argv.find((argument) => argument.startsWith("--module="));
const directories = all
  ? await moduleDirectories(path.join(root, "diy-plugins"))
  : [requested ? path.resolve(requested.slice("--module=".length)) : path.resolve(process.argv[2] ?? "")];
let failed = false;
for (const directory of directories) {
  const errors = await validateModule(directory);
  if (errors.length > 0) {
    failed = true;
    console.error(`${path.relative(root, directory)}:\n- ${errors.join("\n- ")}`);
  } else {
    console.log(`✓ ${path.relative(root, directory)}`);
  }
}
if (failed) process.exitCode = 1;
