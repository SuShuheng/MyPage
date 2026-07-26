import { Component, type ComponentChildren } from "preact";
import { WidgetError } from "./WidgetStateView";

interface Props {
  children: ComponentChildren;
}

interface State {
  error?: Error;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  public override state: State = {};

  public static override getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override componentDidCatch(error: Error): void {
    console.error("[MyPage] Widget crashed", error);
  }

  public override render() {
    return this.state.error ? (
      <WidgetError message={this.state.error.message} />
    ) : (
      this.props.children
    );
  }
}
