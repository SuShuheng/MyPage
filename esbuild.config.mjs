import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";
import path from "node:path";

const production = process.argv[2] === "production";
const banner = `/*
 * MyPage ${process.env.npm_package_version ?? "development"}
 * Generated bundle. Source: https://github.com/SuShuHeng/MyPage
 */`;

const external = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

const inlineWorkerPlugin = {
  name: "mypage-inline-worker",
  setup(build) {
    build.onResolve({ filter: /\?worker$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?worker$/, "")),
      namespace: "mypage-worker",
    }));
    build.onLoad(
      { filter: /.*/, namespace: "mypage-worker" },
      async (args) => {
        const result = await esbuild.build({
          bundle: true,
          entryPoints: [args.path],
          format: "iife",
          logLevel: "silent",
          minify: production,
          platform: "browser",
          sourcemap: false,
          target: "es2021",
          write: false,
        });
        const source = result.outputFiles?.[0]?.text;
        if (!source) throw new Error(`Failed to bundle worker: ${args.path}`);
        return {
          contents: `export default ${JSON.stringify(source)};`,
          loader: "js",
        };
      },
    );
  },
};

const common = {
  bundle: true,
  logLevel: "info",
  minify: production,
  sourcemap: production ? false : "inline",
  target: "es2021",
};

const javascript = await esbuild.context({
  ...common,
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  external,
  format: "cjs",
  outfile: "main.js",
  platform: "browser",
  plugins: [inlineWorkerPlugin],
  treeShaking: true,
});

const stylesheet = await esbuild.context({
  ...common,
  entryPoints: ["src/styles/index.css"],
  loader: { ".woff2": "dataurl" },
  outfile: "styles.css",
});

if (production) {
  await Promise.all([javascript.rebuild(), stylesheet.rebuild()]);
  await Promise.all([javascript.dispose(), stylesheet.dispose()]);
} else {
  await Promise.all([javascript.watch(), stylesheet.watch()]);
}
