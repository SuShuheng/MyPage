import type { ModuleContribution, ModuleManifest } from "./module-types";

export interface RegisteredContribution {
  moduleId: string;
  moduleVersion: string;
  contribution: ModuleContribution;
}

export class ContributionRegistry {
  private readonly contributions = new Map<string, RegisteredContribution>();

  public registerManifest(manifest: ModuleManifest): void {
    this.unregisterModule(manifest.id);
    for (const contribution of manifest.contributions) {
      const key = contributionKey(manifest.id, contribution.id);
      this.contributions.set(key, {
        moduleId: manifest.id,
        moduleVersion: manifest.version,
        contribution: structuredClone(contribution),
      });
    }
  }

  public get(moduleId: string, contributionId: string) {
    return this.contributions.get(contributionKey(moduleId, contributionId));
  }

  public list(kind?: ModuleContribution["kind"]): RegisteredContribution[] {
    return [...this.contributions.values()].filter(
      (entry) => kind === undefined || entry.contribution.kind === kind,
    );
  }

  public unregisterModule(moduleId: string): void {
    for (const [key, entry] of this.contributions) {
      if (entry.moduleId === moduleId) this.contributions.delete(key);
    }
  }

  public clear(): void {
    this.contributions.clear();
  }
}

function contributionKey(moduleId: string, contributionId: string): string {
  return `${moduleId}:${contributionId}`;
}
