# MyPage 模块开发指南

## 标准包

```text
module-id/
├─ manifest.json
├─ main.js
├─ styles.css
├─ config.schema.json
├─ README.md
└─ assets/
```

首版 `main.js` 必须是自包含 ES Module，不允许残留静态或动态外部 import。
一个包可注册多个 `widget`、`dataSource`、`transform`、`action`、
`dashboardTemplate` 和 `settings` 贡献。

## 运行 API

```js
export function activate(api) {
  api.root.textContent = "Hello";
  const stop = api.onData((queryResult) => {
    console.log(queryResult.records);
  });
  api.onTheme((tokens) => {
    console.log(tokens.accent);
  });
  // 只能请求 manifest 已声明、用户已逐项授权的能力。
  // await api.request("network.request", { url: "https://example.com" });
  return stop;
}
```

模块设置中名称包含 `token`、`secret`、`password` 或 `apiKey` 的字符串会被自动
写入 Obsidian SecretStorage，`data.json` 只保留 `secret:mypage-…` 引用。网络
请求可通过 `secretHeaders: { Authorization: reference }` 使用本模块自己的引用；
模块不能读取其他模块的秘密。

模块在没有 `allow-same-origin` 的 iframe 中运行，CSP 默认禁止网络。系统能力只能
通过 `api.request()` 到 MyPage Capability Broker。不要假设可以访问 Obsidian
对象、Node.js、父页面 DOM 或本地文件系统。

## 本地校验和打包

```powershell
npm run validate:modules
npm run package:module -- --module hello-widget
```

生成文件名为 `module-id_version.zip`。把标准目录放入测试 Vault 插件目录下的
`diy-plugins/` 后，在设置中点击“重新扫描本地模块”。

完整示例：

- `diy-plugins/hello-widget/`
- `diy-plugins/hexo-insights/`
