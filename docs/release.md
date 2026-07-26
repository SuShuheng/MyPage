# 发布流程

## 本地门禁

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:all
npm run build
npm run validate:modules
npm run build:market
npm run validate:market
npm run package:dry-run
```

版本必须在 `package.json`、`manifest.json`、`versions.json` 和 Git Tag 中一致：

```powershell
npm run version:patch
git add .
git commit -m "Release 1.0.1"
git tag 1.0.1
git push origin main
git push origin 1.0.1
```

`.github/workflows/release.yml` 仅响应 SemVer Tag，重新执行全部门禁，构建插件和
官方模块，生成 `SHA256SUMS`，然后使用 `gh release create --verify-tag` 创建
Release。带连字符的 Tag 自动标记为 prerelease。

Release 资产包括：

- `main.js`、`manifest.json`、`styles.css`；
- `SHA256SUMS`；
- `mypage-version.zip`；
- `mypage-platform-version.zip`（核心插件、官方模块、模块市场与主题市场）；
- 每个 `module-id_version.zip`；
- `module-market-*.json` 与 `theme-market-*.json` 市场资产。

工作流失败不会创建或覆盖一个未通过门禁的正式版本。
