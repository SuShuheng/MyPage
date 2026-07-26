export type MyPageCapability =
  | "vault.read"
  | "vault.write"
  | "network.request"
  | "externalFs.read"
  | "externalFs.write"
  | "git.read"
  | "git.write"
  | "obsidian.command"
  | "system.exec";

export interface MyPageModuleApi {
  readonly root: HTMLElement;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly config: Readonly<Record<string, unknown>>;
  request<T = unknown>(
    capability: MyPageCapability,
    input: unknown,
  ): Promise<T>;
  onData(listener: (data: unknown) => void): () => void;
  onTheme(
    listener: (theme: Record<string, string | number>) => void,
  ): () => void;
  publishRecords(records: unknown[]): void;
  log(message: unknown): void;
}

export type MyPageModuleActivate = (
  api: MyPageModuleApi,
) => void | Promise<void> | (() => void);

export function defineModule(activate: MyPageModuleActivate): MyPageModuleActivate {
  return activate;
}
