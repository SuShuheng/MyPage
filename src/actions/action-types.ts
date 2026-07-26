export type BuiltInAction =
  | {
      id: "open-file";
      input: { path: string; newLeaf?: boolean };
    }
  | {
      id: "toggle-task";
      input: { path: string; line: number; expectedText?: string };
    }
  | {
      id: "create-note";
      input: { path: string; content: string; open?: boolean };
    }
  | {
      id: "create-task";
      input: { path: string; text: string };
    }
  | {
      id: "delete-task";
      input: { path: string; line: number; expectedText?: string };
    }
  | {
      id: "update-frontmatter";
      input: { path: string; field: string; value: unknown };
    };

export interface ActionResult {
  message: string;
  undo?: () => Promise<void>;
}
