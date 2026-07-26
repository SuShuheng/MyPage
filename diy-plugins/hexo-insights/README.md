# 可配置博客生命周期（Hexo Insights）

这是 MyPage 的平台压力测试模块，不是核心中的 Hexo 特例。用户可将
`publishedDirectory` 指向任意静态站点生成器的文章目录，并通过每个组件自己的
Vault 文件夹范围选择原稿。模块以用户规则对比原稿和发布目录，并可把 Git 提交
历史发布为统一数据源。它注册概览、待发布列表、贡献热力图、创作趋势、仓库状态、
两个数据源、生命周期转换、动作声明和 Dashboard 模板。

安装后始终处于沙箱。若要使用外部目录和 Git：

1. 在 MyPage 设置中将模块显式提升为“受信任”；
2. 分别授权准确的外部目录和仓库绝对路径；
3. 在模块配置中填写同样的路径；
4. 在组件数据范围中选择原稿文件夹。

官方来源只说明发布者可信，不会自动完成以上授权。

`lifecycleRules[].expression` 首版支持以下安全声明式语法：

- `published.exists`
- `!published.exists`
- `field:status == published`
- `field:status != draft`

规则按顺序匹配，不执行任意 JavaScript。没有命中的记录会根据外部目录中是否
存在同名文件回退为“已发布”或“待发布”。
