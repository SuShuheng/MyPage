import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const endpoint = process.env.MYPAGE_CDP_ENDPOINT || "http://127.0.0.1:9229";
const artifacts = path.resolve("tests", "artifacts");
await mkdir(artifacts, { recursive: true });
const evidence = {
  command: "npm run test:e2e:current",
  startedAt: new Date().toISOString(),
  endpoint,
  assertions: [],
  exitCode: 1,
};

let browser;
try {
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error("Obsidian renderer page was not found.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissFirstRun(page);
  const shell = page.locator(".mypage-shell");
  await shell.waitFor({ state: "visible", timeout: 20_000 });
  const onboarding = page.locator(".mypage-onboarding");
  if (await onboarding.isVisible().catch(() => false)) {
    await onboarding.getByRole("button", { name: /进入 MyPage/ }).click();
    await onboarding.waitFor({ state: "hidden", timeout: 10_000 });
  }

  const grid = page.locator(".mypage-grid").first();
  if (
    (await grid.getAttribute("title")) !== null ||
    (await grid.getAttribute("aria-label")) !== null
  ) {
    throw new Error("Dashboard grid still exposes a hover tooltip attribute.");
  }
  evidence.assertions.push("Dashboard grid no longer exposes the hover tooltip");

  const viewActions = page.locator(".mypage-topbar-actions button");
  if (
    (await page.getByRole("button", { name: "刷新数据" }).count()) !== 0 ||
    (await page.getByRole("button", { name: "编辑" }).count()) !== 0 ||
    (await viewActions.count()) !== 1 ||
    !(await viewActions.first().getAttribute("aria-label"))?.startsWith(
      "隐藏的主页",
    )
  ) {
    throw new Error("View-mode top-right actions do not contain only hidden pages.");
  }
  evidence.assertions.push(
    "View mode keeps only the hidden-page action in the top-right corner",
  );

  const originalTitle =
    (await page.locator(".mypage-dashboard-heading h1").textContent())?.trim() ??
    "";
  const originalWidgetCount = await page.locator(".mypage-widget").count();
  const target = page.locator(".grid-stack-item").first();
  const widgetId = await target.getAttribute("data-widget-id");
  if (!widgetId) throw new Error("Could not resolve a widget for cancel testing.");
  const originalLayout = await readLayout(target);

  await page.locator(".mypage-tab.is-active").click({ button: "right" });
  await page.getByText("编辑主页", { exact: true }).click();
  await page.getByRole("button", { name: /页头设置/ }).click();
  const headerModal = page.locator(".mypage-dashboard-header-modal");
  await headerModal.waitFor({ state: "visible", timeout: 10_000 });
  await settingInput(headerModal, "标题", "input[type='text']").fill(
    "未保存的 E2E 页头",
  );
  await settingInput(headerModal, "副标题", "input[type='text']").fill(
    "编辑会话中的副标题",
  );
  await settingInput(headerModal, "标题字号", "input[type='range']").fill("46");
  await settingInput(
    headerModal,
    "副标题字号",
    "input[type='range']",
  ).fill("15");
  const summarySetting = headerModal
    .locator(".setting-item")
    .filter({ hasText: "显示主页统计" })
    .first();
  const summaryToggle = summarySetting.locator("input[type='checkbox']");
  if (await summaryToggle.isChecked()) {
    await summaryToggle.click();
  }
  if (await summaryToggle.isChecked()) {
    throw new Error("Header summary toggle did not switch off.");
  }
  await headerModal
    .getByRole("button", { name: "应用到编辑会话" })
    .click();
  const draftHeading = page.locator(".mypage-dashboard-heading h1");
  await draftHeading.getByText("未保存的 E2E 页头", { exact: true }).waitFor({
    state: "visible",
  });
  const appliedFontSize = await draftHeading.evaluate(
    (heading) => globalThis.getComputedStyle(heading).fontSize,
  );
  const summaryCount = await page
    .locator(".mypage-dashboard-heading")
    .filter({ hasText: "未保存的 E2E 页头" })
    .locator(".mypage-dashboard-summary")
    .count();
  if (appliedFontSize !== "46px" || summaryCount !== 0) {
    throw new Error(
      `Dashboard header configuration was not applied to the draft: font=${appliedFontSize}, summaries=${summaryCount}.`,
    );
  }
  evidence.assertions.push(
    "Edit mode configures header text, font sizes and summary visibility",
  );

  const changed = await page.evaluate((targetWidgetId) => {
    const item = globalThis.document.querySelector(
      `.grid-stack-item[data-widget-id="${targetWidgetId}"]`,
    );
    const gridElement = item?.closest(".mypage-grid");
    const instance = gridElement?.gridstack;
    if (!item || !instance) return false;
    const currentX = Number(item.getAttribute("gs-x") ?? 0);
    const currentY = Number(item.getAttribute("gs-y") ?? 0);
    instance.update(item, {
      x: currentX === 0 ? 1 : 0,
      y: currentY + 1,
    });
    return true;
  }, widgetId);
  if (!changed) throw new Error("GridStack instance was unavailable.");
  await page.waitForTimeout(250);
  const draftLayout = await readLayout(target);
  if (JSON.stringify(draftLayout) === JSON.stringify(originalLayout)) {
    throw new Error("GridStack did not apply the draft layout change.");
  }
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .locator(".mypage-dashboard-heading h1")
    .getByText(originalTitle, { exact: true })
    .waitFor({ state: "visible" });
  const restored = await readLayout(
    page.locator(`.grid-stack-item[data-widget-id="${widgetId}"]`),
  );
  if (
    JSON.stringify(restored) !== JSON.stringify(originalLayout) ||
    (await page.locator(".mypage-widget").count()) !== originalWidgetCount
  ) {
    throw new Error(
      `Cancel did not restore layout: ${JSON.stringify(originalLayout)} -> ${JSON.stringify(restored)}`,
    );
  }
  evidence.assertions.push(
    "Cancel restores the exact pre-edit header and widget layout",
  );

  await page.evaluate(() => {
    const plugin = globalThis.app?.plugins?.plugins?.mypage;
    if (!plugin) throw new Error("MyPage plugin instance is unavailable.");
    plugin.openMarketplace();
  });
  const settings = page.locator(".mypage-settings");
  await settings.waitFor({ state: "visible", timeout: 20_000 });
  const logoBackground = await settings
    .locator(".mypage-settings-logo")
    .evaluate((element) => globalThis.getComputedStyle(element).backgroundColor);
  if (logoBackground !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Settings icon still has a background: ${logoBackground}`);
  }
  evidence.assertions.push("MyPage settings icon renders without an outer background");

  const moduleSearch = settings.getByRole("searchbox", {
    name: "搜索 DIY 模块",
  });
  await moduleSearch.fill("");
  await moduleSearch.click();
  await page.keyboard.type("专注", { delay: 55 });
  await page.waitForTimeout(180);
  if (
    (await moduleSearch.inputValue()) !== "专注" ||
    !(await moduleSearch.evaluate(
      (input) => input === globalThis.document.activeElement,
    ))
  ) {
    throw new Error("Module search lost focus or interrupted typing.");
  }
  await moduleSearch.fill("");
  const filter = settings.locator(".mypage-market-filter");
  await filter.locator("summary").click();
  const popover = filter.locator(".mypage-market-filter-popover");
  for (const label of ["安装状态", "适用平台", "模块类型"]) {
    await popover.getByText(label, { exact: true }).waitFor({ state: "visible" });
  }
  const visualization = popover
    .locator("label")
    .filter({ hasText: "可视化组件" })
    .locator("input[type='checkbox']");
  await visualization.check();
  if (
    (await filter.locator(".mypage-market-filter-count").textContent())?.trim() !==
    "1"
  ) {
    throw new Error("Module checkbox filter did not update its active count.");
  }
  await popover.getByRole("button", { name: "清除筛选" }).click();
  evidence.assertions.push(
    "Module market search keeps focus and floating checkbox filters support multiple directions",
  );

  await settings.getByRole("tab", { name: "主题市场" }).click();
  const themeSearch = settings.getByRole("searchbox", { name: "搜索主题" });
  await themeSearch.fill("");
  await themeSearch.click();
  await page.keyboard.type("主题", { delay: 55 });
  await page.waitForTimeout(180);
  if (
    (await themeSearch.inputValue()) !== "主题" ||
    !(await themeSearch.evaluate(
      (input) => input === globalThis.document.activeElement,
    ))
  ) {
    throw new Error("Theme search lost focus or interrupted typing.");
  }
  evidence.assertions.push("Theme market search updates without replacing its input");

  await settings.getByRole("tab", { name: "模块管理" }).click();
  const managementRows = settings.locator(".mypage-module-management-card");
  await managementRows.first().waitFor({ state: "visible", timeout: 10_000 });
  if (
    (await managementRows.getByRole("button", { name: "模块配置" }).count()) !== 0
  ) {
    throw new Error("Module management still exposes module configuration.");
  }
  await managementRows.first().getByRole("button", { name: "详情" }).click();
  await page
    .locator(".mypage-market-details-modal")
    .waitFor({ state: "visible", timeout: 10_000 });
  evidence.assertions.push(
    "Module management removes configuration while retaining dialog details",
  );

  await page.screenshot({
    path: path.join(artifacts, "current-goal-settings.png"),
    fullPage: true,
  });
  evidence.exitCode = 0;
} finally {
  if (browser) await browser.close();
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(artifacts, "current-goal-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
}

console.log(JSON.stringify(evidence, null, 2));

function settingInput(modal, name, selector) {
  return modal
    .locator(".setting-item")
    .filter({ hasText: name })
    .first()
    .locator(selector);
}

async function readLayout(locator) {
  return locator.evaluate((element) => ({
    x: element.getAttribute("gs-x"),
    y: element.getAttribute("gs-y"),
    w: element.getAttribute("gs-w"),
    h: element.getAttribute("gs-h"),
  }));
}

async function dismissFirstRun(page) {
  const candidates = [
    /Trust author and enable plugins/i,
    /信任.*作者并启用插件/,
    /Trust this vault/i,
    /信任此仓库/,
    /Open another vault/i,
  ];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let clicked = false;
    for (const name of candidates) {
      const button = page.getByRole("button", { name }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      if (await page.locator(".mypage-shell").isVisible().catch(() => false)) {
        break;
      }
      await page.waitForTimeout(250);
      continue;
    }
    await page.waitForTimeout(250);
  }
}
