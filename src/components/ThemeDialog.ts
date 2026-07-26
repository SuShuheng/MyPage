import { Modal, Setting, type App } from "obsidian";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface PromptDialogOptions {
  title: string;
  message: string;
  value?: string;
  placeholder?: string;
  confirmText?: string;
  multiline?: boolean;
  validate?: (value: string) => string | undefined;
}

export function confirmDialog(
  app: App,
  options: ConfirmDialogOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    new ThemeDialogModal(app, options, resolve).open();
  });
}

export function promptDialog(
  app: App,
  options: PromptDialogOptions,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    new ThemePromptModal(app, options, resolve).open();
  });
}

class ThemeDialogModal extends Modal {
  private settled = false;

  public constructor(
    app: App,
    private readonly options: ConfirmDialogOptions,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-dialog-modal");
    this.setTitle(this.options.title);
    this.contentEl.createEl("p", {
      text: this.options.message,
      cls: "mypage-dialog-message",
    });
    const footer = this.contentEl.createDiv("mypage-dialog-actions");
    new Setting(footer)
      .addButton((button) =>
        button
          .setButtonText(this.options.cancelText ?? "取消")
          .onClick(() => this.finish(false)),
      )
      .addButton((button) => {
        button
          .setButtonText(this.options.confirmText ?? "确定")
          .onClick(() => this.finish(true));
        if (this.options.destructive) button.setWarning();
        else button.setCta();
        return button;
      });
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }

  private finish(value: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
}

class ThemePromptModal extends Modal {
  private settled = false;
  private inputEl?: HTMLInputElement | HTMLTextAreaElement;
  private errorEl?: HTMLElement;

  public constructor(
    app: App,
    private readonly options: PromptDialogOptions,
    private readonly resolve: (value: string | undefined) => void,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-dialog-modal", "mypage-prompt-modal");
    this.setTitle(this.options.title);
    this.contentEl.createEl("p", {
      text: this.options.message,
      cls: "mypage-dialog-message",
    });
    this.inputEl = this.options.multiline
      ? this.contentEl.createEl("textarea", { cls: "mypage-dialog-input" })
      : this.contentEl.createEl("input", {
          type: "text",
          cls: "mypage-dialog-input",
        });
    this.inputEl.value = this.options.value ?? "";
    this.inputEl.placeholder = this.options.placeholder ?? "";
    this.inputEl.addEventListener("input", () => this.validate());
    this.inputEl.addEventListener("keydown", (event) => {
      if (
        event instanceof KeyboardEvent &&
        event.key === "Enter" &&
        !this.options.multiline
      ) {
        event.preventDefault();
        this.submit();
      }
    });
    this.errorEl = this.contentEl.createDiv({
      cls: "mypage-field-error",
      attr: { role: "alert", "aria-live": "polite" },
    });
    const footer = this.contentEl.createDiv("mypage-dialog-actions");
    new Setting(footer)
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.finish(undefined)),
      )
      .addButton((button) =>
        button
          .setButtonText(this.options.confirmText ?? "确定")
          .setCta()
          .onClick(() => this.submit()),
      );
    window.setTimeout(() => this.inputEl?.focus(), 0);
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(undefined);
    }
  }

  private submit(): void {
    if (!this.inputEl || !this.validate()) return;
    this.finish(this.inputEl.value.trim());
  }

  private validate(): boolean {
    if (!this.inputEl || !this.errorEl) return false;
    const message = this.options.validate?.(this.inputEl.value.trim());
    this.inputEl.toggleClass("has-error", Boolean(message));
    this.inputEl.setAttr("aria-invalid", String(Boolean(message)));
    this.errorEl.setText(message ?? "");
    return !message;
  }

  private finish(value: string | undefined): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
}
