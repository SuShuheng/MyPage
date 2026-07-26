export async function activate(api) {
  const state = { records: [], published: [], git: "" };
  const config = {
    publishedDirectory: String(api.config.publishedDirectory || ""),
    repository: String(api.config.repository || ""),
    sourceField: String(api.config.sourceField || "path"),
    publishedExtension: String(api.config.publishedExtension || ".md")
  };
  if (api.contributionId === "blog-records-source") {
    if (!config.publishedDirectory) {
      api.publishRecords([]);
      return;
    }
    try {
      const result = await api.request("externalFs.read", {
        path: config.publishedDirectory,
        operation: "list",
        recursive: true
      });
      const entries = Array.isArray(result && result.entries) ? result.entries : [];
      api.publishRecords(entries.filter((entry) => entry.type === "file").map((entry, index) => ({
        id: `published:${entry.path || index}`,
        type: "published-post",
        fields: {
          path: String(entry.path || ""),
          size: Number(entry.size || 0),
          extension: String(entry.path || "").split(".").pop() || ""
        }
      })));
    } catch (error) {
      api.log(`blog-records-source: ${error.message || error}`);
      api.publishRecords([]);
    }
    return;
  }
  if (api.contributionId === "repository-history-source") {
    if (!config.repository) {
      api.publishRecords([]);
      return;
    }
    try {
      const result = await api.request("git.read", {
        repository: config.repository,
        operation: "log",
        args: ["-n", "200", "--date=iso-strict", "--pretty=format:%H%x09%aI%x09%s"]
      });
      const lines = String(result && result.stdout || "").split(/\r?\n/).filter(Boolean);
      api.publishRecords(lines.map((line, index) => {
        const [hash = "", authoredAt = "", ...subjectParts] = line.split("\t");
        return {
          id: `commit:${hash || index}`,
          type: "repository-commit",
          timestamp: Date.parse(authoredAt) || 0,
          fields: {
            hash,
            authoredAt,
            subject: subjectParts.join("\t")
          }
        };
      }));
    } catch (error) {
      api.log(`repository-history-source: ${error.message || error}`);
      api.publishRecords([]);
    }
    return;
  }
  api.root.innerHTML = '<div class="hexo-shell"><div class="hexo-status">正在载入组件数据…</div><div class="hexo-content"></div><button class="hexo-refresh" type="button">刷新外部状态</button></div>';
  const status = api.root.querySelector(".hexo-status");
  const content = api.root.querySelector(".hexo-content");
  api.root.querySelector(".hexo-refresh").addEventListener("click", () => refreshExternal());
  api.onData((result) => {
    state.records = Array.isArray(result && result.records) ? result.records : [];
    render();
  });
  async function refreshExternal() {
    status.textContent = "正在通过授权代理读取外部数据…";
    const jobs = [];
    if (config.publishedDirectory) {
      jobs.push(api.request("externalFs.read", {
        path: config.publishedDirectory,
        operation: "list",
        recursive: true
      }).then((result) => {
        state.published = Array.isArray(result && result.entries) ? result.entries : [];
      }));
    }
    if (config.repository) {
      jobs.push(api.request("git.read", {
        repository: config.repository,
        operation: "status",
        args: ["--short", "--branch"]
      }).then((result) => {
        state.git = String(result && result.stdout || "").trim();
      }));
    }
    try {
      await Promise.all(jobs);
      status.textContent = jobs.length ? "外部数据已刷新" : "请在组件配置中填写发布目录或 Git 仓库";
    } catch (error) {
      status.textContent = `读取被拒绝或失败：${error.message || error}`;
    }
    render();
  }
  function sourcePath(record) {
    return String(record && record.sourceRef && record.sourceRef.path || record && record.fields && record.fields[config.sourceField] || "");
  }
  function stem(path) {
    return path.replaceAll("\\", "/").split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
  }
  function publishedNames() {
    return new Set(state.published.filter((entry) => entry.type === "file" && entry.path.endsWith(config.publishedExtension)).map((entry) => stem(entry.path)));
  }
  function lifecycle(record) {
    const isPublished = publishedNames().has(stem(sourcePath(record)));
    const fields = record && record.fields || {};
    const rules = Array.isArray(api.config.lifecycleRules) ? api.config.lifecycleRules : [];
    for (const rule of rules) {
      const expression = String(rule && rule.expression || "").trim();
      let matches = false;
      if (expression === "published.exists") matches = isPublished;
      else if (expression === "!published.exists") matches = !isPublished;
      else {
        const fieldMatch = expression.match(/^field:([A-Za-z0-9_.-]+)\s*(==|!=)\s*(.+)$/);
        if (fieldMatch) {
          const actual = String(fields[fieldMatch[1]] ?? "");
          const expected = fieldMatch[3].replace(/^["']|["']$/g, "");
          matches = fieldMatch[2] === "==" ? actual === expected : actual !== expected;
        }
      }
      if (matches) {
        return {
          id: String(rule.id || (isPublished ? "published" : "pending")),
          label: String(rule.label || rule.id || "未命名状态")
        };
      }
    }
    return isPublished
      ? { id: "published", label: "已发布" }
      : { id: "pending", label: "待发布" };
  }
  function pending() {
    return state.records.filter((record) => lifecycle(record).id !== "published");
  }
  function render() {
    const id = api.contributionId;
    if (id === "lifecycle-summary") {
      content.innerHTML = `<div class="hexo-metrics"><article><strong>${state.records.length}</strong><span>原稿</span></article><article><strong>${state.published.filter((entry) => entry.type === "file").length}</strong><span>已发布文件</span></article><article><strong>${pending().length}</strong><span>待发布</span></article></div>`;
    } else if (id === "pending-posts") {
      const rows = pending().slice(0, 50).map((record) => `<li>${escapeHtml(sourcePath(record))}</li>`).join("");
      content.innerHTML = rows ? `<ol class="hexo-list">${rows}</ol>` : '<p class="hexo-empty">没有待发布文章，或尚未授权发布目录。</p>';
    } else if (id === "blog-heatmap") {
      const days = new Map();
      state.records.forEach((record) => {
        const value = Number(record.timestamp || record.fields && record.fields.modified || 0);
        const day = value ? new Date(value).toISOString().slice(0, 10) : "";
        if (day) days.set(day, (days.get(day) || 0) + 1);
      });
      content.innerHTML = `<div class="hexo-heatmap">${Array.from(days.entries()).slice(-180).map(([day, count]) => `<i title="${day}: ${count}" style="--level:${Math.min(count, 4)}"></i>`).join("")}</div>`;
    } else if (id === "writing-trend") {
      const months = new Map();
      state.records.forEach((record) => {
        const value = Number(record.timestamp || record.fields && record.fields.modified || 0);
        const month = value ? new Date(value).toISOString().slice(0, 7) : "";
        if (month) months.set(month, (months.get(month) || 0) + 1);
      });
      const points = Array.from(months.entries()).slice(-12);
      const max = Math.max(1, ...points.map(([, count]) => count));
      content.innerHTML = points.length
        ? `<div class="hexo-trend">${points.map(([month, count]) => `<span title="${month}: ${count}"><i style="height:${Math.max(8, Math.round(count / max * 100))}%"></i><small>${month.slice(5)}</small></span>`).join("")}</div>`
        : '<p class="hexo-empty">当前范围没有可用于趋势统计的日期。</p>';
    } else {
      content.innerHTML = `<pre class="hexo-git">${escapeHtml(state.git || "尚未读取 Git 状态。")}</pre>`;
    }
  }
  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value || "");
    return node.innerHTML;
  }
  await refreshExternal();
}
