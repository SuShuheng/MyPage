import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
} from "echarts/charts";
import {
  AriaComponent,
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useEffect, useRef } from "preact/hooks";

echarts.use([
  AriaComponent,
  BarChart,
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  HeatmapChart,
  LegendComponent,
  LineChart,
  PieChart,
  SVGRenderer,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

interface EChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
  onSelect?: (value: unknown) => void;
}

export function EChart({ option, ariaLabel, onSelect }: EChartProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: "svg" });
    chartRef.current = chart;
    chart.on("click", (params) => onSelectRef.current?.(params.data));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const applyOption = () => {
      chartRef.current?.setOption(
        {
          animationDuration: 260,
          animationDurationUpdate: 180,
          aria: { enabled: true, description: ariaLabel },
          ...resolveCssColors(option, element),
        },
        { notMerge: true },
      );
    };
    applyOption();
    const themeObserver = new MutationObserver(applyOption);
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const shell = element.closest(".mypage-shell");
    if (shell) {
      themeObserver.observe(shell, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
    return () => themeObserver.disconnect();
  }, [ariaLabel, option]);

  return <div ref={elementRef} class="mypage-chart" role="img" aria-label={ariaLabel} />;
}

function resolveCssColors<T>(value: T, host: HTMLElement): T {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  host.append(probe);
  const cache = new Map<string, string>();
  const visit = (item: unknown): unknown => {
    if (
      typeof item === "string" &&
      (item.includes("var(") || item.includes("color-mix("))
    ) {
      const cached = cache.get(item);
      if (cached) return cached;
      probe.style.color = "";
      probe.style.color = item;
      const resolved = toLegacyRgb(getComputedStyle(probe).color);
      if (resolved) {
        cache.set(item, resolved);
        return resolved;
      }
      return item;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (typeof item === "object" && item !== null) {
      return Object.fromEntries(
        Object.entries(item).map(([key, nested]) => [key, visit(nested)]),
      );
    }
    return item;
  };
  try {
    return visit(value) as T;
  } finally {
    probe.remove();
  }
}

function toLegacyRgb(value: string): string {
  const match = value.match(
    /^color\(srgb\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*\/\s*([+-]?(?:\d+\.?\d*|\.\d+)))?\)$/u,
  );
  if (!match) return value;
  const channels = match.slice(1, 4).map((channel) =>
    Math.round(Math.max(0, Math.min(1, Number(channel))) * 255),
  );
  const alpha = match[4] === undefined
    ? 1
    : Math.max(0, Math.min(1, Number(match[4])));
  return alpha < 1
    ? `rgba(${channels.join(", ")}, ${alpha})`
    : `rgb(${channels.join(", ")})`;
}
