import { useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import type { SettingsStore } from "../../persistence/SettingsStore";

export function Onboarding({ store }: { store: SettingsStore }) {
  const initial = store.snapshot;
  const [openOnStartup, setOpenOnStartup] = useState(
    initial.general.openOnStartup,
  );
  const [startupTabId, setStartupTabId] = useState(
    initial.general.startupTabId,
  );
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      const revision = store.snapshot.revision;
      await store.update(
        (draft) => {
          draft.general.onboardingCompleted = true;
          draft.general.openOnStartup = openOnStartup;
          draft.general.startupTabId = startupTabId;
          draft.general.startupTabMode = "specific";
        },
        revision,
        "complete-onboarding",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="mypage-onboarding-backdrop" role="presentation">
      <section
        class="mypage-onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mypage-onboarding-title"
      >
        <div class="mypage-onboarding-mark">
          <Icon name="panels-top-left" />
        </div>
        <p class="mypage-eyebrow">欢迎来到 MyPage</p>
        <h1 id="mypage-onboarding-title">把你的 Vault 变成可互动的主页</h1>
        <p class="mypage-onboarding-intro">
          每个组件都能拥有自己的文件夹范围、查询、主题和交互。所有配置保存在本地，
          第三方模块只有在你授权后才能访问数据。
        </p>
        <div class="mypage-onboarding-features">
          <Feature icon="layout-grid" title="自由排版" text="查看模式稳定交互，编辑模式拖拽缩放。" />
          <Feature icon="shield-check" title="权限可控" text="官方来源可信，但敏感能力仍需授权。" />
          <Feature icon="blocks" title="随时扩展" text="默认组件、模块市场和自定义代码使用统一协议。" />
        </div>
        <label class="mypage-choice-row">
          <span>
            <strong>Obsidian 启动后打开 MyPage</strong>
            <small>之后可以在通用设置中随时修改。</small>
          </span>
          <input
            type="checkbox"
            checked={openOnStartup}
            onChange={(event) => setOpenOnStartup(event.currentTarget.checked)}
          />
        </label>
        <label class="mypage-field">
          <span>启动时显示</span>
          <select
            value={startupTabId}
            onChange={(event) => setStartupTabId(event.currentTarget.value)}
          >
            {initial.tabs.order.map((tabId) => {
              const tab = initial.tabs.byId[tabId];
              return tab ? <option value={tab.id}>{tab.name}</option> : null;
            })}
          </select>
        </label>
        <button
          type="button"
          class="mypage-primary-button"
          disabled={saving}
          onClick={() => void finish()}
        >
          {saving ? "正在保存…" : "进入 MyPage"}
          <Icon name="arrow-right" />
        </button>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div class="mypage-onboarding-feature">
      <Icon name={icon} />
      <div><strong>{title}</strong><small>{text}</small></div>
    </div>
  );
}
