import { useMemo, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { createDateRange } from "../widgets/content-config";

const heatmapRange = createDateRange(180);
const goalRange = createDateRange(30);

export interface BuiltInWidgetDefinition {
  id: string;
  moduleId?: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  defaultConfig: Record<string, unknown>;
}

export const BUILT_IN_WIDGETS: BuiltInWidgetDefinition[] = [
  {
    id: "metric",
    name: "指标卡片",
    description: "总数、变化率、目标值与迷你趋势。",
    icon: "gauge",
    category: "统计",
    defaultConfig: { metric: "count" },
  },
  {
    id: "heatmap",
    name: "贡献热力图",
    description: "GitHub 风格的日历活动强度。",
    icon: "grid-3x3",
    category: "图表",
    defaultConfig: {
      granularity: "day",
      startDate: heatmapRange.startDate,
      endDate: heatmapRange.endDate,
    },
  },
  {
    id: "trend",
    name: "趋势图",
    description: "折线、面积和多序列时间趋势。",
    icon: "chart-no-axes-combined",
    category: "图表",
    defaultConfig: { mode: "area", bucket: "day" },
  },
  {
    id: "distribution",
    name: "分布图",
    description: "柱状、堆叠、饼图或环形图。",
    icon: "chart-pie",
    category: "图表",
    defaultConfig: { mode: "bar" },
  },
  {
    id: "notes",
    name: "笔记集合",
    description: "以列表、表格或卡片展示匹配笔记。",
    icon: "notebook-tabs",
    category: "内容",
    defaultConfig: { mode: "list", limit: 12 },
  },
  {
    id: "tasks",
    name: "TODO 与任务",
    description: "筛选、创建并受控切换任务状态。",
    icon: "list-todo",
    category: "效率",
    defaultConfig: {
      showCompleted: false,
      taskPath: "MyPage/TODO.md",
    },
  },
  {
    id: "goals",
    name: "日历与目标",
    description: "连续记录、目标进度、里程碑与日历。",
    icon: "goal",
    category: "效率",
    defaultConfig: {
      target: 30,
      targetDate: goalRange.endDate,
      mode: "progress",
    },
  },
  {
    id: "markdown-actions",
    name: "文本与快捷操作",
    description: "Markdown、说明文本和授权快捷按钮。",
    icon: "text-cursor-input",
    category: "内容",
    defaultConfig: {
      markdown: "## 欢迎使用 MyPage",
      pathTemplate: "MyPage/{date}.md",
      noteContent: "# 新笔记\n\n",
    },
  },
];

interface ComponentGalleryProps {
  onAdd: (definition: BuiltInWidgetDefinition) => void;
  onClose: () => void;
  installed: BuiltInWidgetDefinition[];
  onOpenMarketplace: () => void;
  onImportZip: () => void;
}

type GallerySource = "default" | "official" | "third-party" | "imported";

export function ComponentGallery({
  onAdd,
  onClose,
  installed,
  onOpenMarketplace,
  onImportZip,
}: ComponentGalleryProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<GallerySource>("default");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const sourceItems =
      source === "default"
        ? BUILT_IN_WIDGETS
        : installed.filter((definition) => definition.category === source);
    if (!normalized) return sourceItems;
    return sourceItems.filter((definition) =>
      `${definition.name} ${definition.description} ${definition.category}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [installed, query, source]);

  return (
    <aside
      class="mypage-gallery"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-gallery-title"
    >
      <header>
        <div>
          <p class="mypage-eyebrow">组件库</p>
          <h2 id="mypage-gallery-title">添加到当前主页</h2>
        </div>
        <button type="button" class="mypage-icon-button" aria-label="关闭组件库" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <label class="mypage-search">
        <Icon name="search" />
        <span class="mypage-visually-hidden">搜索组件</span>
        <input
          autoFocus
          type="search"
          placeholder="搜索组件、分类或用途"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div class="mypage-source-tabs" role="tablist" aria-label="组件来源">
        {([
          ["default", "默认组件"],
          ["official", "官方市场"],
          ["third-party", "第三方市场"],
          ["imported", "已导入"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={source === id}
            onClick={() => setSource(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {source !== "default" ? (
        <div class="mypage-gallery-market-actions">
          <button type="button" class="mypage-secondary-button" onClick={onOpenMarketplace}>
            <Icon name="store" />打开模块市场
          </button>
          <button type="button" class="mypage-secondary-button" onClick={onImportZip}>
            <Icon name="package-plus" />导入独立 ZIP
          </button>
        </div>
      ) : null}
      <div class="mypage-gallery-grid">
        {filtered.map((definition) => (
          <button
            type="button"
            class="mypage-gallery-card"
            key={definition.id}
            onClick={() => onAdd(definition)}
          >
            <span class="mypage-gallery-icon"><Icon name={definition.icon} /></span>
            <span>
              <strong>{definition.name}</strong>
              <small>{definition.description}</small>
              <em>{definition.category}</em>
            </span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div class="mypage-gallery-empty">
            <Icon name="package-open" />
            <p>此来源尚无可添加组件。安装模块后无需退出编辑会话，重新打开组件库即可添加。</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
