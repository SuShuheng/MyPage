import type { InstalledModule } from "./module-types";
import { ContributionRegistry } from "./ContributionRegistry";

export class ModuleRegistry {
  private readonly modules = new Map<string, InstalledModule>();
  public readonly contributions = new ContributionRegistry();

  public register(module: InstalledModule): void {
    this.modules.set(module.manifest.id, structuredClone(module));
    if (module.enabled) this.contributions.registerManifest(module.manifest);
  }

  public get(id: string): InstalledModule | undefined {
    const module = this.modules.get(id);
    return module ? structuredClone(module) : undefined;
  }

  public list(): InstalledModule[] {
    return [...this.modules.values()].map((module) => structuredClone(module));
  }

  public setEnabled(id: string, enabled: boolean): void {
    const module = this.modules.get(id);
    if (!module) return;
    module.enabled = enabled;
    if (enabled) this.contributions.registerManifest(module.manifest);
    else this.contributions.unregisterModule(id);
  }

  public unregister(id: string): void {
    this.modules.delete(id);
    this.contributions.unregisterModule(id);
  }

  public dispose(): void {
    this.modules.clear();
    this.contributions.clear();
  }
}
