import { Menu, Notice, type App } from "obsidian";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import {
  GridStackAdapter,
  GridStackItem,
} from "../layout/GridStackAdapter";
import { EditSessionManager } from "../layout/EditSessionManager";
import { resolveBreakpoint } from "../layout/ResponsiveLayoutService";
import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  Breakpoint,
  DashboardGroup,
  MyPageSettings,
  TabDefinition,
  WidgetInstance,
} from "../persistence/settings-types";
import {
  BUILT_IN_WIDGETS,
  ComponentGallery,
  type BuiltInWidgetDefinition,
} from "./ComponentGallery";
import { Onboarding } from "./onboarding/Onboarding";
import { TabManager } from "./TabManager";
import type { DataEngine } from "../data/DataEngine";
import type { ActionExecutor } from "../actions/ActionExecutor";
import { WidgetHost } from "../widgets/WidgetHost";
import type { ModuleRuntime } from "../modules/ModuleRuntime";
import type { ThemeService } from "../theme/ThemeService";
import type { ModuleManager } from "../modules/ModuleManager";
import { WidgetConfigurationModal } from "./WidgetConfigurationModal";
import { confirmDialog, promptDialog } from "../components/ThemeDialog";
import type { CapabilityBroker } from "../permissions/CapabilityBroker";

interface DashboardShellProps {
  settingsStore: SettingsStore;
  dataEngine: DataEngine;
  actions: ActionExecutor;
  app: App;
  moduleRuntime: ModuleRuntime;
  themeService: ThemeService;
  moduleManager: ModuleManager;
  capabilityBroker: CapabilityBroker;
  onRefresh: () => Promise<void>;
  onOpenMarketplace: () => void;
  onImportModuleZip: () => void;
}

export function DashboardShell({
  settingsStore,
  dataEngine,
  actions,
  app,
  moduleRuntime,
  themeService,
  moduleManager,
  capabilityBroker,
  onRefresh,
  onOpenMarketplace,
  onImportModuleZip,
}: DashboardShellProps) {
  const [settings, setSettings] = useState<MyPageSettings>(
    () => settingsStore.snapshot,
  );
  const [session, setSession] = useState<EditSessionManager | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [moduleRegistryVersion, setModuleRegistryVersion] = useState(0);
  const [baseThemeVersion, setBaseThemeVersion] = useState(0);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    resolveBreakpoint(window.innerWidth),
  );
  const tabManager = useMemo(() => new TabManager(settingsStore), [settingsStore]);

  useEffect(
    () =>
      settingsStore.changed.subscribe(({ current }) => {
        setSettings(current);
      }),
    [settingsStore],
  );

  useEffect(() => {
    const update = () => setBreakpoint(resolveBreakpoint(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setBaseThemeVersion((value) => value + 1);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(
    () =>
      moduleManager.changed.subscribe(() => {
        setModuleRegistryVersion((version) => version + 1);
      }),
    [moduleManager],
  );

  const activeTabId = settings.uiState.lastActiveTabId;
  const activeTab =
    settings.tabs.byId[activeTabId] ??
    settings.tabs.byId[settings.tabs.defaultTabId];
  const persistedDashboard = activeTab
    ? settings.dashboards[activeTab.dashboardId]
    : undefined;
  const draft = session?.snapshot;
  const dashboard =
    draft && draft.dashboard.id === persistedDashboard?.id
      ? draft.dashboard
      : persistedDashboard;
  const widgetMap = draft?.widgets ?? settings.widgetInstances;
  const groupMap = draft?.groups ?? settings.groups;
  const widgets = dashboard
    ? dashboard.widgetIds
        .map((widgetId) => widgetMap[widgetId])
        .filter((widget): widget is WidgetInstance => widget !== undefined && widget.enabled)
    : [];
  const groups = dashboard
    ? dashboard.groupIds
        .map((groupId) => groupMap[groupId])
        .filter((group): group is DashboardGroup => group !== undefined)
    : [];
  const visibleTabs = useMemo(
    () =>
      settings.tabs.order
        .map((id) => settings.tabs.byId[id])
        .filter(
          (tab): tab is TabDefinition => tab !== undefined && !tab.hidden,
        ),
    [settings.tabs],
  );
  const hiddenTabs = useMemo(
    () =>
      settings.tabs.order
        .map((id) => settings.tabs.byId[id])
        .filter((tab): tab is TabDefinition => tab !== undefined && tab.hidden),
    [settings.tabs],
  );

  const rerenderDraft = () => setSessionVersion((value) => value + 1);

  const selectTab = async (tabId: string) => {
    if (session) {
      session.cancel();
      setSession(null);
      setGalleryOpen(false);
    }
    const revision = settingsStore.snapshot.revision;
    await settingsStore.update(
      (draftSettings) => {
        draftSettings.uiState.lastActiveTabId = tabId;
      },
      revision,
      "select-tab",
    );
  };

  const startEditing = () => {
    if (!dashboard) return;
    setSession(new EditSessionManager(settingsStore.snapshot, dashboard.id));
    setSessionVersion((value) => value + 1);
  };

  const finishEditing = async () => {
    if (!session) return;
    try {
      await session.commit(settingsStore);
      setSession(null);
      setGalleryOpen(false);
      new Notice("MyPage 布局已保存。");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  };

  const cancelEditing = () => {
    if (!session) return;
    session.cancel();
    setSession(null);
    setSessionVersion((value) => value + 1);
    setGalleryOpen(false);
    new Notice("已取消主页改动；新安装的模块仍会保留。");
  };

  const addWidget = (definition: BuiltInWidgetDefinition) => {
    if (!session) return;
    session.addWidget(
      definition.id,
      definition.name,
      definition.defaultConfig,
      definition.moduleId ?? "mypage-core",
    );
    rerenderDraft();
    setGalleryOpen(false);
  };

  const addGroup = async () => {
    if (!session) return;
    const title = await promptDialog(app, {
      title: "添加分组",
      message: "为新的主页分组输入一个便于识别的名称。",
      value: "新分组",
      confirmText: "添加分组",
      validate: (value) => value ? undefined : "分组名称不能为空。",
    });
    if (!title) return;
    session.addGroup(title);
    rerenderDraft();
  };

  const toggleGroup = async (group: DashboardGroup) => {
    if (session) {
      session.setGroupCollapsed(group.id, !group.collapsed);
      rerenderDraft();
      return;
    }
    const revision = settingsStore.snapshot.revision;
    await settingsStore.update(
      (draftSettings) => {
        const target = draftSettings.groups[group.id];
        if (target) target.collapsed = !target.collapsed;
      },
      revision,
      "toggle-group",
    );
  };

  const createTab = async () => {
    try {
      await tabManager.create();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  };

  const showTabMenu = (
    event: MouseEvent,
    tab: TabDefinition,
    index: number,
  ) => {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("重命名").setIcon("pencil").onClick(() => {
        void promptDialog(app, {
          title: "重命名主页",
          message: "输入新的主页名称。",
          value: tab.name,
          confirmText: "重命名",
          validate: (value) => value ? undefined : "主页名称不能为空。",
        }).then((name) => {
          if (name) void tabManager.rename(tab.id, name);
        });
      }),
    );
    menu.addItem((item) =>
      item.setTitle("复制主页").setIcon("copy").onClick(() => {
        void tabManager.duplicate(tab.id);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("设为默认主页").setIcon("home").onClick(() => {
        void tabManager.setDefault(tab.id);
      }),
    );
    menu.addSeparator();
    if (index > 0) {
      menu.addItem((item) =>
        item.setTitle("向左移动").setIcon("arrow-left").onClick(() => {
          void tabManager.reorder(tab.id, index - 1);
        }),
      );
    }
    if (index < visibleTabs.length - 1) {
      menu.addItem((item) =>
        item.setTitle("向右移动").setIcon("arrow-right").onClick(() => {
          void tabManager.reorder(tab.id, index + 1);
        }),
      );
    }
    menu.addItem((item) =>
      item.setTitle("隐藏主页").setIcon("eye-off").onClick(() => {
        void tabManager.setHidden(tab.id, true);
      }),
    );
    menu.addItem((item) =>
      item.setTitle("删除主页").setIcon("trash-2").onClick(() => {
        void confirmDialog(app, {
          title: "删除主页",
          message: `确认删除主页“${tab.name}”？该主页的布局会被移除。`,
          confirmText: "删除主页",
          destructive: true,
        }).then((confirmed) => {
          if (confirmed) void tabManager.remove(tab.id);
        });
      }),
    );
    menu.showAtMouseEvent(event);
  };

  void baseThemeVersion;
  const dashboardTheme = dashboard
    ? themeService.dashboardStyle(settings, dashboard)
    : {};
  useEffect(() => {
    const accent = dashboardTheme["--mypage-accent"];
    if (accent !== undefined) {
      document.body.style.setProperty("--mypage-active-accent", String(accent));
    }
    return () => document.body.style.removeProperty("--mypage-active-accent");
  }, [dashboardTheme["--mypage-accent"]]);
  const installedWidgets = moduleManager.registry.contributions
    .list("widget")
    .map(({ moduleId, contribution }) => {
      const installation = settings.modules[moduleId];
      const category =
        installation?.sourceType === "official"
          ? "official"
          : installation?.sourceType === "third-party"
            ? "third-party"
            : "imported";
      return {
        id: contribution.id,
        moduleId,
        name: contribution.name,
        description: contribution.description ?? `来自 ${moduleId}`,
        icon: contribution.icon ?? "blocks",
        category,
        defaultConfig: structuredClone(settings.moduleSettings[moduleId] ?? {}),
      };
    });
  const renderWidget = (widget: WidgetInstance) => {
    const icon =
      widget.moduleId === "mypage-core"
        ? BUILT_IN_WIDGETS.find((item) => item.id === widget.contributionId)?.icon
        : moduleManager.registry.contributions
            .list("widget")
            .find(
              (item) =>
                item.moduleId === widget.moduleId &&
                item.contribution.id === widget.contributionId,
            )?.contribution.icon;
    return (
    <GridStackItem
      key={widget.id}
      widget={widget}
      breakpoint={breakpoint}
      contentStyle={themeService.widgetStyle(widget.appearance)}
    >
      <div
        class="mypage-widget-header"
        hidden={!widget.appearance.showTitle}
      >
        <div class="mypage-widget-heading">
          {widget.appearance.showIcon && icon ? <Icon name={icon} /> : null}
          <h2>{widget.title ?? widget.contributionId}</h2>
        </div>
        {session ? (
          <button
            type="button"
            class="mypage-icon-button"
            aria-label={`${widget.title ?? "组件"}菜单`}
            onClick={(event) => {
              const menu = new Menu();
              menu.addItem((item) =>
                item.setTitle("复制组件").setIcon("copy").onClick(() => {
                  session.duplicateWidget(widget.id);
                  rerenderDraft();
                }),
              );
              menu.addItem((item) =>
                item.setTitle("配置组件").setIcon("settings-2").onClick(() => {
                  new WidgetConfigurationModal(
                    app,
                    widget,
                    moduleManager,
                    capabilityBroker,
                    (configured) => {
                      session.replaceWidget(widget.id, configured);
                      rerenderDraft();
                    },
                  ).open();
                }),
              );
              menu.addSeparator();
              menu.addItem((item) =>
                item.setTitle("不放入分组").setIcon("ungroup").onClick(() => {
                  session.setWidgetGroup(widget.id);
                  rerenderDraft();
                }),
              );
              if (dashboard?.gridOptions.crossGroupDrag !== false) {
                for (const group of groups) {
                  menu.addItem((item) =>
                    item
                      .setTitle(`移到：${group.title}`)
                      .setIcon("folder-input")
                      .onClick(() => {
                        session.setWidgetGroup(widget.id, group.id);
                        rerenderDraft();
                      }),
                  );
                }
              }
              menu.showAtMouseEvent(event);
            }}
          >
            <Icon name="ellipsis" />
          </button>
        ) : null}
      </div>
      <div class="mypage-widget-body">
        <WidgetHost
          app={app}
          actions={actions}
          dataEngine={dataEngine}
          widget={widget}
          editing={session !== null}
          moduleRuntime={moduleRuntime}
          theme={themeService.sandboxTokens(
            settings,
            dashboard!,
            widget.appearance,
          )}
          safeMode={settings.general.safeMode}
          runtimeVersion={moduleRegistryVersion}
        />
      </div>
      {session ? (
        <>
          <button
            type="button"
            class="mypage-drag-handle"
            aria-label={`移动${widget.title ?? "组件"}`}
          >
            <Icon name="grip" />
          </button>
          <button
            type="button"
            class="mypage-remove-widget"
            aria-label={`删除${widget.title ?? "组件"}`}
            onClick={() => {
              session.removeWidget(widget.id);
              rerenderDraft();
            }}
          >
            <Icon name="x" />
          </button>
        </>
      ) : null}
    </GridStackItem>
    );
  };
  return (
    <div
      class={`mypage-shell${session ? " is-editing" : ""}`}
      data-tab-position={settings.uiState.tabBarPosition}
      data-compact-tabs={String(settings.uiState.compactTabs)}
      data-animation={settings.uiState.animationLevel}
      data-grid-lines={String(dashboard?.gridOptions.editGridLines ?? true)}
      data-session-version={sessionVersion}
      style={dashboardTheme}
    >
      <a class="mypage-skip-link" href="#mypage-dashboard-content">
        跳转到主页内容
      </a>
      <header class="mypage-topbar">
        <div class="mypage-brand" aria-label="MyPage">
          <Icon name="mypage-color" />
          <span>MyPage</span>
        </div>
        <nav class="mypage-tabs" aria-label="主页标签">
          {visibleTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              draggable={session === null}
              class={`mypage-tab${tab.id === activeTab?.id ? " is-active" : ""}`}
              aria-current={tab.id === activeTab?.id ? "page" : undefined}
              onClick={() => void selectTab(tab.id)}
              onContextMenu={(event) => showTabMenu(event, tab, index)}
              onDragStart={(event) => {
                event.dataTransfer?.setData("text/mypage-tab-id", tab.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = event.dataTransfer?.getData("text/mypage-tab-id");
                if (draggedId) void tabManager.reorder(draggedId, index);
              }}
            >
              <Icon name={tab.icon ?? "layout-dashboard"} />
              <span>{tab.name}</span>
            </button>
          ))}
          <button
            class="mypage-icon-button"
            type="button"
            aria-label="添加主页"
            disabled={session !== null}
            onClick={() => void createTab()}
          >
            <Icon name="plus" />
          </button>
        </nav>
        <div class="mypage-topbar-actions">
          {session ? (
            <>
              <button
                class="mypage-icon-button"
                type="button"
                aria-label="撤销"
                disabled={
                  !session.canUndo ||
                  dashboard?.gridOptions.undoRedo === false
                }
                onClick={() => {
                  session.undo();
                  rerenderDraft();
                }}
              >
                <Icon name="undo-2" />
              </button>
              <button
                class="mypage-icon-button"
                type="button"
                aria-label="重做"
                disabled={
                  !session.canRedo ||
                  dashboard?.gridOptions.undoRedo === false
                }
                onClick={() => {
                  session.redo();
                  rerenderDraft();
                }}
              >
                <Icon name="redo-2" />
              </button>
              <button
                class="mypage-secondary-button"
                type="button"
                onClick={cancelEditing}
              >
                取消
              </button>
              <button
                class="mypage-edit-button is-active"
                type="button"
                onClick={() => void finishEditing()}
              >
                <Icon name="check" />
                <span>完成</span>
              </button>
            </>
          ) : (
            <>
              <button
                class="mypage-icon-button"
                type="button"
                aria-label={`隐藏的主页${hiddenTabs.length > 0 ? `（${hiddenTabs.length}）` : ""}`}
                disabled={hiddenTabs.length === 0}
                onClick={(event) => {
                  const menu = new Menu();
                  if (hiddenTabs.length === 0) {
                    menu.addItem((item) => item.setTitle("没有隐藏的主页").setDisabled(true));
                  } else {
                    for (const tab of hiddenTabs) {
                      menu.addItem((item) =>
                        item
                          .setTitle(`恢复：${tab.name}`)
                          .setIcon("eye")
                          .onClick(() => void tabManager.setHidden(tab.id, false)),
                      );
                    }
                  }
                  menu.showAtMouseEvent(event);
                }}
              >
                <Icon name="eye" />
                {hiddenTabs.length > 0 ? <span class="mypage-button-badge">{hiddenTabs.length}</span> : null}
              </button>
              <button
                class="mypage-icon-button"
                type="button"
                aria-label="刷新数据"
                onClick={() => void onRefresh()}
              >
                <Icon name="refresh-cw" />
              </button>
              <button
                class="mypage-edit-button"
                type="button"
                onClick={startEditing}
              >
                <Icon name="pencil" />
                <span>编辑</span>
              </button>
            </>
          )}
        </div>
      </header>

      {session ? (
        <div class="mypage-edit-strip" role="status">
          <span><Icon name="move" />编辑模式</span>
          <strong>{breakpoint === "desktop" ? "桌面" : breakpoint === "tablet" ? "平板" : "手机"}布局</strong>
          <button
            type="button"
            class="mypage-add-widget-button"
            onClick={() => setGalleryOpen(true)}
          >
            <Icon name="plus" />添加组件
          </button>
          <button
            type="button"
            class="mypage-secondary-button"
            onClick={() => void addGroup()}
          >
            <Icon name="folder-plus" />添加分组
          </button>
        </div>
      ) : null}

      <main id="mypage-dashboard-content" class="mypage-dashboard" tabIndex={-1}>
        <div class="mypage-dashboard-heading">
          <div>
            <p class="mypage-eyebrow">你的知识，一目了然</p>
            <h1>{dashboard?.name ?? "未找到主页"}</h1>
          </div>
          <p class="mypage-dashboard-summary">
            {dashboard
              ? `${dashboard.widgetIds.length} 个组件 · ${settings.tabs.order.length} 个主页`
              : "请在设置中恢复或创建主页。"}
          </p>
        </div>

        {dashboard ? (
          <>
            {widgets.some((widget) => !widget.groupId) ? (
              <GridStackAdapter
                breakpoint={breakpoint}
                editing={session !== null}
                gridOptions={dashboard.gridOptions}
                widgets={widgets.filter((widget) => !widget.groupId)}
                resetKey={sessionVersion}
                onLayoutChange={(layouts) => {
                  if (session) {
                    session.updateLayouts(breakpoint, layouts);
                    rerenderDraft();
                  }
                }}
              >
                {widgets.filter((widget) => !widget.groupId).map(renderWidget)}
              </GridStackAdapter>
            ) : null}
            {groups.map((group) => {
              const groupWidgets = widgets.filter(
                (widget) => widget.groupId === group.id,
              );
              return (
                <section
                  key={group.id}
                  class={`mypage-widget-group${group.collapsed ? " is-collapsed" : ""}`}
                  style={themeService.widgetStyle(group.appearance)}
                >
                  <header class="mypage-widget-group-header">
                    <button
                      type="button"
                      class="mypage-icon-button"
                      aria-label={group.collapsed ? "展开分组" : "折叠分组"}
                      onClick={() => void toggleGroup(group)}
                    >
                      <Icon name={group.collapsed ? "chevron-right" : "chevron-down"} />
                    </button>
                    <h2>{group.title}</h2>
                    <span>{groupWidgets.length} 个组件</span>
                    {session ? (
                      <button
                        type="button"
                        class="mypage-icon-button"
                        aria-label={`删除分组 ${group.title}`}
                        onClick={() => {
                          session.removeGroup(group.id);
                          rerenderDraft();
                        }}
                      >
                        <Icon name="folder-x" />
                      </button>
                    ) : null}
                  </header>
                  {!group.collapsed ? (
                    <GridStackAdapter
                      breakpoint={breakpoint}
                      editing={session !== null}
                      gridOptions={dashboard.gridOptions}
                      widgets={groupWidgets}
                      resetKey={sessionVersion}
                      onLayoutChange={(layouts) => {
                        if (session) {
                          session.updateLayouts(breakpoint, layouts);
                          rerenderDraft();
                        }
                      }}
                    >
                      {groupWidgets.map(renderWidget)}
                    </GridStackAdapter>
                  ) : null}
                </section>
              );
            })}
          </>
        ) : (
          <section class="mypage-empty-state">
            <Icon name="layout-dashboard" />
            <h2>还没有可显示的主页</h2>
            <p>创建一个主页，然后从组件库加入你关心的数据。</p>
          </section>
        )}
      </main>

      {galleryOpen && session ? (
        <>
          <button
            class="mypage-overlay"
            type="button"
            aria-label="关闭组件库"
            onClick={() => setGalleryOpen(false)}
          />
          <ComponentGallery
            onAdd={addWidget}
            onClose={() => setGalleryOpen(false)}
            installed={installedWidgets}
            onOpenMarketplace={onOpenMarketplace}
            onImportZip={onImportModuleZip}
          />
        </>
      ) : null}

      {!settings.general.onboardingCompleted ? (
        <Onboarding store={settingsStore} />
      ) : null}
    </div>
  );
}
