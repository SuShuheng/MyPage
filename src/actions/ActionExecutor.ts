import type { App} from "obsidian";
import { normalizePath, TFile } from "obsidian";
import type { ActionResult, BuiltInAction } from "./action-types";
import { confirmDialog } from "../components/ThemeDialog";

export class ActionExecutor {
  public constructor(
    private readonly app: App,
    private readonly confirm: typeof confirmDialog = confirmDialog,
  ) {}

  public async execute(action: BuiltInAction): Promise<ActionResult> {
    switch (action.id) {
      case "open-file":
        return this.openFile(action.input.path, action.input.newLeaf);
      case "toggle-task":
        return this.toggleTask(
          action.input.path,
          action.input.line,
          action.input.expectedText,
        );
      case "create-note":
        return this.createNote(
          action.input.path,
          action.input.content,
          action.input.open,
        );
      case "create-task":
        return this.createTask(action.input.path, action.input.text);
      case "delete-task":
        return this.deleteTask(
          action.input.path,
          action.input.line,
          action.input.expectedText,
        );
      case "update-frontmatter":
        return this.updateFrontmatter(
          action.input.path,
          action.input.field,
          action.input.value,
        );
    }
  }

  private async openFile(path: string, newLeaf = false): Promise<ActionResult> {
    const normalized = normalizeVaultPath(path);
    await this.app.workspace.openLinkText(normalized, "", newLeaf);
    return { message: `已打开 ${normalized}` };
  }

  private async toggleTask(
    path: string,
    line: number,
    expectedText?: string,
  ): Promise<ActionResult> {
    const file = this.requireFile(path);
    let previousLine = "";
    let nextLine = "";
    await this.app.vault.process(file, (content) => {
      const lines = content.split(/\r?\n/u);
      const current = lines[line];
      if (current === undefined) throw new Error("任务所在行已经不存在。");
      if (expectedText && !current.includes(expectedText)) {
        throw new Error("任务内容已变化，请刷新组件后重试。");
      }
      if (!/^\s*[-*+]\s+\[[ xX-]\]/u.test(current)) {
        throw new Error("目标行不再是 Markdown 任务。");
      }
      previousLine = current;
      const completing = !/^\s*[-*+]\s+\[[xX]\]/u.test(current);
      nextLine = current.replace(
        /^(\s*[-*+]\s+\[)([ xX-])(\])/u,
        (_match, prefix: string, marker: string, suffix: string) =>
          `${prefix}${marker.toLocaleLowerCase() === "x" ? " " : "x"}${suffix}`,
      );
      nextLine = nextLine.replace(
        /\s*<!--\s*mypage:completed=[^>]+\s*-->\s*$/u,
        "",
      );
      if (completing) {
        nextLine += ` <!-- mypage:completed=${new Date().toISOString()} -->`;
      }
      lines[line] = nextLine;
      return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
    });
    return {
      message: "任务状态已更新。",
      undo: async () => {
        await this.app.vault.process(file, (content) => {
          const lines = content.split(/\r?\n/u);
          if (lines[line] !== nextLine) {
            throw new Error("任务在操作后再次变化，无法安全撤销。");
          }
          lines[line] = previousLine;
          return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
        });
      },
    };
  }

  private async createNote(
    path: string,
    content: string,
    open = true,
  ): Promise<ActionResult> {
    const normalized = normalizeVaultPath(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) {
      throw new Error(`文件已存在：${normalized}`);
    }
    await this.requireConfirmation(
      "创建笔记",
      `确认创建笔记“${normalized}”？`,
      "创建",
    );
    const folder = normalized.split("/").slice(0, -1).join("/");
    if (folder) await ensureFolder(this.app, folder);
    const file = await this.app.vault.create(normalized, content);
    if (open) await this.app.workspace.getLeaf("tab").openFile(file);
    return {
      message: `已创建 ${normalized}`,
      undo: async () => {
        await this.app.vault.trash(file, true);
      },
    };
  }

  private async createTask(path: string, text: string): Promise<ActionResult> {
    const normalized = normalizeVaultPath(path);
    const clean = text.replace(/\r?\n/gu, " ").trim();
    if (!clean) throw new Error("任务内容不能为空。");
    await this.requireConfirmation(
      "创建待办事项",
      `确认在“${normalized}”中创建任务？`,
      "创建",
    );
    const line = `- [ ] ${clean}`;
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      const folder = normalized.split("/").slice(0, -1).join("/");
      if (folder) await ensureFolder(this.app, folder);
      const created = await this.app.vault.create(normalized, `${line}\n`);
      return {
        message: "任务文件已创建。",
        undo: async () => {
          await this.app.vault.trash(created, true);
        },
      };
    }
    if (!(existing instanceof TFile)) {
      throw new Error(`目标路径不是 Markdown 文件：${normalized}`);
    }
    const file = existing;
    await this.app.vault.process(file, (content) =>
      `${content}${content.endsWith("\n") ? "" : "\n"}${line}\n`,
    );
    return {
      message: "任务已创建。",
      undo: async () => {
        await this.app.vault.process(file, (content) => {
          const lines = content.split(/\r?\n/u);
          const index = lines.lastIndexOf(line);
          if (index < 0) throw new Error("无法找到刚创建的任务。");
          lines.splice(index, 1);
          return lines.join("\n");
        });
      },
    };
  }

  private async deleteTask(
    path: string,
    line: number,
    expectedText?: string,
  ): Promise<ActionResult> {
    const file = this.requireFile(path);
    await this.requireConfirmation(
      "清除已完成记录",
      "这会从 Markdown 文件中删除该条已完成待办。此操作可在当前会话中撤销。",
      "清除记录",
      true,
    );
    let removedLine = "";
    await this.app.vault.process(file, (content) => {
      const lines = content.split(/\r?\n/u);
      const current = lines[line];
      if (current === undefined) throw new Error("任务所在行已经不存在。");
      if (expectedText && !current.includes(expectedText)) {
        throw new Error("任务内容已变化，请刷新组件后重试。");
      }
      if (!/^\s*[-*+]\s+\[[xX]\]/u.test(current)) {
        throw new Error("只能清除已完成的待办事项。");
      }
      removedLine = current;
      lines.splice(line, 1);
      return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
    });
    return {
      message: "已清除完成记录。",
      undo: async () => {
        await this.app.vault.process(file, (content) => {
          const lines = content.split(/\r?\n/u);
          lines.splice(Math.min(line, lines.length), 0, removedLine);
          return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
        });
      },
    };
  }

  private async updateFrontmatter(
    path: string,
    field: string,
    value: unknown,
  ): Promise<ActionResult> {
    const file = this.requireFile(path);
    await this.requireConfirmation(
      "更新笔记属性",
      `确认更新“${file.path}”的 frontmatter 字段“${field}”？`,
      "更新",
    );
    let previous: unknown;
    let hadPrevious = false;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const record = frontmatter as Record<string, unknown>;
      hadPrevious = Object.prototype.hasOwnProperty.call(record, field);
      previous = record[field];
      record[field] = value;
    });
    return {
      message: `已更新 ${field}`,
      undo: async () => {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          const record = frontmatter as Record<string, unknown>;
          if (hadPrevious) record[field] = previous;
          else delete record[field];
        });
      },
    };
  }

  private requireFile(path: string): TFile {
    const normalized = normalizeVaultPath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) throw new Error(`找不到文件：${normalized}`);
    return file;
  }

  private async requireConfirmation(
    title: string,
    message: string,
    confirmText: string,
    destructive = false,
  ): Promise<void> {
    if (
      !(await this.confirm(this.app, {
        title,
        message,
        confirmText,
        destructive,
      }))
    ) {
      throw new Error("用户取消了写入操作。");
    }
  }
}

function normalizeVaultPath(path: string): string {
  const normalized = normalizePath(path).replace(/^\/+/u, "");
  if (
    !normalized ||
    normalized.split("/").includes("..") ||
    /^[A-Za-z]:/u.test(normalized)
  ) {
    throw new Error("无效的 Vault 路径。");
  }
  return normalized;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const segments = folder.split("/");
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
