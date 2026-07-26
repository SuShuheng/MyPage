# 天气

使用 Open-Meteo 获取用户指定经纬度的当前天气。模块只会访问 `api.open-meteo.com`，并且即使来自官方市场，也必须由用户授予 `network.request` 的域名范围。

天气会跟随 MyPage 的全局刷新计时器更新，不提供独立刷新按钮。
