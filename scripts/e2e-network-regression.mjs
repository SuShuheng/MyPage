import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const endpoint = process.env.MYPAGE_CDP_ENDPOINT || "http://127.0.0.1:9229";
const artifacts = path.resolve("tests", "artifacts");
const evidence = {
  command: "npm run test:e2e:network",
  startedAt: new Date().toISOString(),
  endpoint,
  exitCode: 1,
};
let browser;
let page;

try {
  await waitForEndpoint(endpoint, 30_000);
  browser = await chromium.connectOverCDP(endpoint);
  page = browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error("Obsidian renderer page was not found.");
  page.setDefaultTimeout(60_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissFirstRun(page);
  await page.waitForFunction(
    () => Boolean(globalThis.app?.plugins?.plugins?.mypage?.marketplace),
  );

  const result = await page.evaluate(async () => {
    const plugin = globalThis.app?.plugins?.plugins?.mypage;
    if (!plugin) throw new Error("MyPage plugin instance is unavailable.");

    await plugin.marketplace.check("official", "manual");
    const moduleSourceId = await plugin.marketplace.addThirdParty(
      "SuShuHeng/MyPage",
    );
    const moduleIndex = plugin.marketplace.getCached(moduleSourceId);
    const calendarVersion = moduleIndex?.modules
      .find((module) => module.id === "calendar-widget")
      ?.versions[0];
    if (!calendarVersion) throw new Error("Calendar market entry is unavailable.");
    const archive = await plugin.marketplace.client.download(
      calendarVersion.downloadUrl,
    );
    const downloadedSha256 = await plugin.workers.run("hash", { data: archive });
    const releaseIndexBytes = await plugin.marketplace.client.download(
      "https://github.com/SuShuHeng/MyPage/releases/download/1.0.0/module-market-index.json",
    );
    const releaseIndex = JSON.parse(
      new TextDecoder().decode(releaseIndexBytes),
    );
    let installedModule = null;
    let installError = null;
    try {
      installedModule = await plugin.marketplace.install(
        "official",
        "calendar-widget",
      );
    } catch (error) {
      installError = error instanceof Error ? error.message : String(error);
    }
    const themeSourceId = await plugin.themeMarketplace.addThirdParty(
      "SuShuHeng/MyPage",
    );
    const themeIndex = plugin.themeMarketplace.getCached(themeSourceId);
    const availableUpdate = await plugin.updateService.check(true);

    return {
      moduleSourceId,
      moduleRepository: moduleIndex?.repository,
      expectedModuleSha256: calendarVersion.sha256,
      downloadedModuleSha256: downloadedSha256,
      downloadedModuleBytes: archive.byteLength,
      downloadedModuleSignature: Array.from(archive.slice(0, 8)),
      releaseModuleHashes: Object.fromEntries(
        releaseIndex.modules.map((module) => [
          module.id,
          module.versions[0]?.sha256,
        ]),
      ),
      installedModule: installedModule
        ? { id: installedModule.id, version: installedModule.version }
        : null,
      installError,
      themeSourceId,
      themeRepository: themeIndex?.repository,
      themeCount: themeIndex?.themes.length,
      availableUpdateVersion: availableUpdate?.version ?? null,
    };
  });

  if (
    result.moduleRepository !== "SuShuHeng/MyPage" ||
    result.installedModule?.id !== "calendar-widget" ||
    result.themeRepository !== "SuShuHeng/MyPage" ||
    !result.themeCount
  ) {
    throw new Error(`Unexpected network regression result: ${JSON.stringify(result)}`);
  }
  evidence.result = result;
  evidence.exitCode = 0;
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  evidence.page = await page
    ?.evaluate(() => ({
      url: globalThis.location.href,
      title: globalThis.document.title,
      body: globalThis.document.body?.innerText.slice(0, 1_000),
      hasApp: Boolean(globalThis.app),
      pluginIds: Object.keys(globalThis.app?.plugins?.plugins ?? {}),
    }))
    .catch((pageError) => ({ inspectionError: String(pageError) }));
  await page
    ?.screenshot({
      path: path.join(artifacts, "network-regression-failure.png"),
      fullPage: true,
    })
    .catch(() => undefined);
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    path.join(artifacts, "network-regression-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await browser?.close();
  console.log(JSON.stringify(evidence, null, 2));
}

async function waitForEndpoint(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`, {
        signal: AbortSignal.timeout(1_000),
      });
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
    if (
      !clicked &&
      await page
        .evaluate(() =>
          Boolean(globalThis.app?.plugins?.plugins?.mypage?.marketplace),
        )
        .catch(() => false)
    ) {
      return;
    }
    await page.waitForTimeout(250);
  }
}
