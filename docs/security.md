# 安全设计

## 模块隔离

- iframe 只有 `sandbox="allow-scripts"`，没有 `allow-same-origin`；
- CSP 为 `default-src 'none'`、`connect-src 'none'`；
- 模块代码通过 Blob ES Module 启动，不使用 `eval` 或 `new Function`；
- RPC 校验 iframe `event.source`、随机会话 ID、消息形状和 capability；
- 模块超时、错误和卸载只销毁自己的沙箱。

## 文件和 ZIP

- Vault 路径规范化并拒绝盘符、空路径和 `..`；
- 外部路径使用 `realpath`，授权前后双重作用域检查；
- ZIP 检查路径穿越、绝对路径、重复文件、单文件/总大小、压缩比和文件数量；
- 标准模块只允许固定文件和非可执行 `assets/`；
- 安装使用 staging、备份、rename 和失败回滚。

## 数据与隐私

- `data.json` 是唯一正式配置源，模块代码位于独立目录；
- API Token 等秘密使用 Obsidian SecretStorage，蓝图不导出秘密或授权；
- 查询表达式使用有限 parser/interpreter，不执行 JavaScript；
- 检测、哈希、Schema、查询、索引解析和 ZIP 检查在 Worker 中；
- 诊断默认不记录笔记正文。

## 更新

核心更新只接受 GitHub Release 的固定资产，校验 `SHA256SUMS` 后才替换。替换前
备份 `main.js`、`manifest.json` 和 `styles.css`，任一步失败都会恢复旧文件。
