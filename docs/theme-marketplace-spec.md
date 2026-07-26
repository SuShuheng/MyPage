# MyPage 主题市场规范

主题市场仓库必须提供强制索引：

```text
.mypage-theme-market/
├─ manifest.json
└─ index.json
```

`index.json` 的 `schemaVersion` 固定为 `1`，`repository` 必须与用户输入的
GitHub `owner/repo` 一致，`themes` 中每个主题至少包含：

- `id`、`name`、`mode` 与 `tokens`
- 可选的 `description`、`author`、`version` 和 `preview`
- 可选的 `fontFamily`、`backgroundImage` 与 `motionScale`
- `tokens` 可覆盖颜色、卡片背景、圆角、阴影、透明度、模糊、布局间距和图表色板

官方主题市场由 MyPage 内置可信目录提供。第三方主题市场完全手动添加和检测，
不会在 Obsidian 启动或打开设置页时自动联网。安装主题只写入主题档案，不授予
模块能力，也不会执行第三方 JavaScript。
