import { useEffect, useState } from "preact/hooks";
import type { DataEngine } from "../../data/DataEngine";
import type { QueryResult } from "../../data/data-types";
import type { DataBinding } from "../../persistence/settings-types";

export type WidgetDataState =
  | { status: "loading" }
  | { status: "ready"; result: QueryResult }
  | { status: "empty"; result: QueryResult }
  | { status: "error"; message: string };

export function useWidgetData(
  engine: DataEngine,
  binding: DataBinding,
): WidgetDataState {
  const [state, setState] = useState<WidgetDataState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    const unsubscribe = engine.subscribe(binding, (result) => {
      setState(
        result.records.length === 0
          ? { status: "empty", result }
          : { status: "ready", result },
      );
    });
    return unsubscribe;
  }, [engine, binding]);

  return state;
}
