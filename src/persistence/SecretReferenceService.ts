import type { App } from "obsidian";

export class SecretReferenceService {
  public constructor(private readonly app: App) {}

  public set(moduleId: string, key: string, value: string): string {
    const reference = secretId(moduleId, key);
    this.app.secretStorage.setSecret(reference, value);
    return `secret:${reference}`;
  }

  public get(reference: string): string | null {
    const id = reference.replace(/^secret:/u, "");
    if (!id.startsWith("mypage-")) {
      throw new Error("Secret reference does not belong to MyPage.");
    }
    return this.app.secretStorage.getSecret(id);
  }

  public list(): string[] {
    return this.app.secretStorage
      .listSecrets()
      .filter((reference) => reference.startsWith("mypage-"));
  }
}

function secretId(moduleId: string, key: string): string {
  const normalize = (value: string) =>
    value.toLocaleLowerCase().replace(/[^a-z0-9-]/gu, "-").replace(/-+/gu, "-");
  return `mypage-${normalize(moduleId)}-${normalize(key)}`.slice(0, 120);
}
