export const MY_PAGE_VIEW_TYPE = "mypage-dashboard";
export const MY_PAGE_ICON = "mypage-color";
export const MY_PAGE_ICON_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="2" y="2" width="20" height="20" rx="5" fill="#252067"/>
  <rect x="4.2" y="4.2" width="7" height="7" rx="2" fill="#8b5cf6"/>
  <rect x="12.8" y="4.2" width="7" height="7" rx="2" fill="#22d3ee"/>
  <rect x="4.2" y="12.8" width="7" height="7" rx="2" fill="#fb4967"/>
  <rect x="12.8" y="12.8" width="7" height="7" rx="2" fill="#ffb000"/>
  <path d="M5 10.7c3-2.7 4.4 3.1 7.6.5 2.8-2.3 4.4 2.3 6.6-.1" fill="none" stroke="#47f4d4" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="5" cy="10.7" r="1" fill="#fff"/>
  <circle cx="19.2" cy="11.1" r="1" fill="#fff"/>
</svg>`;
export const MY_PAGE_PLUGIN_ID = "mypage";
export const MY_PAGE_SCHEMA_VERSION = 1;
export const MY_PAGE_SDK_VERSION = "1.0.0";
export const OFFICIAL_MARKET_REPOSITORY = "SuShuHeng/MyPage";

export const PLUGIN_DIRECTORIES = {
  backups: "backups",
  cache: "cache",
  diyPlugins: "diy-plugins",
  staging: "staging",
} as const;
