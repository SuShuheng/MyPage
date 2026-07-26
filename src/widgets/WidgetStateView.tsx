import { Icon } from "../components/Icon";

export function WidgetLoading() {
  return (
    <div class="mypage-widget-state" role="status">
      <span class="mypage-spinner" />
      <span>正在加载数据…</span>
    </div>
  );
}

export function WidgetEmpty() {
  return (
    <div class="mypage-widget-state">
      <Icon name="inbox" />
      <span>当前范围没有匹配数据</span>
    </div>
  );
}

export function WidgetError({ message }: { message: string }) {
  return (
    <div class="mypage-widget-state is-error" role="alert">
      <Icon name="triangle-alert" />
      <span>{message}</span>
    </div>
  );
}
