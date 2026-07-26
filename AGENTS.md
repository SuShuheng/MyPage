# Repository Guidelines

## Project Structure & Module Organization

MyPage is an Obsidian plugin written in TypeScript and Preact. Core code lives in `src/`: dashboard UI is under `src/dashboard/`, persistence and schemas under `src/persistence/`, and module, marketplace, permission, data, and theme services have matching subdirectories. Shared SDK code is in `packages/sdk/`. Official self-contained modules live in `diy-plugins/<module-id>/`; keep each module’s manifest, runtime, styles, schema, README, and assets together. Tests are grouped by scope in `tests/unit/`, `tests/integration/`, `tests/security/`, and `tests/performance/`. Documentation, examples, scripts, and static assets belong in `docs/`, `examples/`, `scripts/`, and `assets/`.

Do not edit generated root artifacts (`main.js`, `styles.css`) by hand; regenerate them with the build.

## Build, Test, and Development Commands

- `npm ci` — install the locked dependency set (Node.js 20.19+).
- `npm run dev` — run the esbuild development watcher.
- `npm run build` — type-check and create production plugin artifacts.
- `npm run lint` — run ESLint across the repository.
- `npm test` — run unit tests; `npm run test:all` runs every Vitest project.
- `npm run validate:modules` — validate all packages in `diy-plugins/`.
- `npm run validate:market` and `npm run validate:theme-market` — validate marketplace indexes.
- `npm run dev:deploy` — deploy to the dedicated `H:\GitHub\TestDev` vault.

Never deploy development builds to a real notes vault. E2E work must use the prepared TestDev copy and an isolated Obsidian profile.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, double quotes, and explicit types at service boundaries. Name components and classes in PascalCase (`DashboardShell.tsx`), functions and variables in camelCase, and schema/type utility files in kebab-case. Keep UI behavior accessible with labels, keyboard handling, and visible focus states. Prefer small, scoped changes and preserve backward compatibility for `data.json`.

## Testing Guidelines

Vitest uses Happy DOM; UI tests may use Testing Library, while Electron flows use Playwright. Name tests `*.test.ts` or `*.test.tsx` beside the appropriate scope directory. Add regression coverage for every bug fix. Configured coverage targets are 80% for lines, functions, and statements, and 75% for branches.

## Commit & Pull Request Guidelines

Follow Conventional Commit-style subjects used in history, such as `feat: refine dashboard editing and market filters`. Keep commits focused. Pull requests should explain user impact, list validation commands, link related issues, and include screenshots or E2E evidence for UI changes. Never push secrets, local vault data, caches, or `.e2e/` profiles.
