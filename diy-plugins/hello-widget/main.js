export function activate(api) {
  const title = document.createElement("h3");
  title.textContent = String(api.config.title || "Hello from a sandbox");
  const summary = document.createElement("p");
  summary.textContent = "等待 MyPage 数据…";
  const badge = document.createElement("span");
  badge.className = "hello-badge";
  badge.textContent = api.contributionId;
  api.root.append(title, summary, badge);
  api.onData((result) => {
    const count = Array.isArray(result && result.records) ? result.records.length : 0;
    summary.textContent = `当前组件范围内有 ${count} 条记录。`;
  });
  api.onTheme((theme) => {
    api.root.dataset.theme = String(theme.mode || "obsidian");
  });
}
