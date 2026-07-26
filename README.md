# MyPage

MyPage 是面向 Obsidian 的本地优先可视化主页与 DIY 模块平台。它提供多主页
TAB、响应式 iOS 风格组件网格、统一数据流水线、八类内置组件、三级主题、受控
写入、Dashboard 蓝图、模块市场、双层信任和应用内更新。

Hexo 不是核心业务。仓库中的 `hexo-insights` 只是平台压力测试：用户可以把它
配置为任意静态站点生成器的文章目录和 Git 仓库。

## 开发

要求 Node.js 20.19 或更高版本。

```powershell
npm ci
npm run build
npm run test:all
npm run validate:modules
npm run build:market
npm run validate:market
```

部署到专用测试 Vault：

```powershell
$env:MYPAGE_TEST_VAULT = 'H:\GitHub\TestDev'
npm run dev:deploy
```

不要将开发版部署到真实笔记库。构建产物是根目录的 `main.js`、`manifest.json`
和 `styles.css`。

## 文档

- [用户指南](docs/user-guide.md)
- [模块开发](docs/module-development.md)
- [市场协议](docs/marketplace-spec.md)
- [权限模型](docs/permissions.md)
- [安全设计](docs/security.md)
- [发布流程](docs/release.md)

许可证：[Apache-2.0](LICENSE)。
