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

  let dashboardTabs = page.locator(".mypage-tab");
  if ((await dashboardTabs.count()) < 2) {
    const hiddenButton = page.getByRole("button", { name: /隐藏的主页/ });
    if (await hiddenButton.isEnabled().catch(() => false)) {
      await hiddenButton.click();
      await page.locator(".menu-item-title").filter({ hasText: "恢复：" }).first().click();
    } else {
      await page.getByRole("button", { name: "添加主页" }).click();
    }
    await page.waitForFunction(
      () => globalThis.document.querySelectorAll(".mypage-tab").length >= 2,
      undefined,
      { timeout: 10_000 },
    );
    dashboardTabs = page.locator(".mypage-tab");
  }
  const tabToHide = page.locator(".mypage-tab:not(.is-active)").first();
  const hiddenTabName = (await tabToHide.textContent())?.trim();
  if (!hiddenTabName) throw new Error("Could not resolve a tab to hide.");
  const tabsBeforeHide = await dashboardTabs.count();
  await tabToHide.click({ button: "right" });
  await page.getByText("隐藏主页", { exact: true }).click();
  await page.waitForFunction(
    (expected) =>
      globalThis.document.querySelectorAll(".mypage-tab").length === expected,
    tabsBeforeHide - 1,
    { timeout: 10_000 },
  );
  await page.getByRole("button", { name: /隐藏的主页/ }).click();
  await page.getByText(`恢复：${hiddenTabName}`, { exact: true }).last().click();
  await page.waitForFunction(
    (expected) =>
      globalThis.document.querySelectorAll(".mypage-tab").length === expected,
    tabsBeforeHide,
    { timeout: 10_000 },
  );
  evidence.assertions.push("Hidden dashboard tabs can be restored from the header menu");

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

  const dragHandles = page.locator(".mypage-drag-handle");
  const visibleDragIndex = await dragHandles.evaluateAll((handles) =>
    handles.findIndex((handle) => {
      const rect = handle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        x >= 0 &&
        x <= globalThis.innerWidth &&
        y >= 0 &&
        y <= globalThis.innerHeight &&
        globalThis.document
          .elementFromPoint(x, y)
          ?.closest(".mypage-drag-handle") === handle
      );
    }),
  );
  if (visibleDragIndex < 0) {
    throw new Error("No unobscured edit-mode drag handle is available.");
  }
  const dragHandle = dragHandles.nth(visibleDragIndex);
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
  let dragMoved = false;
  for (const [deltaX, deltaY] of [
    [180, 0],
    [-180, 0],
    [0, 170],
    [0, -120],
  ]) {
    const currentHandleBox = await dragHandle.boundingBox();
    if (!currentHandleBox) continue;
    await page.mouse.move(
      currentHandleBox.x + currentHandleBox.width / 2,
      currentHandleBox.y + currentHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      currentHandleBox.x + currentHandleBox.width / 2 + deltaX,
      currentHandleBox.y + currentHandleBox.height / 2 + deltaY,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);
    const current = await draggedItem.evaluate((element) => ({
      x: element.getAttribute("gs-x"),
      y: element.getAttribute("gs-y"),
    }));
    if (current.x !== beforeDrag.x || current.y !== beforeDrag.y) {
      dragMoved = true;
      break;
    }
  }
  if (!dragMoved) throw new Error("Edit-mode drag handle did not move a widget.");
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
    if (!gallery) return [];
    const drawer = gallery.getBoundingClientRect();
    return [
      ...globalThis.document.querySelectorAll(
        ".mypage-grid .mypage-drag-handle, .mypage-grid .ui-resizable-handle",
      ),
    ].flatMap((control) => {
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (
        x < drawer.left + 8 ||
        x > drawer.right ||
        y < drawer.top ||
        y > drawer.bottom
      ) {
        return [];
      }
      const top = globalThis.document.elementFromPoint(x, y);
      return top?.closest(".mypage-grid")
        ? [{
            className: control.className,
            x,
            y,
            topClassName: top.className,
            galleryLeft: drawer.left,
          }]
        : [];
    });
  });
  if (leakedGridControls.length > 0) {
    throw new Error(
      `${leakedGridControls.length} dashboard edit controls leaked above the gallery: ${JSON.stringify(leakedGridControls)}.`,
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
  await publishedDirectory.fill("H:\\GitHub\\myblog\\source\\_posts");
  await publishedDirectory.blur();
  await page.waitForTimeout(350);
  if ((await publishedDirectory.getAttribute("aria-invalid")) === "true") {
    throw new Error(
      `Authorized external directory was rejected: ${await moduleModal
        .locator('[data-mypage-field-error="publishedDirectory"]')
        .textContent()}`,
    );
  }
  const repository = moduleModal
    .locator(".setting-item")
    .filter({ hasText: "发布 Git 仓库" })
    .locator("input");
  await repository.fill("H:\\GitHub\\myblog");
  await repository.blur();
  await page.waitForTimeout(350);
  if ((await repository.getAttribute("aria-invalid")) === "true") {
    throw new Error(
      `Authorized Git repository was rejected: ${await moduleModal
        .locator('[data-mypage-field-error="repository"]')
        .textContent()}`,
    );
  }
  const sourceField = moduleModal
    .locator(".setting-item")
    .filter({ hasText: "原稿路径字段" })
    .locator("input");
  await sourceField.fill("原稿路径");
  await sourceField.blur();
  await page.waitForTimeout(200);
  if ((await sourceField.getAttribute("aria-invalid")) === "true") {
    throw new Error("Unicode field names are incorrectly rejected.");
  }
  await moduleModal.getByRole("button", { name: "取消" }).click();
  evidence.assertions.push(
    "DIY module settings reject relative paths but accept authorized Git/external paths and Unicode fields",
  );
  await page.getByRole("button", { name: /添加组件/ }).click();
  await page.getByRole("tab", { name: /已导入/ }).click();
  await page
    .locator(".mypage-gallery")
    .getByRole("button", { name: /专注番茄钟/ })
    .click();

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
  const focusFrame = page
    .locator('iframe.mypage-module-sandbox[title$="pomodoro"]')
    .last();
  await focusFrame.waitFor({ state: "attached", timeout: 10_000 });
  const focusClock = focusFrame.contentFrame().locator(".focus-ring strong");
  const focusBefore = await focusClock.textContent();
  await focusFrame.contentFrame().getByRole("button", { name: "开始" }).click();
  await page.waitForTimeout(1_100);
  const focusAfter = await focusClock.textContent();
  if (!focusBefore || !focusAfter || focusBefore === focusAfter) {
    throw new Error("Official Pomodoro module did not start its interactive timer.");
  }
  await focusFrame.contentFrame().getByRole("button", { name: "暂停" }).click();
  evidence.assertions.push("Official Pomodoro module is interactive inside its sandbox");
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
  const lifecycleContent = lifecycleFrame.contentFrame();
  await lifecycleContent.locator(".hexo-content > *").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const metrics = lifecycleContent.locator(".hexo-metrics");
  if (await metrics.isVisible().catch(() => false)) {
    const lifecycleCount = Number(
      await metrics.locator("strong").first().textContent(),
    );
    if (!Number.isFinite(lifecycleCount) || lifecycleCount < 0) {
      throw new Error(`DIY lifecycle module rendered an invalid count: ${lifecycleCount}.`);
    }
  } else {
    await lifecycleContent
      .getByText(/完成组件配置|配置或授权校验失败/)
      .waitFor({ state: "visible" });
    if ((await lifecycleContent.locator(".hexo-metrics").count()) !== 0) {
      throw new Error("Hexo module displayed metrics after configuration failure.");
    }
  }
  const moduleRootOverflow = await lifecycleFrame
    .contentFrame()
    .locator("html")
    .evaluate((element) => globalThis.getComputedStyle(element).overflowY);
  if (moduleRootOverflow !== "hidden") {
    throw new Error(`DIY module root overflow is ${moduleRootOverflow}.`);
  }
  if ((await lifecycleContent.getByRole("button", { name: /刷新外部状态/ }).count()) !== 0) {
    throw new Error("DIY module still exposes an independent refresh button.");
  }
  evidence.assertions.push(
    "DIY module renders truthful configuration state, hides root scrolling, and has no independent refresh button",
  );
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
  await settingsRoot.getByText("专注番茄钟", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  if (
    (await settingsRoot
      .locator(".mypage-module-market-card")
      .filter({ hasText: "Hello Widget" })
      .count()) !== 0
  ) {
    throw new Error("Hello Widget is still listed in the official market.");
  }
  const timerMarketCard = settingsRoot
    .locator(".mypage-module-market-card")
    .filter({ hasText: "专注番茄钟" });
  await timerMarketCard.getByRole("button", { name: "详情" }).click();
  const moduleMarketDetail = page.locator(".mypage-market-details-modal");
  await moduleMarketDetail.getByRole("heading", { name: "专注番茄钟" }).waitFor({
    state: "visible",
  });
  await moduleMarketDetail
    .getByRole("button", { name: /安装|更新|删除/ })
    .first()
    .waitFor({
    state: "visible",
  });
  await page.screenshot({
    path: path.join(artifacts, "testdev-module-market.png"),
    fullPage: true,
  });
  evidence.assertions.push(
    "Settings center exposes eight tabs; official market excludes Hello and opens module details in a dialog",
  );
  await moduleMarketDetail.locator(".modal-close-button").click();
  await settingsRoot.getByRole("tab", { name: "主题市场" }).click();
  if ((await settingsRoot.locator(".mypage-theme-card").count()) < 4) {
    throw new Error("Official theme market did not expose the preset themes.");
  }
  await settingsRoot
    .locator(".mypage-theme-card")
    .first()
    .getByRole("button", { name: "详情" })
    .click();
  const themeMarketDetail = page.locator(".mypage-market-details-modal");
  await themeMarketDetail.locator(".modal-title").waitFor({ state: "visible" });
  await themeMarketDetail
    .getByRole("button", { name: /安装主题|应用主题/ })
    .first()
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: path.join(artifacts, "testdev-theme-market.png"),
    fullPage: true,
  });
  evidence.assertions.push(
    "Official theme market exposes multiple presets with dialog details and install actions",
  );
  await themeMarketDetail.locator(".modal-close-button").click();
  await settingsRoot.getByRole("tab", { name: "模块管理" }).click();
  const hexoManagement = settingsRoot
    .locator(".mypage-module-management-card")
    .filter({ hasText: "可配置博客生命周期" });
  await hexoManagement.getByRole("button", { name: "权限与信任" }).click();
  const permissionModal = page.locator(".mypage-permission-modal");
  await permissionModal.waitFor({ state: "visible", timeout: 10_000 });
  const setupPermission = permissionModal
    .getByRole("button", { name: "设置并授权" })
    .first();
  if (await setupPermission.isVisible().catch(() => false)) {
    await setupPermission.click();
    await permissionModal
      .locator(".mypage-permission-scope-editor")
      .waitFor({ state: "visible", timeout: 10_000 });
  } else {
    await permissionModal.getByText(/H:\\GitHub\\myblog/).first().waitFor({
      state: "visible",
      timeout: 10_000,
    });
  }
  await page.screenshot({
    path: path.join(artifacts, "testdev-permission-editor.png"),
    fullPage: true,
  });
  evidence.assertions.push(
    "Module permission dialog exposes scoped authorization or its inline scope editor",
  );
  await permissionModal.locator(".modal-close-button").click();
  await hexoManagement.getByRole("button", { name: "模块配置" }).click();
  const moduleSettingsModal = page.locator(".mypage-module-settings-modal");
  await moduleSettingsModal.waitFor({ state: "visible", timeout: 10_000 });
  for (const tabName of ["内容设置", "通用设置", "高级设置"]) {
    await moduleSettingsModal.getByRole("tab", { name: tabName }).waitFor({
      state: "visible",
    });
  }
  await moduleSettingsModal
    .getByText("已发布文章目录", { exact: true })
    .waitFor({ state: "visible" });
  await moduleSettingsModal.getByRole("tab", { name: "高级设置" }).click();
  await moduleSettingsModal.locator(".mypage-json-editor").waitFor({
    state: "visible",
  });
  await moduleSettingsModal.locator(".modal-close-button").click();
  await hexoManagement.getByRole("button", { name: "详情" }).click();
  const managementDetails = page.locator(".mypage-market-details-modal");
  await managementDetails.waitFor({ state: "visible", timeout: 10_000 });
  await managementDetails.getByText("说明文档", { exact: true }).waitFor({
    state: "visible",
  });
  await managementDetails.locator(".modal-close-button").click();
  evidence.assertions.push(
    "Module management aligns content/general/advanced settings and opens README details",
  );
  await settingsRoot.getByRole("tab", { name: "关于" }).click();
  await settingsRoot.getByText(`MyPage 1.0.0`, { exact: true }).waitFor({
    state: "visible",
  });
  await settingsRoot.getByText("Apache License 2.0", { exact: true }).waitFor({
    state: "visible",
  });
  await settingsRoot
    .getByText("苏书蘅（SuShuHeng）", { exact: true })
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: path.join(artifacts, "testdev-settings.png"),
    fullPage: true,
  });
  evidence.assertions.push("About tab exposes version, repository, license and updater controls");
  await settingsRoot.getByRole("tab", { name: "外观" }).click();
  for (const label of [
    "背景图片适配",
    "背景位置",
    "滚动背景",
    "页面内边距",
    "内容最大宽度",
    "全局文字缩放",
  ]) {
    await settingsRoot.getByText(label, { exact: true }).waitFor({
      state: "visible",
    });
  }
  await settingsRoot.getByRole("tab", { name: "高级" }).click();
  await settingsRoot
    .getByText("全局数据刷新间隔", { exact: true })
    .waitFor({ state: "visible" });
  evidence.assertions.push(
    "Appearance exposes detailed background/layout controls and Advanced exposes the global refresh interval",
  );
  await page.keyboard.press("Escape");
  const themeCoverage = await page.locator(".mypage-shell").evaluate((shell) => {
    const dashboard = shell.querySelector(".mypage-dashboard");
    const topbar = shell.querySelector(".mypage-topbar");
    if (!dashboard || !topbar) return null;
    const shellRect = shell.getBoundingClientRect();
    const dashboardRect = dashboard.getBoundingClientRect();
    return {
      leftGap: Math.abs(dashboardRect.left - shellRect.left),
      rightGap: Math.abs(shellRect.right - dashboardRect.right),
      shellBackground: globalThis.getComputedStyle(shell).backgroundColor,
      topbarBackground: globalThis.getComputedStyle(topbar).backgroundColor,
    };
  });
  if (
    !themeCoverage ||
    themeCoverage.leftGap > 2 ||
    themeCoverage.rightGap > 20 ||
    themeCoverage.topbarBackground === "rgba(0, 0, 0, 0)"
  ) {
    throw new Error(`Theme does not cover the full dashboard/header: ${JSON.stringify(themeCoverage)}`);
  }
  evidence.assertions.push("Theme covers the full dashboard width and header");

  await page.getByRole("button", { name: "编辑" }).click();
  const beforeCancel = await page.locator(".mypage-widget").count();
  const cancelTarget = page.locator(".grid-stack-item").first();
  const cancelWidgetId = await cancelTarget.getAttribute("data-widget-id");
  const cancelLayoutBefore = await cancelTarget.evaluate((element) => ({
    x: element.getAttribute("gs-x"),
    y: element.getAttribute("gs-y"),
    w: element.getAttribute("gs-w"),
    h: element.getAttribute("gs-h"),
  }));
  const cancelHandle = cancelTarget.locator(".mypage-drag-handle");
  const cancelHandleBox = await cancelHandle.boundingBox();
  if (!cancelWidgetId || !cancelHandleBox) {
    throw new Error("Could not resolve a widget for cancel-layout verification.");
  }
  await page.mouse.move(
    cancelHandleBox.x + cancelHandleBox.width / 2,
    cancelHandleBox.y + cancelHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    cancelHandleBox.x + cancelHandleBox.width / 2 + 160,
    cancelHandleBox.y + cancelHandleBox.height / 2 + 90,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(350);
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
  const restoredLayout = await page
    .locator(`.grid-stack-item[data-widget-id="${cancelWidgetId}"]`)
    .evaluate((element) => ({
      x: element.getAttribute("gs-x"),
      y: element.getAttribute("gs-y"),
      w: element.getAttribute("gs-w"),
      h: element.getAttribute("gs-h"),
    }));
  if (JSON.stringify(restoredLayout) !== JSON.stringify(cancelLayoutBefore)) {
    throw new Error(
      `Cancel did not restore layout: ${JSON.stringify(cancelLayoutBefore)} -> ${JSON.stringify(restoredLayout)}`,
    );
  }
  evidence.assertions.push(
    "Edit-session cancel discarded added widgets and restored the pre-edit layout/size",
  );

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
    element.style.setProperty("--mypage-accent", "rgb(12, 140, 110)");
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
    element.style.removeProperty("--mypage-accent");
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
  let widget = page
    .locator(".mypage-widget")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .last();
  if ((await widget.count()) === 0 && title === "文本与快捷操作") {
    widget = page.locator(".mypage-widget").filter({
      has: page.locator(".mypage-markdown-actions"),
    }).last();
  }
  await widget.waitFor({ state: "visible", timeout: 10_000 });
  await widget.locator(".mypage-widget-header > .mypage-icon-button").click();
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
