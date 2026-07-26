import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repository = process.env.GITHUB_REPOSITORY || "SuShuHeng/MyPage";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const output = process.env.STAR_HISTORY_OUTPUT || "assets/star-history.svg";
const stars = token ? await loadStars(repository, token) : [];
const svg = renderChart(repository, stars);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${svg}\n`);
console.log(`Star history chart updated: ${output} (${stars.length} stars)`);

async function loadStars(repo, authorization) {
  const timestamps = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github.star+json",
          Authorization: `Bearer ${authorization}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "mypage-star-history",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub stargazers request failed: ${response.status}`);
    }
    const records = await response.json();
    for (const record of records) {
      if (typeof record.starred_at === "string") {
        timestamps.push(new Date(record.starred_at));
      }
    }
    if (records.length < 100) break;
  }
  return timestamps.sort((left, right) => left.getTime() - right.getTime());
}

function renderChart(repo, timestamps) {
  const width = 960;
  const height = 360;
  const margin = { top: 66, right: 34, bottom: 52, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const today = startOfDay(new Date());
  const first = timestamps[0] ? startOfDay(timestamps[0]) : today;
  const start = new Date(Math.min(first.getTime(), today.getTime()));
  if (timestamps.length > 0) start.setDate(start.getDate() - 1);
  const end = today.getTime() > start.getTime() ? today : addDays(start, 1);
  const points = buildPoints(start, end, timestamps);
  const maximum = Math.max(1, timestamps.length);
  const x = (date) =>
    margin.left +
    ((date.getTime() - start.getTime()) /
      (end.getTime() - start.getTime())) *
      plotWidth;
  const y = (count) =>
    margin.top + plotHeight - (count / maximum) * plotHeight;
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point.date).toFixed(1)},${y(point.count).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(end).toFixed(1)},${margin.top + plotHeight} L${x(start).toFixed(1)},${margin.top + plotHeight} Z`;
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round((maximum / 4) * index),
  );
  const xTicks = [
    start,
    new Date((start.getTime() + end.getTime()) / 2),
    end,
  ];
  const emptyMessage =
    timestamps.length === 0
      ? `<text class="empty" x="${width / 2}" y="${margin.top + plotHeight / 2}">No stars yet — be the first!</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(repo)} GitHub Star history</title>
  <desc id="description">Cumulative GitHub stars over time. Current total: ${timestamps.length}.</desc>
  <style>
    .background{fill:#fff}.title{fill:#20232a;font:700 20px system-ui,sans-serif}.total{fill:#6b7280;font:500 13px system-ui,sans-serif}.axis{stroke:#d8dee8;stroke-width:1}.label{fill:#77808f;font:12px system-ui,sans-serif}.area{fill:#8b5cf6;fill-opacity:.13}.line{fill:none;stroke:#7c3aed;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.dot{fill:#7c3aed}.empty{fill:#77808f;font:500 15px system-ui,sans-serif;text-anchor:middle}
    @media (prefers-color-scheme:dark){.background{fill:#11131a}.title{fill:#f3f4f6}.total,.label,.empty{fill:#9ca3af}.axis{stroke:#303543}.area{fill:#a78bfa;fill-opacity:.18}.line{stroke:#a78bfa}.dot{fill:#a78bfa}}
  </style>
  <rect class="background" width="${width}" height="${height}" rx="14"/>
  <text class="title" x="${margin.left}" y="32">${escapeXml(repo)} · Star History</text>
  <text class="total" x="${width - margin.right}" y="32" text-anchor="end">${timestamps.length} stars</text>
  ${yTicks
    .map((tick) => {
      const position = y(tick);
      return `<line class="axis" x1="${margin.left}" y1="${position}" x2="${width - margin.right}" y2="${position}"/><text class="label" x="${margin.left - 12}" y="${position + 4}" text-anchor="end">${tick}</text>`;
    })
    .join("")}
  ${xTicks
    .map(
      (tick, index) =>
        `<text class="label" x="${x(tick)}" y="${height - 20}" text-anchor="${index === 0 ? "start" : index === 2 ? "end" : "middle"}">${formatDate(tick)}</text>`,
    )
    .join("")}
  <path class="area" d="${area}"/>
  <path class="line" d="${line}"/>
  <circle class="dot" cx="${x(points.at(-1).date)}" cy="${y(points.at(-1).count)}" r="4"/>
  ${emptyMessage}
</svg>`;
}

function buildPoints(start, end, timestamps) {
  const counts = new Map();
  for (const timestamp of timestamps) {
    const key = dateKey(timestamp);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points = [];
  let cumulative = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    cumulative += counts.get(dateKey(date)) ?? 0;
    points.push({ date, count: cumulative });
  }
  if (points.length <= 90) return points;
  const sampled = [];
  const step = (points.length - 1) / 89;
  for (let index = 0; index < 90; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

function startOfDay(value) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value, count) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + count);
  return result;
}

function dateKey(value) {
  return value.toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/gu, (character) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}
