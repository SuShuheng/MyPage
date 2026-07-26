export async function activate(api) {
  api.root.innerHTML = '<section class="weather-shell"><div class="weather-state">正在获取天气…</div></section>';
  const root = api.root.querySelector(".weather-shell");
  const descriptions = {0:"晴朗",1:"大致晴朗",2:"局部多云",3:"阴天",45:"雾",48:"雾凇",51:"小毛毛雨",53:"毛毛雨",55:"强毛毛雨",61:"小雨",63:"中雨",65:"大雨",71:"小雪",73:"中雪",75:"大雪",80:"阵雨",81:"中阵雨",82:"强阵雨",95:"雷暴"};
  async function refresh() {
    root.innerHTML = '<div class="weather-state">正在获取天气…</div>';
    try {
      const unit = String(api.config.temperatureUnit || "celsius");
      const query = new URLSearchParams({
        latitude: String(Number(api.config.latitude ?? 31.2304)),
        longitude: String(Number(api.config.longitude ?? 121.4737)),
        current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
        temperature_unit: unit,
        timezone: "auto"
      });
      const response = await api.request("network.request", {
        url: `https://api.open-meteo.com/v1/forecast?${query}`,
        method: "GET"
      });
      if (Number(response.status) >= 400) throw new Error(`HTTP ${response.status}`);
      const body = JSON.parse(String(response.body || "{}"));
      const current = body.current || {};
      const suffix = unit === "fahrenheit" ? "°F" : "°C";
      root.innerHTML = `<header><span>${escapeHtml(api.config.locationName || "自定义地点")}</span><small>${escapeHtml(descriptions[current.weather_code] || "天气")}</small></header><strong>${Number(current.temperature_2m).toFixed(1)}${suffix}</strong><p>体感 ${Number(current.apparent_temperature).toFixed(1)}${suffix}${api.config.showWind === false ? "" : ` · 风速 ${Number(current.wind_speed_10m).toFixed(1)} km/h`}</p><time>${escapeHtml(current.time || "")}</time>`;
    } catch (error) {
      root.innerHTML = `<div class="weather-error">天气读取失败：${escapeHtml(error.message || error)}<small>请检查坐标和 api.open-meteo.com 网络授权。</small></div>`;
    }
  }
  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value || "");
    return node.innerHTML;
  }
  api.onRefresh(refresh);
  await refresh();
}
