# MyPage 市场协议 v1

公开 GitHub 仓库必须包含：

```text
.mypage-market/
├─ manifest.json
└─ index.json
```

`manifest.json` 的 `index` 必须严格为 `.mypage-market/index.json`。MyPage 不会
递归嗅探仓库目录来替代索引；索引缺失或 Schema 无效时整个市场拒绝加载。

`index.json` 为每个模块声明仓库内位置和版本数组。每个版本包含：

- SemVer `version` 与 `releaseTag`；
- `module-id_version.zip` 的 HTTPS 地址；
- 小写 SHA-256；
- MyPage 版本范围、平台、权限摘要和 prerelease 标记。

官方市场固定为 `SuShuHeng/MyPage`。它只代表来源可信：

- 进入官方市场页面时可自动检测版本；
- 官方模块仍默认沙箱且没有任何自动授权。

第三方市场：

- 仅接受显式添加的公开 `owner/repo`；
- 不在启动或页面打开时自动访问；
- 用户点击手动检测后才更新缓存；
- 安装包仍执行相同的 ZIP、Schema、哈希、兼容性与原子安装检查。

运行 `npm run build:market` 生成官方索引与 ZIP，运行
`npm run validate:market` 校验协议。
