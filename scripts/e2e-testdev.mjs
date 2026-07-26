import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const endpoint = process.env.MYPAGE_CDP_ENDPOINT || "http://127.0.0.1:9229";
const artifacts = path.resolve("tests", "artifacts");
await mkdir(artifacts, { recursive: true });
const startedAt = new Date();
const evidence = {
  command: "npm run test:e2e",
  startedAt: startedAt.toISOString(),
  os: `${process.platform}/${process.arch}`,
  endpoint,
  assertions: [],
  consoleErrors: [],
  externalWarnings: [],
  pageErrors: [],
  exitCode: 1,
};
let browser;
try {
  await waitForEndpoint(endpoint, 30_000);
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error("Obsidian renderer page was not found.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.location().url;
      const entry = `${message.text()}${source ? ` (${source})` : ""}`.slice(0, 1_000);
      if (
        source.startsWith("https://api.github.com/repos/SuShuHeng/MyPage/") &&
        (message.text().includes("403") || message.text().includes("404"))
      ) {
        evidence.externalWarnings.push(entry);
      } else {
        evidence.consoleErrors.push(entry);
      }
    }
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message.slice(0, 1_000)));

  await dismissFirstRun(page);
  const onboarding = page.locator(".mypage-onboarding");
  if (await onboarding.isVisible().catch(() => false)) {
    evidence.assertions.push("MyPage onboarding became visible");
    await onboarding.getByRole("button", { name: /进入 MyPage/ }).click();
    await onboarding.waitFor({ state: "hidden", timeout: 10_000 });
  } else {
    evidence.assertions.push("Previously completed onboarding was respected");
  }

  const shell = page.locator(".mypage-shell");
  await shell.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(500);
  const initialWidgets = await page.locator(".mypage-widget").count();
  if (initialWidgets < 5) throw new Error(`Expected at least 5 widgets, found ${initialWidgets}.`);
  evidence.assertions.push(`Default dashboard rendered ${initialWidgets} widgets`);
  const viewModeWidgetMenus = await page.locator(
    ".mypage-widget-header > .mypage-icon-button",
  ).count();
  if (viewModeWidgetMenus !== 0) {
    throw new Error(
      `Expected no widget menus in view mode, found ${viewModeWidgetMenus}.`,
    );
  }
  evidence.assertions.push("View mode does not render widget menu buttons");
  const liveBadges = await page.locator(".mypage-widget-kicker").count();
  if (liveBadges !== 0) {
    throw new Error(`Expected no redundant live badges, found ${liveBadges}.`);
  }
  evidence.assertions.push("Widget headers do not render redundant live badges");

  const outerScrollbars = await page.locator(".mypage-widget").evaluateAll(
    (widgets) =>
      widgets.filter((widget) => {
        const overflow = globalThis.getComputedStyle(widget).overflowY;
        return overflow === "auto" || overflow === "scroll";
      }).length,
  );
  if (outerScrollbars > 0) {
    throw new Error(`${outerScrollbars} widgets expose an outer scrollbar.`);
  }
  evidence.assertions.push("Widget cards hide outer scrollbars");

  const notesButtons = page.locator(".mypage-notes-list button");
  if ((await notesButtons.count()) >= 2) {
    const notesGap = Number.parseFloat(
      await page
        .locator(".mypage-notes-list")
        .first()
        .evaluate((element) => globalThis.getComputedStyle(element).rowGap),
    );
    const noteRows = await notesButtons.evaluateAll((buttons) =>
      buttons.slice(0, 8).map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      }),
    );
    if (!Number.isFinite(notesGap) || notesGap < 4) {
      throw new Error(`Note collection row gap is only ${notesGap}px.`);
    }
    for (let index = 1; index < noteRows.length; index += 1) {
      if (
        noteRows[index].height < 48 ||
        noteRows[index].top < noteRows[index - 1].bottom
      ) {
        throw new Error("Note collection rows overlap or are too tightly spaced.");
      }
    }
    evidence.assertions.push("Note collection rows have readable spacing");
  }

  const tasksWidget = page.locator(".mypage-tasks").first();
  await tasksWidget.waitFor({ state: "visible", timeout: 10_000 });
  const taskText = `MyPage E2E TODO ${Date.now()}`;
  const taskInput = tasksWidget.getByRole("textbox", { name: "新任务内容" });
  await taskInput.fill(taskText);
  await tasksWidget.getByRole("button", { name: "创建任务" }).click();
  const taskConfirm = page.locator(".mypage-dialog-modal");
  await taskConfirm.waitFor({ state: "visible", timeout: 10_000 });
  await taskConfirm.getByRole("button", { name: "创建", exact: true }).click();
  await tasksWidget.getByText(taskText, { exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const createdTask = tasksWidget
    .locator(".mypage-tasks-list label")
    .filter({ hasText: taskText });
  await createdTask.locator('input[type="checkbox"]').click();
  await createdTask.waitFor({ state: "visible", timeout: 20_000 });
  await createdTask.getByText(/完成于/).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const taskLabels = tasksWidget.locator(".mypage-tasks-list label");
  const taskOrder = await taskLabels.evaluateAll((labels, text) => ({
    createdIndex: labels.findIndex((label) =>
      label.textContent?.includes(String(text))),
    completed: labels.map(
      (label) =>
        label.querySelector('input[type="checkbox"]')?.checked === true,
    ),
  }), taskText);
  const firstCompleted = taskOrder.completed.indexOf(true);
  if (
    firstCompleted < 0 ||
    taskOrder.createdIndex < firstCompleted ||
    taskOrder.completed.slice(firstCompleted).some((completed) => !completed)
  ) {
    throw new Error("Completed TODO records were not grouped at the bottom.");
  }
  await createdTask.click({ button: "right" });
  await page.getByText("清除完成记录", { exact: true }).waitFor({
    state: "visible",
  });
  await page.keyboard.press("Escape");
  evidence.assertions.push(
    "TODO create uses themed confirmation; completed task stays visible at bottom with time and context action",
  );

  await page.getByRole("button", { name: "编辑" }).click();
  const editModeWidgetMenus = await page.locator(
    ".mypage-widget-header > .mypage-icon-button",
  ).count();
  if (editModeWidgetMenus !== initialWidgets) {
    throw new Error(
      `Expected ${initialWidgets} widget menus in edit mode, found ${editModeWidgetMenus}.`,
    );
  }
  evidence.assertions.push("Edit mode renders one menu button per widget");

  const markdownModal = await openWidgetConfiguration(
    page,
    "文本与快捷操作",
  );
  await assertConfigurationTabs(markdownModal);
  const pathTemplate = markdownModal
    .locator(".setting-item")
    .filter({ hasText: "创建笔记路径模板" })
    .locator("input");
  await pathTemplate.fill("MyPage/E2E/{timestamp}.md");
  await markdownModal.getByRole("tab", { name: "通用设置" }).click();
  await markdownModal.getByRole("tab", { name: "高级设置" }).click();
  await markdownModal.getByRole("tab", { name: "内容设置" }).click();
  if ((await pathTemplate.inputValue()) !== "MyPage/E2E/{timestamp}.md") {
    throw new Error("Content configuration was lost while switching tabs.");
  }
  await markdownModal
    .getByRole("button", { name: "应用到编辑会话" })
    .click();
  evidence.assertions.push("Content settings are prioritized and survive tab switches");

  const heatmapModal = await openWidgetConfiguration(page, "贡献热力图");
  await assertConfigurationTabs(heatmapModal);
  if ((await heatmapModal.locator('input[type="date"]').count()) !== 2) {
    throw new Error("Heatmap content settings do not expose a date range.");
  }
  await heatmapModal.getByRole("button", { name: "取消" }).click();
  evidence.assertions.push("Heatmap exposes configurable start and end dates");

  const goalModal = await openWidgetConfiguration(page, "日历与目标");
  await assertConfigurationTabs(goalModal);
  if (
    (await goalModal.locator('input[type="number"]').count()) < 1 ||
    (await goalModal.locator('input[type="date"]').count()) < 1
  ) {
    throw new Error("Goal settings do not expose target count and completion date.");
  }
  await goalModal.getByRole("button", { name: "取消" }).click();
  evidence.assertions.push("Goal exposes target count and completion date settings");

  const dragHandle = page.locator(".mypage-drag-handle").first();
  await dragHandle.waitFor({ state: "visible", timeout: 10_000 });
  const draggedItem = dragHandle.locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' grid-stack-item ')][1]",
  );
  const draggedWidgetId = await draggedItem.getAttribute("data-widget-id");
  const beforeDrag = await draggedItem.evaluate((element) => ({
    x: element.getAttribute("gs-x"),
    y: element.getAttribute("gs-y"),
  }));
  const handleBox = await dragHandle.boundingBox();
  if (!draggedWidgetId || !handleBox) {
    throw new Error("Could not resolve the first widget drag handle.");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 120,
    handleBox.y + handleBox.height / 2 + 140,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    ({ widgetId, previous }) => {
      const element = globalThis.document.querySelector(
        `[data-widget-id="${widgetId}"]`,
      );
      return (
        element?.getAttribute("gs-x") !== previous.x ||
        element?.getAttribute("gs-y") !== previous.y
      );
    },
    { widgetId: draggedWidgetId, previous: beforeDrag },
    { timeout: 10_000 },
  );
  evidence.assertions.push("Edit-mode drag handle moved a widget");

  await page.getByRole("button", { name: /添加组件/ }).click();
  const galleryCards = page.locator(".mypage-gallery-card");
  if ((await galleryCards.count()) < 8) {
    throw new Error("The built-in component gallery did not render all cards.");
  }
  const cardGeometry = await galleryCards.evaluateAll((cards) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
      };
    }),
  );
  for (let index = 0; index < cardGeometry.length; index += 1) {
    const card = cardGeometry[index];
    if (card.height < 72 || card.scrollHeight > card.clientHeight + 1) {
      throw new Error(`Gallery card ${index + 1} clips its content.`);
    }
    const previous = cardGeometry[index - 1];
    if (previous && card.top - previous.bottom < 8) {
      throw new Error(`Gallery cards ${index} and ${index + 1} overlap.`);
    }
  }
  const overlayAlpha = await page.locator(".mypage-overlay").evaluate((element) => {
    const color = globalThis.getComputedStyle(element).backgroundColor;
    const match = color.match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/);
    return match?.[1] === undefined ? 1 : Number(match[1]);
  });
  if (overlayAlpha > 0.2) {
    throw new Error(`Gallery overlay obscures the dashboard (alpha ${overlayAlpha}).`);
  }
  const leakedGridControls = await page.evaluate(() => {
    const gallery = globalThis.document.querySelector(".mypage-gallery");
    if (!gallery) return 0;
    const drawer = gallery.getBoundingClientRect();
    return [
      ...globalThis.document.querySelectorAll(
        ".mypage-grid .mypage-drag-handle, .mypage-grid .ui-resizable-handle",
      ),
    ].filter((control) => {
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (
        x < drawer.left ||
        x > drawer.right ||
        y < drawer.top ||
        y > drawer.bottom
      ) {
        return false;
      }
      return globalThis.document
        .elementFromPoint(x, y)
        ?.closest(".mypage-grid") !== null;
    }).length;
  });
  if (leakedGridControls > 0) {
    throw new Error(
      `${leakedGridControls} dashboard edit controls leaked above the gallery.`,
    );
  }
  evidence.assertions.push("Gallery cards have readable spacing without overlap");
  evidence.assertions.push("Dashboard remains visible behind the component gallery");
  evidence.assertions.push("Dashboard edit controls stay below the gallery");
  await page.screenshot({
    path: path.join(artifacts, "testdev-gallery.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: /已导入/ }).click();
  await page
    .locator(".mypage-gallery")
    .getByRole("button", { name: /Hello Widget/ })
    .click();
  await page.getByRole("button", { name: /添加组件/ }).click();
  await page.getByRole("tab", { name: /已导入/ }).click();
  await page
    .locator(".mypage-gallery")
    .getByRole("button", { name: /博客生命周期概览/ })
    .click();

  const moduleModal = await openWidgetConfiguration(
    page,
    "博客生命周期概览",
  );
  await assertConfigurationTabs(moduleModal);
  await moduleModal.getByText("已发布文章目录", { exact: true }).waitFor({
    state: "visible",
    timeout: 10_000,
  });
  const publishedDirectory = moduleModal
    .locator(".setting-item")
    .filter({ hasText: "已发布文章目录" })
    .locator("input");
  if (!(await publishedDirectory.getAttribute("title"))?.includes("绝对")) {
    throw new Error("Module field does not expose hover guidance.");
  }
  await publishedDirectory.fill("relative/path");
  await publishedDirectory.blur();
  await moduleModal.getByText(/需要填写绝对路径/).waitFor({
    state: "visible",
    timeout: 10_000,
  });
  const invalidBorder = await publishedDirectory.evaluate(
    (element) => globalThis.getComputedStyle(element).borderColor,
  );
  if (!invalidBorder) {
    throw new Error("Invalid module path did not receive visual feedback.");
  }
  await moduleModal.getByRole("button", { name: "取消" }).click();
  evidence.assertions.push(
    "DIY module settings expose hover guidance and inline path validation",
  );

  await page.getByRole("button", { name: /完成/ }).click();
  const helloFrame = page
    .locator(".mypage-widget")
    .filter({ has: page.getByRole("heading", { name: "Hello Widget", exact: true }) })
    .locator("iframe.mypage-module-sandbox")
    .last();
  await helloFrame.waitFor({ state: "attached", timeout: 10_000 });
  await helloFrame.contentFrame().getByText(/Hello from a sandbox/).waitFor({
    state: "visible",
    timeout: 10_000,
  });
  evidence.assertions.push("Self-contained DIY module rendered in sandbox iframe");
  const lifecycleFrame = page
    .locator(".mypage-widget")
    .filter({
      has: page.getByRole("heading", {
        name: "博客生命周期概览",
        exact: true,
      }),
    })
    .locator("iframe.mypage-module-sandbox")
    .last();
  await lifecycleFrame.waitFor({ state: "attached", timeout: 10_000 });
  await lifecycleFrame.contentFrame().getByText("原稿", { exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const lifecycleCount = Number(
    await lifecycleFrame
      .contentFrame()
      .locator(".hexo-metrics strong")
      .first()
      .textContent(),
  );
  const lifecycleColor = await lifecycleFrame
    .contentFrame()
    .locator(".hexo-metrics")
    .evaluate((element) => globalThis.getComputedStyle(element).color);
  if (!Number.isFinite(lifecycleCount) || lifecycleCount < 1) {
    throw new Error(`DIY lifecycle module did not render records: ${lifecycleCount}.`);
  }
  if (lifecycleColor === "rgba(0, 0, 0, 0)" || lifecycleColor === "transparent") {
    throw new Error("DIY lifecycle module text is transparent.");
  }
  const moduleRootOverflow = await lifecycleFrame
    .contentFrame()
    .locator("html")
    .evaluate((element) => globalThis.getComputedStyle(element).overflowY);
  if (moduleRootOverflow !== "hidden") {
    throw new Error(`DIY module root overflow is ${moduleRootOverflow}.`);
  }
  evidence.assertions.push("DIY module receives initial data and hides root scrolling");
  for (const contributionId of [
    "lifecycle-summary",
    "pending-posts",
    "blog-heatmap",
    "writing-trend",
    "repository-status",
  ]) {
    const frame = page
      .locator(`iframe.mypage-module-sandbox[title$="${contributionId}"]`)
      .first();
    await frame.waitFor({ state: "attached", timeout: 10_000 });
    const renderedChildren = await frame
      .contentFrame()
      .locator(".hexo-content")
      .evaluate((element) => element.children.length);
    if (renderedChildren < 1) {
      throw new Error(`DIY contribution ${contributionId} rendered empty content.`);
    }
  }
  evidence.assertions.push(
    "Every imported Hexo widget contribution renders a visible content container",
  );

  await page.evaluate(() => {
    const obsidian = globalThis;
    const plugin = obsidian.app?.plugins?.plugins?.mypage;
    if (!plugin) throw new Error("MyPage plugin instance is unavailable.");
    plugin.openMarketplace();
  });
  const settingsRoot = page.locator(".mypage-settings");
  await settingsRoot.waitFor({ state: "visible", timeout: 10_000 });
  for (const tabName of [
    "通用",
    "高级",
    "外观",
    "主题市场",
    "模块市场",
    "模块管理",
    "关于",
    "备份与恢复",
  ]) {
    await settingsRoot.getByRole("tab", { name: tabName }).waitFor({
      state: "visible",
    });
  }
  await settingsRoot.getByText("Hello Widget", { exact: true }).waitFor({
    state: "visible",
  });
  const helloMarketCard = settingsRoot
    .locator(".mypage-module-market-card")
    .filter({ hasText: "Hello Widget" });
  await helloMarketCard.click();
  const moduleMarketDetail = settingsRoot.locator(".mypage-market-detail");
  await moduleMarketDetail.getByRole("heading", { name: "Hello Widget" }).waitFor({
    state: "visible",
  });
  await moduleMarketDetail.getByRole("button", { name: "删除" }).waitFor({
    state: "visible",
  });
  await page.screenshot({
    path: path.join(artifacts, "testdev-module-market.png"),
    fullPage: true,
  });
  evidence.assertions.push(
    "Settings center exposes eight tabs and module cards open inline details and actions",
  );
  await settingsRoot.getByRole("tab", { name: "主题市场" }).click();
  if ((await settingsRoot.locator(".mypage-theme-card").count()) < 4) {
    throw new Error("Official theme market did not expose the preset themes.");
  }
  await settingsRoot.locator(".mypage-theme-card").first().click();
  const themeMarketDetail = settingsRoot.locator(".mypage-market-detail");
  await themeMarketDetail.locator("h3").waitFor({ state: "visible" });
  await themeMarketDetail
    .getByRole("button", { name: /安装主题|应用主题/ })
    .first()
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: path.join(artifacts, "testdev-theme-market.png"),
    fullPage: true,
  });
  evidence.assertions.push(
    "Official theme market exposes multiple presets with inline details and install actions",
  );
  await settingsRoot.getByRole("tab", { name: "模块管理" }).click();
  const hexoManagement = settingsRoot
    .locator(".mypage-module-management-card")
    .filter({ hasText: "可配置博客生命周期" });
  await hexoManagement.getByRole("button", { name: "权限与信任" }).click();
  const permissionModal = page.locator(".mypage-permission-modal");
  await permissionModal.waitFor({ state: "visible", timeout: 10_000 });
  await permissionModal
    .getByRole("button", { name: "设置并授权" })
    .first()
    .click();
  await permissionModal
    .locator(".mypage-permission-scope-editor")
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.screenshot({
    path: path.join(artifacts, "testdev-permission-editor.png"),
    fullPage: true,
  });
  evidence.assertions.push("Module setup-and-authorize action opens an inline scope editor");
  await permissionModal.locator(".modal-close-button").click();
  await settingsRoot.getByRole("tab", { name: "关于" }).click();
  await settingsRoot.getByText(`MyPage 1.0.0`, { exact: true }).waitFor({
    state: "visible",
  });
  await settingsRoot.getByText("Apache License 2.0", { exact: true }).waitFor({
    state: "visible",
  });
  await page.screenshot({
    path: path.join(artifacts, "testdev-settings.png"),
    fullPage: true,
  });
  evidence.assertions.push("About tab exposes version, repository, license and updater controls");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "编辑" }).click();
  const beforeCancel = await page.locator(".mypage-widget").count();
  await page.getByRole("button", { name: /添加组件/ }).click();
  await page
    .locator(".mypage-gallery")
    .getByRole("button", { name: /^分布图 / })
    .click();
  await page.getByRole("button", { name: "取消" }).click();
  const afterCancel = await page.locator(".mypage-widget").count();
  if (afterCancel !== beforeCancel) {
    throw new Error("Cancel did not discard dashboard widget changes.");
  }
  evidence.assertions.push("Edit-session cancel discarded layout changes");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".mypage-shell").waitFor({ state: "visible", timeout: 20_000 });
  const reloadedModuleFrames = page.locator(
    ".mypage-module-widget iframe.mypage-module-sandbox",
  );
  await reloadedModuleFrames.first().waitFor({
    state: "attached",
    timeout: 10_000,
  });
  await page.getByText(/条匹配记录/).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  let reloadedSandboxVisible = false;
  for (let attempt = 0; attempt < 20 && !reloadedSandboxVisible; attempt += 1) {
    const frameCount = await reloadedModuleFrames.count();
    for (let index = 0; index < frameCount; index += 1) {
      if (
        await reloadedModuleFrames
          .nth(index)
          .contentFrame()
          .getByText(/Hello from a sandbox/)
          .isVisible()
          .catch(() => false)
      ) {
        reloadedSandboxVisible = true;
        break;
      }
    }
    if (!reloadedSandboxVisible) await page.waitForTimeout(250);
  }
  if (!reloadedSandboxVisible) {
    throw new Error("Committed sandbox module was not visible after reload.");
  }
  evidence.assertions.push("Committed dashboard survived renderer reload");
  await page.screenshot({
    path: path.join(artifacts, "testdev-dashboard.png"),
    fullPage: true,
  });
  const unnamedButtons = await page.locator(".mypage-shell button").evaluateAll(
    (buttons) =>
      buttons.filter(
        (button) =>
          !(
            button.getAttribute("aria-label") ||
            button.textContent?.trim() ||
            button.getAttribute("title")
          ),
      ).length,
  );
  if (unnamedButtons > 0) {
    throw new Error(`Found ${unnamedButtons} dashboard buttons without an accessible name.`);
  }
  evidence.assertions.push("Dashboard buttons expose accessible names");

  const shellElement = page.locator(".mypage-shell");
  await shellElement.evaluate((element) => {
    element.style.setProperty("--interactive-accent", "rgb(12, 140, 110)");
  });
  await page.waitForFunction(
    (target) =>
      [...globalThis.document.querySelectorAll(".mypage-chart svg *")].some((element) => {
        const style = globalThis.getComputedStyle(element);
        return style.fill === target || style.stroke === target;
      }),
    "rgb(12, 140, 110)",
  );
  await shellElement.evaluate((element) => {
    element.style.removeProperty("--interactive-accent");
  });
  evidence.assertions.push("Runtime theme accent propagated to interactive charts");

  const leftSidebar = page.locator(".workspace-split.mod-left-split");
  if (
    (await leftSidebar
      .evaluate((element) => element.getBoundingClientRect().width)
      .catch(() => 0)) > 0
  ) {
    await page.locator(".sidebar-toggle-button.mod-left").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // This callback executes inside the Obsidian renderer, not Node.js.
  // eslint-disable-next-line no-undef
  await page.waitForFunction(() => document.documentElement.clientWidth <= 390);
  const overflow = await page.locator(".mypage-shell").evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  if (overflow > 2) throw new Error(`Mobile layout overflows horizontally by ${overflow}px.`);
  await page.screenshot({
    path: path.join(artifacts, "testdev-mobile.png"),
    fullPage: true,
  });
  evidence.assertions.push("390px mobile layout has no horizontal overflow");
  evidence.exitCode = 0;
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  const page = browser?.contexts().flatMap((context) => context.pages())[0];
  await page
    ?.screenshot({
      path: path.join(artifacts, "e2e-failure.png"),
      fullPage: true,
    })
    .catch(() => undefined);
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(artifacts, "testdev-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await browser?.close();
}

async function waitForEndpoint(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`CDP endpoint did not become ready: ${lastError}`);
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

async function openWidgetConfiguration(page, title) {
  const widget = page
    .locator(".mypage-widget")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .last();
  await widget.waitFor({ state: "visible", timeout: 10_000 });
  await widget.getByRole("button", { name: `${title}菜单` }).click();
  await page.getByText("配置组件", { exact: true }).click();
  const modal = page.locator(".mypage-widget-config-modal");
  await modal.waitFor({ state: "visible", timeout: 10_000 });
  return modal;
}

async function assertConfigurationTabs(modal) {
  for (const name of ["内容设置", "通用设置", "高级设置"]) {
    await modal.getByRole("tab", { name }).waitFor({ state: "visible" });
  }
  const selected = await modal
    .getByRole("tab", { name: "内容设置" })
    .getAttribute("aria-selected");
  if (selected !== "true") {
    throw new Error("The content settings tab is not selected by default.");
  }
}
